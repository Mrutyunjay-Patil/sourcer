import { start } from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { canonicalName, ownedDoc, requireBusiness } from "./lib/access";
import { workflow } from "./workflow";

const lineItemInput = v.object({
  productName: v.string(),
  quantity: v.number(),
  unit: v.string(),
  notes: v.optional(v.string()),
});

// ---------------------------------------------------------------------------
// Create (SRC-23) and draft (SRC-16)
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    rawRequest: v.string(),
    lineItems: v.array(lineItemInput),
    deliveryWindow: v.string(),
    replyByAt: v.number(),
    followUpAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const business = await requireBusiness(ctx);
    if (args.lineItems.length === 0) {
      throw new ConvexError("Add at least one item.");
    }
    for (const li of args.lineItems) {
      if (!li.productName.trim()) throw new ConvexError("Every item needs a name.");
      if (!(li.quantity > 0)) throw new ConvexError(`Set a quantity for ${li.productName}.`);
      if (!li.unit.trim()) throw new ConvexError(`Set a unit for ${li.productName}.`);
    }
    if (args.replyByAt <= Date.now() + 60_000) {
      throw new ConvexError("Reply-by time must be in the future.");
    }
    const title =
      args.title?.trim() ||
      args.lineItems
        .slice(0, 3)
        .map((l) => l.productName.trim())
        .join(", ") + (args.lineItems.length > 3 ? ` +${args.lineItems.length - 3}` : "");
    const rfqId = await ctx.db.insert("rfqs", {
      businessId: business._id,
      title,
      status: "draft",
      rawRequest: args.rawRequest,
      deliveryWindow: args.deliveryWindow.trim() || "this week",
      replyByAt: args.replyByAt,
      followUpAfterMs: args.followUpAfterMs ?? 24 * 60 * 60 * 1000,
    });
    for (const li of args.lineItems) {
      const canonical = canonicalName(li.productName);
      await ctx.db.insert("rfqLineItems", {
        businessId: business._id,
        rfqId,
        productName: li.productName.trim(),
        canonicalName: canonical,
        quantity: li.quantity,
        unit: li.unit.trim(),
        notes: li.notes?.trim() || undefined,
      });
      await upsertProduct(ctx, business._id, li.productName.trim(), canonical, li.unit.trim());
    }
    await ctx.scheduler.runAfter(0, internal.ai.draftRfq, { rfqId });
    return rfqId;
  },
});

async function upsertProduct(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  name: string,
  canonical: string,
  unit: string,
) {
  const existing = await ctx.db
    .query("products")
    .withIndex("by_business_canonical", (q) =>
      q.eq("businessId", businessId).eq("canonicalName", canonical),
    )
    .first();
  if (!existing) {
    await ctx.db.insert("products", { businessId, name, canonicalName: canonical, unit });
  }
}

export const setDraft = internalMutation({
  args: {
    rfqId: v.id("rfqs"),
    subject: v.string(),
    body: v.string(),
    source: v.union(v.literal("ai"), v.literal("owner")),
  },
  handler: async (ctx, { rfqId, subject, body, source }) => {
    const rfq = await ctx.db.get(rfqId);
    if (!rfq) return;
    // Never overwrite an owner edit with a late model result.
    if (source === "ai" && rfq.draftBody) return;
    await ctx.db.patch(rfqId, { draftSubject: subject, draftBody: body });
  },
});

export const updateDraft = mutation({
  args: { rfqId: v.id("rfqs"), subject: v.string(), body: v.string() },
  handler: async (ctx, { rfqId, subject, body }) => {
    const business = await requireBusiness(ctx);
    const rfq = await ownedDoc(ctx, business, "rfqs", rfqId);
    if (rfq.status !== "draft") throw new ConvexError("This RFQ has already been sent.");
    if (!body.trim()) throw new ConvexError("The email body cannot be empty.");
    await ctx.db.patch(rfqId, { draftSubject: subject.trim(), draftBody: body.trim() });
  },
});

