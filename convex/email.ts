import { AgentMail } from "@agentmail/convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { requireBusiness } from "./lib/access";

// The AgentMail component owns inbox state, durable sending (workpool with
// retries) and Svix-verified, deduplicated webhook ingest. Our callbacks below
// turn inbound mail into RFQ replies.
export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onMessageReceived,
  onEvent: internal.email.onEvent,
});

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

// ---------------------------------------------------------------------------
// Inbox provisioning (SRC-6)
// ---------------------------------------------------------------------------

export const provisionInbox = internalAction({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await ctx.runQuery(internal.email.getBusiness, { businessId });
    if (!business) return;
    if (business.agentInboxId) return;
    const suffix = businessId.slice(-6).toLowerCase();
    const key = process.env.AGENTMAIL_API_KEY;
    if (!key) throw new Error("AGENTMAIL_API_KEY is not set on this deployment.");
    const base = process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0";
    const res = await fetch(`${base}/inboxes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `${slug(business.name) || "sourcer"}-${suffix}`,
        display_name: `${business.name} via Sourcer`,
        client_id: `sourcer-${businessId}`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      const friendly = body.includes("limit_exceeded")
        ? "The AgentMail plan's inbox limit is reached. Free a slot or upgrade the plan, then retry from Settings."
        : `AgentMail could not create the inbox (HTTP ${res.status}).`;
      await ctx.runMutation(internal.businesses.setInboxError, { businessId, error: friendly });
      throw new Error(`AgentMail inbox creation failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    const inbox = (await res.json()) as { inbox_id: string };
    await ctx.runMutation(internal.businesses.setInbox, { businessId, inboxId: inbox.inbox_id });
  },
});

export const getBusiness = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => ctx.db.get(businessId),
});

// ---------------------------------------------------------------------------
// Outbound RFQ sends (SRC-8). Called from the RFQ workflow, one supplier per
// mutation, exactly once per rfqSuppliers row.
// ---------------------------------------------------------------------------

export const sendRfqToSupplier = internalMutation({
  args: { rfqSupplierId: v.id("rfqSuppliers") },
  handler: async (ctx, { rfqSupplierId }) => {
    const row = await ctx.db.get(rfqSupplierId);
    if (!row) return { skipped: "missing" as const };
    // Idempotent: a retry never enqueues a second send.
    if (row.outboundId) return { skipped: "already_sent" as const };
    const [rfq, supplier, business] = await Promise.all([
      ctx.db.get(row.rfqId),
      ctx.db.get(row.supplierId),
      ctx.db.get(row.businessId),
    ]);
    if (!rfq || !supplier || !business?.agentInboxId || !supplier.email) {
      await ctx.db.patch(rfqSupplierId, {
        status: "failed",
        lastError: "Supplier has no email or business inbox is not ready.",
      });
      return { skipped: "unsendable" as const };
    }
    const subject = personalise(rfq.draftSubject ?? `Request for quote: ${rfq.title}`, supplier, business);
    const text = personalise(rfq.draftBody ?? "", supplier, business);
    const outboundId = await agentmail.sendMessage(ctx, business.agentInboxId, {
      to: supplier.email,
      subject,
      text,
      html: toHtml(text),
      labels: ["rfq", `rfq:${rfq._id}`, `supplier:${supplier._id}`],
    });
    await ctx.db.patch(rfqSupplierId, { outboundId, lastError: undefined });
    return { outboundId };
  },
});

function personalise(body: string, supplier: Doc<"suppliers">, business: Doc<"businesses">) {
  return body
    .replaceAll("{{supplier}}", supplier.name)
    .replaceAll("{{business}}", business.name);
}

