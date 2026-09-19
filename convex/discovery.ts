import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { domainOf, requireBusiness } from "./lib/access";
import type { Doc } from "./_generated/dataModel";
import type { SupplierCandidate } from "./ai";

export const firecrawl = new FirecrawlClient(components.firecrawl);

// SRC-12: supplier discovery from a natural-language item request.
// Firecrawl search (with page scraping) finds candidate supplier pages, the
// model filters them to real suppliers, and results are deduplicated by
// domain before they land in `suppliers` as candidates for owner review.

export const start = mutation({
  args: { items: v.array(v.string()), query: v.optional(v.string()) },
  handler: async (ctx, { items, query: extra }) => {
    const business = await requireBusiness(ctx);
    const cleaned = items.map((i) => i.trim()).filter(Boolean);
    if (cleaned.length === 0) throw new ConvexError("Add at least one item to search for.");
    const running = await ctx.db
      .query("discoveryRuns")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("status"), "running"))
      .first();
    if (running && Date.now() - running.startedAt < 3 * 60_000) {
      throw new ConvexError("A discovery run is already in progress.");
    }
    const query = (extra?.trim() || `${cleaned.join(", ")} wholesale supplier ${business.city}`).slice(0, 200);
    const runId = await ctx.db.insert("discoveryRuns", {
      businessId: business._id,
      query,
      items: cleaned,
      status: "running",
      candidatesFound: 0,
      startedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.discovery.run, { runId });
    return runId;
  },
});

export const run = internalAction({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    const bundle = await ctx.runQuery(internal.discovery.getRun, { runId });
    if (!bundle) return;
    const { run, business } = bundle;
    try {
      // Two searches: a wholesale-supplier query and a per-city B2B query.
      const queries = [
        run.query,
        `${run.items.slice(0, 2).join(" ")} distributor ${business.city} contact email`,
      ];
      const seen = new Map<string, { url: string; title: string; markdown: string }>();
      for (const q of queries) {
        const res = await firecrawl.search(ctx, q, {
          limit: 6,
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true, maxAge: 86_400_000 },
        });
        for (const hit of res.web ?? []) {
          const url = (hit as { url?: string; metadata?: { sourceURL?: string } }).url ??
            (hit as { metadata?: { sourceURL?: string } }).metadata?.sourceURL;
          if (!url) continue;
          const domain = domainOf(url);
          if (!domain || seen.has(domain)) continue;
          const markdown = (hit as { markdown?: string }).markdown ?? "";
          const title =
            (hit as { title?: string }).title ??
            (hit as { metadata?: { title?: string } }).metadata?.title ??
            domain;
          seen.set(domain, { url, title, markdown });
          // Stream partial results so the UI moves while the run continues.
          await ctx.runMutation(internal.discovery.progress, {
            runId,
            candidatesFound: seen.size,
          });
        }
      }
      const pages = Array.from(seen.values()).filter((p) => p.markdown.trim().length > 200);
      const candidates: SupplierCandidate[] = pages.length
        ? await ctx.runAction(internal.ai.pickSupplierCandidates, {
            businessId: business._id,
            city: business.city,
            items: run.items,
            pages,
          })
        : [];
      // Fall back to a literal email scan for pages the model kept without an email.
      const enriched = candidates.map((c) => {
        if (c.email) return c;
        const page = seen.get(domainOf(c.website) ?? "");
        const found = page?.markdown.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
        return { ...c, email: found ? found.toLowerCase() : null };
      });
      const inserted = await ctx.runMutation(internal.discovery.saveCandidates, {
        runId,
        candidates: enriched,
      });
      await ctx.runMutation(internal.discovery.finish, {
        runId,
        status: "completed",
        candidatesFound: inserted,
      });
    } catch (err) {
      await ctx.runMutation(internal.discovery.finish, {
        runId,
        status: "failed",
        candidatesFound: 0,
        error: (err as Error).message,
      });
    }
  },
});

export const getRun = internalQuery({
  args: { runId: v.id("discoveryRuns") },
  handler: async (
    ctx,
    { runId },
  ): Promise<{ run: Doc<"discoveryRuns">; business: Doc<"businesses"> } | null> => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    const business = await ctx.db.get(run.businessId);
    if (!business) return null;
    return { run, business };
  },
});

export const progress = internalMutation({
  args: { runId: v.id("discoveryRuns"), candidatesFound: v.number() },
  handler: async (ctx, { runId, candidatesFound }) => {
    await ctx.db.patch(runId, { candidatesFound });
  },
});

export const saveCandidates = internalMutation({
  args: {
    runId: v.id("discoveryRuns"),
    candidates: v.array(
      v.object({
        name: v.string(),
        website: v.string(),
        email: v.union(v.string(), v.null()),
        reason: v.string(),
      }),
    ),
  },
  handler: async (ctx, { runId, candidates }) => {
    const run = await ctx.db.get(runId);
    if (!run) return 0;
    let inserted = 0;
    for (const c of candidates) {
      const domain = domainOf(c.website);
      if (!domain) continue;
      const existing = await ctx.db
        .query("suppliers")
        .withIndex("by_business_domain", (q) => q.eq("businessId", run.businessId).eq("domain", domain))
        .first();
      if (existing) continue;
      await ctx.db.insert("suppliers", {
        businessId: run.businessId,
        name: c.name,
        email: c.email ?? undefined,
        website: c.website,
        domain,
        source: "discovered",
        status: "candidate",
        discoveryRunId: runId,
        notes: c.reason || undefined,
      });
      inserted += 1;
    }
    return inserted;
  },
});

export const finish = internalMutation({
  args: {
    runId: v.id("discoveryRuns"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    candidatesFound: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      candidatesFound: args.candidatesFound,
      error: args.error,
      finishedAt: Date.now(),
    });
  },
});

export const latestRun = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const run = await ctx.db
      .query("discoveryRuns")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .order("desc")
      .first();
    if (!run) return null;
    const candidates = await ctx.db
      .query("suppliers")
      .withIndex("by_business_status", (q) => q.eq("businessId", business._id).eq("status", "candidate"))
      .collect();
    return {
      _id: run._id,
      query: run.query,
      items: run.items,
      status: run.status,
      candidatesFound: run.candidatesFound,
      error: run.error ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      candidates: candidates.map((s) => ({
        _id: s._id,
        name: s.name,
        email: s.email ?? null,
        website: s.website ?? null,
        notes: s.notes ?? null,
      })),
    };
  },
});

/** Scrape one supplier page on demand (used from the supplier drawer). */
export const scrapeSupplierPage = action({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You need to sign in first.");
    const doc = await firecrawl.scrape(ctx, url, {
      formats: ["markdown"],
      onlyMainContent: true,
      maxAge: 3_600_000,
    });
    const md = (doc as { markdown?: string }).markdown ?? "";
    return { title: (doc as { metadata?: { title?: string } }).metadata?.title ?? url, markdown: md.slice(0, 20_000) };
  },
});