export const regenerateDraft = mutation({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const business = await requireBusiness(ctx);
    const rfq = await ownedDoc(ctx, business, "rfqs", rfqId);
    if (rfq.status !== "draft") throw new ConvexError("This RFQ has already been sent.");
    await ctx.db.patch(rfqId, { draftSubject: undefined, draftBody: undefined });
    await ctx.scheduler.runAfter(0, internal.ai.draftRfq, { rfqId });
  },
});

export const updateLineItems = mutation({
  args: { rfqId: v.id("rfqs"), lineItems: v.array(lineItemInput) },
  handler: async (ctx, { rfqId, lineItems }) => {
    const business = await requireBusiness(ctx);
    const rfq = await ownedDoc(ctx, business, "rfqs", rfqId);
    if (rfq.status !== "draft") throw new ConvexError("This RFQ has already been sent.");
    const existing = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const li of lineItems) {
      const canonical = canonicalName(li.productName);
      await ctx.db.insert("rfqLineItems", {
        businessId: business._id,
        rfqId,
        productName: li.productName.trim(),
        canonicalName: canonical,
        quantity: li.quantity,
        unit: li.unit.trim(),
        notes: li.notes?.trim() || undefined,
      });
      await upsertProduct(ctx, business._id, li.productName.trim(), canonical, li.unit.trim());
    }
  },
});

// ---------------------------------------------------------------------------
// Send (SRC-8, SRC-19): fan out to N suppliers under one durable workflow
// ---------------------------------------------------------------------------

export const send = mutation({
  args: { rfqId: v.id("rfqs"), supplierIds: v.array(v.id("suppliers")) },
  handler: async (ctx, { rfqId, supplierIds }) => {
    const business = await requireBusiness(ctx);
    const rfq = await ownedDoc(ctx, business, "rfqs", rfqId);
    if (rfq.status !== "draft") throw new ConvexError("This RFQ has already been sent.");
    if (!rfq.draftBody) throw new ConvexError("Wait for the draft to finish, then review it.");
    if (!business.agentInboxId) {
      throw new ConvexError("Your sourcing inbox is still being created. Try again in a moment.");
    }
    const unique = Array.from(new Set(supplierIds));
    if (unique.length === 0) throw new ConvexError("Pick at least one supplier.");
    for (const supplierId of unique) {
      const supplier = await ownedDoc(ctx, business, "suppliers", supplierId);
      if (supplier.status !== "accepted" || !supplier.email) {
        throw new ConvexError(`${supplier.name} is not an accepted supplier with an email.`);
      }
      await ctx.db.insert("rfqSuppliers", {
        businessId: business._id,
        rfqId,
        supplierId,
        status: "queued",
      });
    }
    await ctx.db.patch(rfqId, { status: "sending" });
    const workflowId = await start(
      ctx,
      internal.workflow.rfqLifecycle,
      { rfqId },
      { onComplete: internal.workflow.onLifecycleComplete, context: { rfqId } },
    );
    await ctx.db.patch(rfqId, { workflowId });
  },
});

export const markOpen = internalMutation({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const rfq = await ctx.db.get(rfqId);
    if (rfq && rfq.status === "sending") await ctx.db.patch(rfqId, { status: "open" });
  },
});

/** SRC-21: close and kick off the final ranking plus owner notification. */
export const closeIfOpen = internalMutation({
  args: { rfqId: v.id("rfqs"), reason: v.string() },
  handler: async (ctx, { rfqId, reason }) => {
    const rfq = await ctx.db.get(rfqId);
    if (!rfq || rfq.status === "closed") return { closed: false };
    await ctx.db.patch(rfqId, { status: "closed", closedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.ai.rankQuotes, { rfqId });
    await ctx.scheduler.runAfter(2000, internal.notify.rfqClosed, { rfqId, reason });
    return { closed: true };
  },
});

export const closeNow = mutation({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const business = await requireBusiness(ctx);
    const rfq = await ownedDoc(ctx, business, "rfqs", rfqId);
    if (rfq.status !== "open" && rfq.status !== "sending") {
      throw new ConvexError("Only an open RFQ can be closed.");
    }
    await ctx.db.patch(rfqId, { status: "closed", closedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.ai.rankQuotes, { rfqId });
    await ctx.scheduler.runAfter(2000, internal.notify.rfqClosed, {
      rfqId,
      reason: "closed by owner",
    });
  },
});

/** Cron target: close every open RFQ whose reply-by time has passed. */
export const closeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("rfqs")
      .withIndex("by_status_replyBy", (q) => q.eq("status", "open").lt("replyByAt", now))
      .take(50);
    for (const rfq of expired) {
      await ctx.db.patch(rfq._id, { status: "closed", closedAt: now });
      await ctx.scheduler.runAfter(0, internal.ai.rankQuotes, { rfqId: rfq._id });
      await ctx.scheduler.runAfter(2000, internal.notify.rfqClosed, {
        rfqId: rfq._id,
        reason: "reply-by deadline passed",
      });
    }
    return expired.length;
  },
});

