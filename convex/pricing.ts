import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { firecrawl } from "./discovery";
import { canonicalName, ownedDoc, requireBusiness } from "./lib/access";
import { recordPrice } from "./quotes";

// SRC-13: extract baseline catalog prices from a supplier page.
// SRC-14: weekly cron re-crawls every tracked page and stores the diff.

export const track = mutation({
  args: { supplierId: v.id("suppliers"), url: v.string() },
  handler: async (ctx, { supplierId, url }) => {
    const business = await requireBusiness(ctx);
    await ownedDoc(ctx, business, "suppliers", supplierId);
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) throw new ConvexError("Enter a full URL starting with http.");
    const existing = await ctx.db
      .query("trackedPages")
      .withIndex("by_business_url", (q) => q.eq("businessId", business._id).eq("url", clean))
      .first();
    if (existing) {
      await ctx.scheduler.runAfter(0, internal.pricing.crawlPage, { pageId: existing._id });
      return existing._id;
    }
    const pageId = await ctx.db.insert("trackedPages", {
      businessId: business._id,
      supplierId,
      url: clean,
      status: "pending",
      productCount: 0,
    });
    await ctx.scheduler.runAfter(0, internal.pricing.crawlPage, { pageId });
    return pageId;
  },
});

export const untrack = mutation({
  args: { pageId: v.id("trackedPages") },
  handler: async (ctx, { pageId }) => {
    const business = await requireBusiness(ctx);
    await ownedDoc(ctx, business, "trackedPages", pageId);
    await ctx.db.delete(pageId);
  },
});

export const crawlPage = internalAction({
  args: { pageId: v.id("trackedPages") },
  handler: async (ctx, { pageId }) => {
    const bundle = await ctx.runQuery(internal.pricing.pageBundle, { pageId });
    if (!bundle) return;
    const { page, business, wanted } = bundle;
    try {
      const doc = await firecrawl.scrape(ctx, page.url, {
        formats: ["markdown"],
        onlyMainContent: true,
        maxAge: 6 * 3_600_000,
      });
      const markdown = (doc as { markdown?: string }).markdown ?? "";
      if (markdown.trim().length < 50) {
        await ctx.runMutation(internal.pricing.markPage, {
          pageId,
          status: "failed",
          error: "Page returned no readable content.",
          productCount: 0,
        });
        return;
      }
      const prices = await ctx.runAction(internal.ai.extractCatalogPrices, {
        businessId: business._id,
        markdown,
        currency: business.currency,
        wantedProducts: wanted,
      });
      if (prices.length === 0) {
        // Marked, not retried forever: the weekly cron will look again.
        await ctx.runMutation(internal.pricing.markPage, {
          pageId,
          status: "no_price",
          productCount: 0,
        });
        return;
      }
      await ctx.runMutation(internal.pricing.storePrices, {
        pageId,
        prices,
      });
    } catch (err) {
      await ctx.runMutation(internal.pricing.markPage, {
        pageId,
        status: "failed",
        error: (err as Error).message,
        productCount: 0,
      });
    }
  },
});

export const pageBundle = internalQuery({
  args: { pageId: v.id("trackedPages") },
  handler: async (ctx, { pageId }) => {
    const page = await ctx.db.get(pageId);
    if (!page) return null;
    const business = await ctx.db.get(page.businessId);
    if (!business) return null;
    const products = await ctx.db
      .query("products")
      .withIndex("by_business", (q) => q.eq("businessId", page.businessId))
      .collect();
    return { page, business, wanted: products.map((p) => p.name) };
  },
});

export const markPage = internalMutation({
  args: {
    pageId: v.id("trackedPages"),
    status: v.union(v.literal("priced"), v.literal("no_price"), v.literal("failed")),
    error: v.optional(v.string()),
    productCount: v.number(),
  },
  handler: async (ctx, { pageId, status, error, productCount }) => {
    await ctx.db.patch(pageId, {
      status,
      lastError: error,
      lastCrawledAt: Date.now(),
      productCount,
    });
  },
});

