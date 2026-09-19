import { WorkflowManager, vWorkflowId } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 5,
    defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 2000, base: 2 },
    retryActionsByDefault: true,
  },
});

const SEND_POLL_MS = 4000;
const SEND_POLL_ATTEMPTS = 45;

/**
 * SRC-19: the full RFQ lifecycle as one durable job.
 *   send to every supplier -> confirm each landed -> open -> follow up
 *   silent suppliers -> close at reply-by -> final ranking.
 * Restarts and deploys replay the step history, so nothing is sent twice.
 */
export const rfqLifecycle = workflow
  .define({ args: { rfqId: v.id("rfqs") } })
  .handler(async (step, { rfqId }): Promise<void> => {
    const rows: Doc<"rfqSuppliers">[] = await step.runQuery(internal.rfqs.supplierRows, { rfqId });

    // 1. Fan out. Each mutation is exactly-once and idempotent on outboundId.
    await Promise.all(
      rows.map((row) =>
        step.runMutation(internal.email.sendRfqToSupplier, { rfqSupplierId: row._id }),
      ),
    );

    // 2. Wait for the component's durable sender to report each send.
    await Promise.all(rows.map((row) => confirmSend(step, row._id)));

    await step.runMutation(internal.rfqs.markOpen, { rfqId });

    // 3. Follow up with suppliers still silent after the configured delay,
    //    but never after the reply-by time.
    const rfq: Doc<"rfqs"> | null = await step.runQuery(internal.rfqs.getInternal, { rfqId });
    if (!rfq) return;
    const now = Date.now();
    const followUpAt = Math.min(now + rfq.followUpAfterMs, rfq.replyByAt - 60_000);
    if (followUpAt > now) {
      await step.sleep(followUpAt - now, { name: "wait for follow-up window" });
      const current: Doc<"rfqSuppliers">[] = await step.runQuery(internal.rfqs.supplierRows, { rfqId });
      await Promise.all(
        current
          .filter((r) => r.status === "sent" && !r.followUpOutboundId)
          .map((r) => step.runMutation(internal.email.sendFollowUp, { rfqSupplierId: r._id })),
      );
    }

    // 4. Close at the reply-by deadline and rank whatever arrived.
    const remaining = rfq.replyByAt - Date.now();
    if (remaining > 0) await step.sleep(remaining, { name: "wait for reply-by" });
    await step.runMutation(internal.rfqs.closeIfOpen, {
      rfqId,
      reason: "reply-by deadline reached",
    });
  });

async function confirmSend(
  step: Parameters<Parameters<ReturnType<typeof workflow.define>["handler"]>[0]>[0],
  rfqSupplierId: Id<"rfqSuppliers">,
) {
  for (let attempt = 0; attempt < SEND_POLL_ATTEMPTS; attempt++) {
    const rows: { status: string; outboundId: string | null } | null = await step.runQuery(internal.workflow.sendState, { rfqSupplierId });
    if (!rows) return;
    if (rows.status === "failed" || rows.status === "replied" || rows.status === "parsed") return;
    if (!rows.outboundId) return;
    const st: { status: string; agentmailMessageId: string | null; threadId: string | null; errorMessage: string | null } | null = await step.runQuery(internal.email.outboundStatus, { outboundId: rows.outboundId });
    if (!st) return;
    if (st.status === "sent" || st.status === "delivered") {
      await step.runMutation(internal.email.recordSent, {
        rfqSupplierId,
        threadId: st.threadId ?? "",
        messageId: st.agentmailMessageId ?? "",
      });
      return;
    }
    if (st.status === "failed" || st.status === "bounced" || st.status === "rejected") {
      await step.runMutation(internal.email.recordSendFailure, {
        rfqSupplierId,
        error: st.errorMessage ?? `AgentMail reported ${st.status}`,
      });
      return;
    }
    await step.sleep(SEND_POLL_MS, { name: `send poll ${attempt + 1}` });
  }
  await step.runMutation(internal.email.recordSendFailure, {
    rfqSupplierId,
    error: "Send did not confirm within the wait window.",
  });
}

export const sendState = internalQuery({
  args: { rfqSupplierId: v.id("rfqSuppliers") },
  handler: async (ctx, { rfqSupplierId }) => {
    const row = await ctx.db.get(rfqSupplierId);
    return row ? { status: row.status, outboundId: row.outboundId ?? null } : null;
  },
});

export const onLifecycleComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ rfqId: v.id("rfqs") }),
  },
  handler: async (ctx, { result, context }) => {
    if (result.kind === "failed") {
      console.error(`RFQ ${context.rfqId} workflow failed: ${result.error}`);
    }
    // Whatever happened, the RFQ must not be left in "sending".
    const rfq = await ctx.db.get(context.rfqId);
    if (rfq && rfq.status === "sending") {
      await ctx.db.patch(rfq._id, { status: "open" });
    }
  },
});