// ---------------------------------------------------------------------------
// Internal reads for actions and the workflow
// ---------------------------------------------------------------------------

export const bundleForAi = internalQuery({
  args: { rfqId: v.id("rfqs") },
  handler: async (
    ctx,
    { rfqId },
  ): Promise<{ rfq: Doc<"rfqs">; business: Doc<"businesses">; lineItems: Doc<"rfqLineItems">[] } | null> => {
    const rfq = await ctx.db.get(rfqId);
    if (!rfq) return null;
    const business = await ctx.db.get(rfq.businessId);
    if (!business) return null;
    const lineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .collect();
    return { rfq, business, lineItems };
  },
});

export const getInternal = internalQuery({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }): Promise<Doc<"rfqs"> | null> => ctx.db.get(rfqId),
});

export const supplierRows = internalQuery({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }): Promise<Doc<"rfqSuppliers">[]> =>
    ctx.db
      .query("rfqSuppliers")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .collect(),
});

// ---------------------------------------------------------------------------
// Owner-facing reactive views (SRC-24 live quote board, SRC-26 history)
// ---------------------------------------------------------------------------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const rfqs = await ctx.db
      .query("rfqs")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .order("desc")
      .take(100);
    return Promise.all(
      rfqs.map(async (rfq) => {
        const sends = await ctx.db
          .query("rfqSuppliers")
          .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
          .collect();
        const po = await ctx.db
          .query("purchaseOrders")
          .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
          .first();
        return {
          _id: rfq._id,
          _creationTime: rfq._creationTime,
          title: rfq.title,
          status: rfq.status,
          replyByAt: rfq.replyByAt,
          closedAt: rfq.closedAt,
          supplierCount: sends.length,
          repliedCount: sends.filter((s) => s.status === "replied" || s.status === "parsed").length,
          poStatus: po?.status ?? null,
          poTotal: po?.total ?? null,
          currency: po?.currency ?? business.currency,
        };
      }),
    );
  },
});

