import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { agentmail, toHtml } from "./email";
import { ownedDoc, requireBusiness } from "./lib/access";
import { recordPrice } from "./quotes";

// SRC-25: approve the ranked recommendation (or override per line), generate
// a PO, review it, send it through AgentMail in each supplier's existing
// thread, and track its status. Sending twice is impossible: one PO per RFQ
// and the send mutation refuses anything not in draft.

export const chooseSupplierForLine = mutation({
  args: { rfqLineItemId: v.id("rfqLineItems"), supplierId: v.id("suppliers") },
  handler: async (ctx, { rfqLineItemId, supplierId }) => {
    const business = await requireBusiness(ctx);
    const li = await ownedDoc(ctx, business, "rfqLineItems", rfqLineItemId);
    await ownedDoc(ctx, business, "suppliers", supplierId);
    const po = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_rfq", (q) => q.eq("rfqId", li.rfqId))
      .first();
    if (po && po.status !== "draft") throw new ConvexError("The purchase order was already sent.");
    await ctx.db.patch(rfqLineItemId, { chosenSupplierId: supplierId, chosenByOwner: true });
    if (po) await ctx.db.delete(po._id);
  },
});

export const generate = mutation({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const business = await requireBusiness(ctx);
    const rfq = await ownedDoc(ctx, business, "rfqs", rfqId);
    const existing = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .first();
    if (existing && existing.status !== "draft") {
      throw new ConvexError("A purchase order was already sent for this RFQ.");
    }
    const lineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .collect();
    const lines = [];
    for (const li of lineItems) {
      if (!li.chosenSupplierId) {
        throw new ConvexError(`Pick a supplier for ${li.productName} first.`);
      }
      const quote = await latestParsedQuote(ctx, rfqId, li.chosenSupplierId);
      const priced = quote
        ? (
            await ctx.db
              .query("quoteLineItems")
              .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
              .collect()
          ).find((l) => l.rfqLineItemId === li._id)
        : undefined;
      if (!priced) {
        throw new ConvexError(`The chosen supplier did not quote ${li.productName}.`);
      }
      lines.push({
        supplierId: li.chosenSupplierId,
        rfqLineItemId: li._id,
        productName: li.productName,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: priced.unitPrice,
        currency: priced.currency,
      });
    }
    const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${rfq._id.slice(-4).toUpperCase()}`;
    if (existing) {
      await ctx.db.patch(existing._id, { lines, total, currency: business.currency, poNumber });
      return existing._id;
    }
    return await ctx.db.insert("purchaseOrders", {
      businessId: business._id,
      rfqId,
      poNumber,
      status: "draft",
      lines,
      total,
      currency: business.currency,
      sends: [],
    });
  },
});

async function latestParsedQuote(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  rfqId: Id<"rfqs">,
  supplierId: Id<"suppliers">,
) {
  const quotes = await ctx.db
    .query("quotes")
    .withIndex("by_rfq_supplier", (q) => q.eq("rfqId", rfqId).eq("supplierId", supplierId))
    .collect();
  return quotes
    .filter((q) => q.parseStatus === "parsed" || q.parseStatus === "needs_review")
    .sort((a, b) => b.receivedAt - a.receivedAt)[0];
}

export const send = mutation({
  args: { poId: v.id("purchaseOrders") },
  handler: async (ctx, { poId }) => {
    const business = await requireBusiness(ctx);
    const po = await ownedDoc(ctx, business, "purchaseOrders", poId);
    if (po.status !== "draft") throw new ConvexError("This purchase order was already sent.");
    if (!business.agentInboxId) throw new ConvexError("Sourcing inbox is not ready.");
    const rfq = await ctx.db.get(po.rfqId);
    if (!rfq) throw new ConvexError("RFQ not found.");
    // Lock first so a double click cannot send twice.
    await ctx.db.patch(poId, { status: "sending" });

    const bySupplier = new Map<Id<"suppliers">, typeof po.lines>();
    for (const line of po.lines) {
      bySupplier.set(line.supplierId, [...(bySupplier.get(line.supplierId) ?? []), line]);
    }
    const sends: Array<{ supplierId: Id<"suppliers">; outboundId: string; threadId?: string }> = [];
    for (const [supplierId, lines] of bySupplier) {
      const supplier = await ctx.db.get(supplierId);
      if (!supplier?.email) continue;
      const rs = await ctx.db
        .query("rfqSuppliers")
        .withIndex("by_rfq_supplier", (q) => q.eq("rfqId", po.rfqId).eq("supplierId", supplierId))
        .unique();
      const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const text =
        `Hi ${supplier.name},\n\n` +
        `Thank you for your quote. Please treat this as our purchase order ${po.poNumber} from ${business.name}.\n\n` +
        lines
          .map((l) => `- ${l.productName}: ${l.quantity} ${l.unit} at ${l.currency} ${l.unitPrice} per ${l.unit} = ${l.currency} ${(l.unitPrice * l.quantity).toFixed(2)}`)
          .join("\n") +
        `\n\nOrder total: ${business.currency} ${subtotal.toFixed(2)}\n` +
        `Delivery: ${rfq.deliveryWindow}. ${business.deliveryPreferences}\n\n` +
        `Please confirm by replying to this email.\n\nThanks,\n${business.name}`;
      // Reply to the supplier's latest message in the thread so the PO goes
      // back to them, and name the recipient explicitly.
      const latestQuote = await latestParsedQuote(ctx, po.rfqId, supplierId);
      const parentMessageId = latestQuote?.messageId ?? rs?.sentMessageId;
      const args = {
        to: supplier.email,
        text,
        html: toHtml(text),
        labels: ["purchase-order", `rfq:${po.rfqId}`],
      };
      const outboundId = parentMessageId
        ? await agentmail.replyToMessage(ctx, business.agentInboxId, parentMessageId, args)
        : await agentmail.sendMessage(ctx, business.agentInboxId, {
            subject: `Purchase order ${po.poNumber} from ${business.name}`,
            ...args,
          });
      sends.push({ supplierId, outboundId, threadId: rs?.threadId });
      for (const l of lines) {
        await recordPrice(ctx, {
          businessId: business._id,
          supplierId,
          productName: l.productName,
          unitPrice: l.unitPrice,
          currency: l.currency,
          unit: l.unit,
          source: "order",
        });
      }
    }
    await ctx.db.patch(poId, { status: "sent", sends, sentAt: Date.now() });
    if (rfq.status !== "closed") {
      await ctx.scheduler.runAfter(0, internal.purchaseOrders.closeAfterOrder, { rfqId: po.rfqId });
    }
  },
});

export const closeAfterOrder = internalMutation({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const rfq = await ctx.db.get(rfqId);
    if (rfq && rfq.status !== "closed") {
      await ctx.db.patch(rfqId, { status: "closed", closedAt: Date.now(), ownerNotifiedAt: Date.now() });
    }
  },
});

export const get = query({
  args: { poId: v.id("purchaseOrders") },
  handler: async (ctx, { poId }) => {
    const business = await requireBusiness(ctx);
    const po = await ownedDoc(ctx, business, "purchaseOrders", poId);
    const suppliers = new Map<string, string>();
    for (const l of po.lines) {
      if (!suppliers.has(l.supplierId)) {
        const s = await ctx.db.get(l.supplierId);
        suppliers.set(l.supplierId, s?.name ?? "Supplier");
      }
    }
    return {
      ...po,
      lines: po.lines.map((l) => ({ ...l, supplierName: suppliers.get(l.supplierId) ?? "Supplier" })),
    };
  },
});
