import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { agentmail, toHtml } from "./email";

/**
 * SRC-21: when an RFQ closes, email the owner a summary from the business's
 * sourcing inbox and stamp the RFQ so the UI can show the notification.
 */
export const rfqClosed = internalMutation({
  args: { rfqId: v.id("rfqs"), reason: v.string() },
  handler: async (ctx, { rfqId, reason }) => {
    const rfq = await ctx.db.get(rfqId);
    if (!rfq || rfq.ownerNotifiedAt) return;
    const business = await ctx.db.get(rfq.businessId);
    if (!business) return;
    const owner = await ctx.db.get(business.ownerUserId);
    const sends = await ctx.db
      .query("rfqSuppliers")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .collect();
    const replied = sends.filter((s) => s.status === "replied" || s.status === "parsed").length;
    const siteUrl = process.env.SITE_URL ?? "";
    const text =
      `Your RFQ "${rfq.title}" is now closed (${reason}).\n\n` +
      `${replied} of ${sends.length} suppliers replied. ` +
      `Open Sourcer to review the ranked quotes and approve a purchase order.\n\n` +
      `${siteUrl}/rfqs/${rfqId}\n\n` +
      `Sourcer for ${business.name}`;
    if (owner?.email && business.agentInboxId) {
      await agentmail.sendMessage(ctx, business.agentInboxId, {
        to: owner.email,
        subject: `RFQ closed: ${rfq.title}`,
        text,
        html: toHtml(text),
        labels: ["owner-notification", `rfq:${rfqId}`],
      });
    }
    await ctx.db.patch(rfqId, { ownerNotifiedAt: Date.now() });
  },
});