export const storePrices = internalMutation({
  args: {
    pageId: v.id("trackedPages"),
    prices: v.array(
      v.object({
        productName: v.string(),
        unitPrice: v.number(),
        unit: v.string(),
        currency: v.string(),
      }),
    ),
  },
  handler: async (ctx, { pageId, prices }) => {
    const page = await ctx.db.get(pageId);
    if (!page) return;
    for (const p of prices) {
      await recordPrice(ctx, {
        businessId: page.businessId,
        supplierId: page.supplierId,
        productName: p.productName,
        unitPrice: p.unitPrice,
        currency: p.currency,
        unit: p.unit,
        source: "catalog",
        sourceUrl: page.url,
      });
    }
    await ctx.db.patch(pageId, {
      status: "priced",
      lastError: undefined,
      lastCrawledAt: Date.now(),
      productCount: prices.length,
    });
  },
});

/** Cron target (SRC-14): re-crawl every tracked page, spaced out. */
export const recrawlAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pages = await ctx.db.query("trackedPages").take(500);
    let i = 0;
    for (const page of pages) {
      await ctx.scheduler.runAfter(i * 3000, internal.pricing.crawlPage, { pageId: page._id });
      i += 1;
    }
    return pages.length;
  },
});

// ---------------------------------------------------------------------------
// Owner-facing views (SRC-14 indicators, SRC-26 trends)
// ---------------------------------------------------------------------------

export const trackedPages = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const pages = await ctx.db
      .query("trackedPages")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    return Promise.all(
      pages.map(async (p) => {
        const supplier = await ctx.db.get(p.supplierId);
        return {
          _id: p._id,
          supplierId: p.supplierId,
          supplierName: supplier?.name ?? "Supplier",
          url: p.url,
          status: p.status,
          lastCrawledAt: p.lastCrawledAt ?? null,
          lastError: p.lastError ?? null,
          productCount: p.productCount,
        };
      }),
    );
  },
});

/** Latest price per product with week-over-week direction. */
export const watchlist = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const rows = await ctx.db
      .query("priceHistory")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .order("desc")
      .take(1000);
    const byProduct = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byProduct.get(r.canonicalName) ?? [];
      list.push(r);
      byProduct.set(r.canonicalName, list);
    }
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const out = [];
    for (const [canonical, list] of byProduct) {
      const latest = list[0];
      const baseline = list.find((r) => r.observedAt <= weekAgo) ?? list[list.length - 1];
      const supplier = await ctx.db.get(latest.supplierId);
      out.push({
        canonicalName: canonical,
        productName: latest.productName,
        unit: latest.unit,
        currency: latest.currency,
        latestPrice: latest.unitPrice,
        latestAt: latest.observedAt,
        latestSource: latest.source,
        supplierName: supplier?.name ?? "Supplier",
        weekAgoPrice: baseline && baseline._id !== latest._id ? baseline.unitPrice : null,
        direction:
          baseline && baseline._id !== latest._id
            ? latest.unitPrice > baseline.unitPrice
              ? "up"
              : latest.unitPrice < baseline.unitPrice
                ? "down"
                : "flat"
            : "new",
        observations: list.length,
      });
    }
    return out.sort((a, b) => a.productName.localeCompare(b.productName));
  },
});

export const trend = query({
  args: { canonicalName: v.string() },
  handler: async (ctx, { canonicalName: canonical }) => {
    const business = await requireBusiness(ctx);
    const rows = await ctx.db
      .query("priceHistory")
      .withIndex("by_business_product_time", (q) =>
        q.eq("businessId", business._id).eq("canonicalName", canonicalName(canonical)),
      )
      .order("asc")
      .take(500);
    const suppliers = new Map<string, string>();
    for (const r of rows) {
      if (!suppliers.has(r.supplierId)) {
        const s = await ctx.db.get(r.supplierId);
        suppliers.set(r.supplierId, s?.name ?? "Supplier");
      }
    }
    return rows.map((r) => ({
      observedAt: r.observedAt,
      unitPrice: r.unitPrice,
      unit: r.unit,
      currency: r.currency,
      source: r.source,
      sourceUrl: r.sourceUrl ?? null,
      supplierName: suppliers.get(r.supplierId) ?? "Supplier",
    }));
  },
});
