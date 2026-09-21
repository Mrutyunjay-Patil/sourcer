import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { domainOf, ownedDoc, requireBusiness } from "./lib/access";
import { supplierStatus } from "./schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const list = query({
  args: { status: v.optional(supplierStatus) },
  handler: async (ctx, { status }) => {
    const business = await requireBusiness(ctx);
    const rows = status
      ? await ctx.db
          .query("suppliers")
          .withIndex("by_business_status", (q) =>
            q.eq("businessId", business._id).eq("status", status),
          )
          .collect()
      : await ctx.db
          .query("suppliers")
          .withIndex("by_business", (q) => q.eq("businessId", business._id))
          .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const business = await requireBusiness(ctx);
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new ConvexError("Enter a valid supplier email address.");
    }
    const duplicate = await ctx.db
      .query("suppliers")
      .withIndex("by_business_email", (q) =>
        q.eq("businessId", business._id).eq("email", email),
      )
      .first();
    if (duplicate) {
      throw new ConvexError(`${duplicate.name} already uses that email.`);
    }
    return await ctx.db.insert("suppliers", {
      businessId: business._id,
      name: args.name.trim(),
      email,
      website: args.website?.trim() || undefined,
      domain: domainOf(args.website?.trim()),
      source: "manual",
      status: "accepted",
      notes: args.notes?.trim() || undefined,
    });
  },
});

export const edit = mutation({
  args: {
    supplierId: v.id("suppliers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { supplierId, ...patch }) => {
    const business = await requireBusiness(ctx);
    await ownedDoc(ctx, business, "suppliers", supplierId);
    const update: Record<string, string | undefined> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        throw new ConvexError("Enter a valid supplier email address.");
      }
      update.email = email;
    }
    if (patch.website !== undefined) {
      update.website = patch.website.trim() || undefined;
      update.domain = domainOf(patch.website.trim());
    }
    if (patch.notes !== undefined) update.notes = patch.notes.trim() || undefined;
    await ctx.db.patch(supplierId, update);
  },
});

/** Accept or reject a discovered candidate before any email goes out. */
export const review = mutation({
  args: {
    supplierId: v.id("suppliers"),
    decision: v.union(v.literal("accepted"), v.literal("rejected")),
  },
  handler: async (ctx, { supplierId, decision }) => {
    const business = await requireBusiness(ctx);
    const supplier = await ownedDoc(ctx, business, "suppliers", supplierId);
    if (decision === "accepted" && !supplier.email) {
      throw new ConvexError("Add an email before accepting this supplier.");
    }
    await ctx.db.patch(supplierId, { status: decision });
  },
});

export const remove = mutation({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, { supplierId }) => {
    const business = await requireBusiness(ctx);
    await ownedDoc(ctx, business, "suppliers", supplierId);
    const inFlight = await ctx.db
      .query("rfqSuppliers")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("supplierId"), supplierId))
      .first();
    if (inFlight) {
      throw new ConvexError("This supplier has RFQ history. Reject it instead of deleting.");
    }
    // Everything this supplier produced goes with it, so the price watch never
    // shows rows belonging to a supplier that no longer exists.
    const pages = await ctx.db
      .query("trackedPages")
      .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
      .collect();
    for (const page of pages) await ctx.db.delete(page._id);
    const crawls = await ctx.db
      .query("siteCrawls")
      .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
      .collect();
    for (const crawl of crawls) await ctx.db.delete(crawl._id);
    const catalogPrices = await ctx.db
      .query("priceHistory")
      .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
      .collect();
    for (const row of catalogPrices) await ctx.db.delete(row._id);
    await ctx.db.delete(supplierId);
  },
});