export function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${escaped}</div>`;
}

/** Reactive delivery status straight from the component. */
export const outboundStatus = internalQuery({
  args: { outboundId: v.string() },
  handler: async (ctx, { outboundId }) =>
    agentmail.status(ctx, outboundId as never),
});

/** Record the AgentMail thread once the component reports the send landed. */
export const recordSent = internalMutation({
  args: {
    rfqSupplierId: v.id("rfqSuppliers"),
    threadId: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, { rfqSupplierId, threadId, messageId }) => {
    const row = await ctx.db.get(rfqSupplierId);
    if (!row) return;
    if (row.status === "queued" || row.status === "failed") {
      await ctx.db.patch(rfqSupplierId, {
        status: "sent",
        threadId,
        sentMessageId: messageId,
        sentAt: Date.now(),
        lastError: undefined,
      });
    } else if (!row.threadId) {
      await ctx.db.patch(rfqSupplierId, { threadId, sentMessageId: messageId });
    }
    const business = await ctx.db.get(row.businessId);
    const existing = await ctx.db
      .query("emailThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    if (!existing) {
      await ctx.db.insert("emailThreads", {
        businessId: row.businessId,
        rfqId: row.rfqId,
        supplierId: row.supplierId,
        inboxId: business?.agentInboxId ?? "",
        threadId,
        lastOutboundMessageId: messageId,
        inboundCount: 0,
        outboundCount: 1,
        lastActivityAt: Date.now(),
      });
    }
  },
});

export const recordSendFailure = internalMutation({
  args: { rfqSupplierId: v.id("rfqSuppliers"), error: v.string() },
  handler: async (ctx, { rfqSupplierId, error }) => {
    const row = await ctx.db.get(rfqSupplierId);
    if (!row || row.status === "replied" || row.status === "parsed") return;
    await ctx.db.patch(rfqSupplierId, { status: "failed", lastError: error });
  },
});

// ---------------------------------------------------------------------------
// Follow-up nudges (SRC-20) and purchase-order replies (SRC-25) reuse the
// original thread by replying to the message we sent.
// ---------------------------------------------------------------------------

export const sendFollowUp = internalMutation({
  args: { rfqSupplierId: v.id("rfqSuppliers") },
  handler: async (ctx, { rfqSupplierId }) => {
    const row = await ctx.db.get(rfqSupplierId);
    if (!row) return { sent: false, reason: "missing" };
    if (row.status !== "sent") return { sent: false, reason: `status ${row.status}` };
    if (row.followUpOutboundId) return { sent: false, reason: "already_followed_up" };
    const [rfq, supplier, business] = await Promise.all([
      ctx.db.get(row.rfqId),
      ctx.db.get(row.supplierId),
      ctx.db.get(row.businessId),
    ]);
    if (!rfq || rfq.status !== "open") return { sent: false, reason: "rfq_not_open" };
    if (!supplier || !business?.agentInboxId || !row.sentMessageId) {
      return { sent: false, reason: "no_thread" };
    }
    const replyBy = new Date(rfq.replyByAt).toUTCString();
    const text =
      `Hi ${supplier.name},\n\n` +
      `A quick nudge on the quote request from ${business.name} for "${rfq.title}". ` +
      `We are finalising the order and would love to include you. ` +
      `If you can reply with prices, availability and lead time by ${replyBy}, we will consider your quote.\n\n` +
      `Thanks,\n${business.name}`;
    // Replying to our own message would address it back to us, so name the
    // supplier as the recipient explicitly; the thread headers still match.
    const outboundId = await agentmail.replyToMessage(
      ctx,
      business.agentInboxId,
      row.sentMessageId,
      { to: supplier.email, text, html: toHtml(text), labels: ["rfq-followup", `rfq:${rfq._id}`] },
    );
    await ctx.db.patch(rfqSupplierId, {
      followUpOutboundId: outboundId,
      followUpSentAt: Date.now(),
    });
    return { sent: true };
  },
});

// ---------------------------------------------------------------------------
// Inbound (SRC-7, SRC-9). The component verifies the Svix signature and
// dedupes by event_id before calling this. We still dedupe by message id so a
// replayed message can never create a second quote row.
// ---------------------------------------------------------------------------

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, { message }) => {
    const inboxId: string = message.inbox_id;
    const threadId: string = message.thread_id;
    const messageId: string = message.message_id;
    const fromAddress: string = message.from ?? "";
    const subject: string = message.subject ?? "";
    const text: string =
      message.extracted_text || message.text || stripHtml(message.html ?? "");
    const receivedAt = message.timestamp ? Date.parse(message.timestamp) : Date.now();

    const duplicate = await ctx.db
      .query("quotes")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .first();
    if (duplicate) return;

    const thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();

    if (!thread) {
      const alreadyQuarantined = await ctx.db
        .query("quarantine")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .first();
      if (alreadyQuarantined) return;
      const business = await ctx.db
        .query("businesses")
        .withIndex("by_inbox", (q) => q.eq("agentInboxId", inboxId))
        .unique();
      await ctx.db.insert("quarantine", {
        businessId: business?._id,
        inboxId,
        threadId,
        messageId,
        fromAddress,
        subject,
        text: text.slice(0, 20_000),
        reason: "No RFQ thread matches this conversation.",
        receivedAt,
      });
      return;
    }

    const rfq = await ctx.db.get(thread.rfqId);
    const isLate = !rfq || rfq.status === "closed";

    const quoteId = await ctx.db.insert("quotes", {
      businessId: thread.businessId,
      rfqId: thread.rfqId,
      supplierId: thread.supplierId,
      threadId,
      messageId,
      rawText: text.slice(0, 50_000),
      parseStatus: "pending",
      isLate,
      receivedAt,
    });

    await ctx.db.patch(thread._id, {
      lastInboundMessageId: messageId,
      inboundCount: thread.inboundCount + 1,
      lastActivityAt: receivedAt,
    });

    const rfqSupplier = await ctx.db
      .query("rfqSuppliers")
      .withIndex("by_rfq_supplier", (q) =>
        q.eq("rfqId", thread.rfqId).eq("supplierId", thread.supplierId),
      )
      .unique();
    if (rfqSupplier && rfqSupplier.status !== "parsed") {
      await ctx.db.patch(rfqSupplier._id, {
        status: "replied",
        repliedAt: rfqSupplier.repliedAt ?? receivedAt,
      });
    }

    // Attachments (SRC-10) are fetched before parsing so a PDF price sheet
    // feeds the parser. The parse action waits on this row set.
    const attachments: Array<{
      attachment_id: string;
      filename?: string;
      content_type?: string;
      size?: number;
    }> = Array.isArray(message.attachments) ? message.attachments : [];
    await ctx.scheduler.runAfter(0, internal.attachments.ingestForQuote, {
      quoteId,
      inboxId,
      messageId,
      attachments: attachments.map((a) => ({
        attachmentId: a.attachment_id,
        filename: a.filename ?? "attachment",
        contentType: a.content_type ?? "application/octet-stream",
        size: a.size ?? 0,
      })),
      maxBytes: MAX_ATTACHMENT_BYTES,
    });
  },
});

/** Delivery lifecycle events: mark bounces and rejections as failed sends. */
export const onEvent = internalMutation({
  args: { event: v.any(), eventId: v.string() },
  handler: async (ctx, { event }) => {
    const type: string = event.event_type;
    if (type !== "message.bounced" && type !== "message.rejected") return;
    const payload = event.bounce ?? event.reject ?? {};
    const messageId: string | undefined = payload.message_id;
    if (!messageId) return;
    const rows = await ctx.db
      .query("rfqSuppliers")
      .filter((q) => q.eq(q.field("sentMessageId"), messageId))
      .take(5);
    for (const row of rows) {
      if (row.status === "sent" || row.status === "queued") {
        await ctx.db.patch(row._id, {
          status: "failed",
          lastError:
            type === "message.bounced"
              ? `Bounced: ${payload.type ?? "unknown"}`
              : `Rejected: ${payload.reason ?? "unknown"}`,
        });
      }
    }
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Owner-facing reactive views
// ---------------------------------------------------------------------------

export const quarantineList = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const rows = await ctx.db
      .query("quarantine")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      _id: r._id,
      fromAddress: r.fromAddress,
      subject: r.subject,
      preview: r.text.slice(0, 240),
      reason: r.reason,
      receivedAt: r.receivedAt,
    }));
  },
});

export const threadMessages = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const business = await requireBusiness(ctx);
    const thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    if (!thread || thread.businessId !== business._id) return [];
    const inbound = await ctx.runQuery(components.agentmail.lib.listInboundMessages, {
      threadId,
    });
    return (inbound as Array<Record<string, unknown>>).map((m) => ({
      messageId: m.messageId ?? m.message_id,
      from: m.from,
      subject: m.subject,
      text: (m.extractedText ?? m.text ?? "") as string,
      receivedAt: m.timestamp ?? m._creationTime,
    }));
  },
});

export type InboundAttachment = {
  attachmentId: string;
  filename: string;
  contentType: string;
  size: number;
};

export const _types = { businessId: undefined as unknown as Id<"businesses"> };