export const board = query({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const business = await requireBusiness(ctx);
    const rfq = await ownedDoc(ctx, business, "rfqs", rfqId);
    const [lineItems, sends, quotes, po] = await Promise.all([
      ctx.db.query("rfqLineItems").withIndex("by_rfq", (q) => q.eq("rfqId", rfqId)).collect(),
      ctx.db.query("rfqSuppliers").withIndex("by_rfq", (q) => q.eq("rfqId", rfqId)).collect(),
      ctx.db.query("quotes").withIndex("by_rfq", (q) => q.eq("rfqId", rfqId)).collect(),
      ctx.db.query("purchaseOrders").withIndex("by_rfq", (q) => q.eq("rfqId", rfqId)).first(),
    ]);
    const suppliers = await Promise.all(
      sends.map(async (s) => {
        const supplier = await ctx.db.get(s.supplierId);
        const supplierQuotes = quotes
          .filter((q) => q.supplierId === s.supplierId)
          .sort((a, b) => b.receivedAt - a.receivedAt);
        const latest = supplierQuotes[0];
        const lines = latest
          ? await ctx.db
              .query("quoteLineItems")
              .withIndex("by_quote", (q) => q.eq("quoteId", latest._id))
              .collect()
          : [];
        const attachments = latest
          ? await ctx.db
              .query("quoteAttachments")
              .withIndex("by_quote", (q) => q.eq("quoteId", latest._id))
              .collect()
          : [];
        return {
          rfqSupplierId: s._id,
          supplierId: s.supplierId,
          name: supplier?.name ?? "Unknown supplier",
          email: supplier?.email ?? null,
          sendStatus: s.status,
          sentAt: s.sentAt ?? null,
          repliedAt: s.repliedAt ?? null,
          followUpSentAt: s.followUpSentAt ?? null,
          lastError: s.lastError ?? null,
          threadId: s.threadId ?? null,
          quote: latest
            ? {
                _id: latest._id,
                parseStatus: latest.parseStatus,
                confidence: latest.confidence ?? null,
                parseNotes: latest.parseNotes ?? null,
                leadTimeDays: latest.leadTimeDays ?? null,
                validUntil: latest.validUntil ?? null,
                deliveryFee: latest.deliveryFee ?? null,
                landedTotal: latest.landedTotal ?? null,
                coverage: latest.coverage ?? null,
                rank: latest.rank ?? null,
                rationale: latest.rationale ?? null,
                isLate: latest.isLate,
                receivedAt: latest.receivedAt,
                rawText: latest.rawText.slice(0, 4000),
                lines: lines.map((l) => ({
                  _id: l._id,
                  rfqLineItemId: l.rfqLineItemId ?? null,
                  productName: l.productName,
                  unitPrice: l.unitPrice,
                  currency: l.currency,
                  unit: l.unit,
                  quantityAvailable: l.quantityAvailable ?? null,
                  leadTimeDays: l.leadTimeDays ?? null,
                  confidence: l.confidence,
                })),
                attachments: attachments.map((a) => ({
                  _id: a._id,
                  filename: a.filename,
                  contentType: a.contentType,
                  size: a.size,
                })),
              }
            : null,
        };
      }),
    );
    const workflowStatus = rfq.workflowId
      ? await workflow.status(ctx, rfq.workflowId as never).catch(() => null)
      : null;
    return {
      rfq: {
        _id: rfq._id,
        title: rfq.title,
        status: rfq.status,
        rawRequest: rfq.rawRequest,
        deliveryWindow: rfq.deliveryWindow,
        replyByAt: rfq.replyByAt,
        followUpAfterMs: rfq.followUpAfterMs,
        draftSubject: rfq.draftSubject ?? null,
        draftBody: rfq.draftBody ?? null,
        closedAt: rfq.closedAt ?? null,
        recommendationSummary: rfq.recommendationSummary ?? null,
        currency: business.currency,
        createdAt: rfq._creationTime,
      },
      lineItems: lineItems.map((l) => ({
        _id: l._id,
        productName: l.productName,
        quantity: l.quantity,
        unit: l.unit,
        notes: l.notes ?? null,
        chosenSupplierId: l.chosenSupplierId ?? null,
      })),
      suppliers: suppliers.sort((a, b) => (a.quote?.rank ?? 99) - (b.quote?.rank ?? 99)),
      purchaseOrder: po
        ? {
            _id: po._id,
            poNumber: po.poNumber,
            status: po.status,
            total: po.total,
            currency: po.currency,
            lines: po.lines,
            sentAt: po.sentAt ?? null,
          }
        : null,
      workflow: workflowStatus,
    };
  },
});

export const history = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const pos = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .order("desc")
      .take(100);
    return Promise.all(
      pos.map(async (po) => {
        const rfq = await ctx.db.get(po.rfqId);
        const supplierIds = Array.from(new Set(po.lines.map((l) => l.supplierId)));
        const suppliers = await Promise.all(supplierIds.map((id) => ctx.db.get(id)));
        return {
          _id: po._id,
          poNumber: po.poNumber,
          rfqId: po.rfqId,
          rfqTitle: rfq?.title ?? "",
          status: po.status,
          total: po.total,
          currency: po.currency,
          sentAt: po.sentAt ?? null,
          createdAt: po._creationTime,
          suppliers: suppliers.filter(Boolean).map((s) => (s as Doc<"suppliers">).name),
        };
      }),
    );
  },
});
