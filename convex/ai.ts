"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { clamp01, completeJson, completeText, num } from "./lib/llm";
import { canonicalName } from "./lib/access";
import type { RankingQuote } from "./quotes";

// Every model call runs inside a Convex action; the browser never sees a key.
// The spend guard (SRC-15) meters requests and tokens per business per day.

async function guard(ctx: ActionCtx, businessId: Id<"businesses">, purpose: string) {
  await ctx.runMutation(internal.usage.reserve, { businessId, purpose });
  return async (usage: { inputTokens: number; outputTokens: number }) => {
    await ctx.runMutation(internal.usage.record, { businessId, ...usage });
  };
}

// ---------------------------------------------------------------------------
// SRC-23: plain-language item request -> structured line items
// ---------------------------------------------------------------------------

export type ParsedItem = {
  productName: string;
  quantity: number | null;
  unit: string | null;
  ambiguous: boolean;
  question: string | null;
};

export const parseRequest = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<ParsedItem[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You need to sign in first.");
    const business = await ctx.runQuery(internal.usage.businessForUser, { userId });
    if (!business) throw new ConvexError("Finish onboarding first.");
    const done = await guard(ctx, business._id, "parseRequest");

    const system =
      "You turn a restaurant owner's shopping note into purchase line items. " +
      "Return JSON: {\"items\":[{\"productName\":string,\"quantity\":number|null,\"unit\":string|null,\"ambiguous\":boolean,\"question\":string|null}]}. " +
      "Units must be one of: kg, g, L, ml, pcs, dozen, box, crate, bag, packet, bunch, tin, bottle. " +
      "Normalise: kilo/kgs -> kg, litre/ltr -> L, pieces/nos -> pcs. " +
      "Mark ambiguous=true and write a short question when the quantity or unit is missing or unclear (for example 'tomatoes' with no amount, or 'a few boxes' with no box size). " +
      "Never invent a quantity. Keep productName short and singular-ish, e.g. 'paneer', 'sunflower oil', 'tomato'.";
    const { value, usage } = await completeJson<{ items: ParsedItem[] }>(system, text, {
      maxTokens: 900,
    });
    await done(usage);
    const items = Array.isArray(value.items) ? value.items : [];
    return items
      .filter((i) => i && typeof i.productName === "string" && i.productName.trim())
      .map((i) => ({
        productName: i.productName.trim(),
        quantity: num(i.quantity) ?? null,
        unit: i.unit ? String(i.unit).trim() : null,
        ambiguous: Boolean(i.ambiguous) || num(i.quantity) === undefined || !i.unit,
        question: i.question ? String(i.question) : null,
      }));
  },
});

// ---------------------------------------------------------------------------
// SRC-16: draft the RFQ email in the owner's voice
// ---------------------------------------------------------------------------

export const draftRfq = internalAction({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const bundle: { rfq: Doc<"rfqs">; business: Doc<"businesses">; lineItems: Doc<"rfqLineItems">[] } | null =
      await ctx.runQuery(internal.rfqs.bundleForAi, { rfqId });
    if (!bundle) return;
    const { rfq, business, lineItems } = bundle;
    const done = await guard(ctx, business._id, "draftRfq");
    const replyBy = new Date(rfq.replyByAt).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
    const system =
      "You write short, professional request-for-quote emails for a small food business owner. " +
      "Plain text only. Use the placeholders {{supplier}} for the supplier name and {{business}} for the business name exactly as written. " +
      "Structure: greeting, one sentence of context, a bulleted list of items with quantities and units, delivery window, reply-by date, " +
      "a request for unit price, availability and lead time per item, and a sign-off with the business name. Under 160 words. " +
      "Return JSON: {\"subject\": string, \"body\": string}.";
    const user = JSON.stringify({
      business: { name: business.name, category: business.category, city: business.city },
      deliveryPreferences: business.deliveryPreferences,
      deliveryWindow: rfq.deliveryWindow,
      replyBy: `${replyBy} IST`,
      currency: business.currency,
      items: lineItems.map((l) => ({ product: l.productName, quantity: l.quantity, unit: l.unit, notes: l.notes })),
    });
    const { value, usage } = await completeJson<{ subject: string; body: string }>(system, user, {
      maxTokens: 700,
    });
    await done(usage);
    const subject = (value.subject || `Request for quote: ${rfq.title}`).trim();
    const body = (value.body || "").trim();
    if (!body) throw new Error("Model returned an empty RFQ body.");
    await ctx.runMutation(internal.rfqs.setDraft, { rfqId, subject, body, source: "ai" });
  },
});

// ---------------------------------------------------------------------------
// SRC-17: parse a free-text or PDF quote reply into structured line items
// ---------------------------------------------------------------------------

type ParsedQuote = {
  currency: string | null;
  deliveryFee: number | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  confidence: number;
  notes: string | null;
  items: Array<{
    requestedProduct: string | null;
    productName: string;
    unitPrice: number | null;
    unit: string | null;
    quantityAvailable: number | null;
    leadTimeDays: number | null;
    confidence: number;
  }>;
};

export const parseQuote = internalAction({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx, { quoteId }) => {
    const bundle: {
      quote: Doc<"quotes">;
      rfq: Doc<"rfqs">;
      business: Doc<"businesses">;
      lineItems: Doc<"rfqLineItems">[];
      attachmentText: string | null;
    } | null = await ctx.runQuery(internal.quotes.bundleForAi, { quoteId });
    if (!bundle) return;
    const { quote, rfq, business, lineItems, attachmentText } = bundle;
    const done = await guard(ctx, business._id, "parseQuote");

    const system =
      "You extract a supplier's price quote from an email reply and any attached price sheet text. " +
      "You are given the buyer's requested items. Match each quoted line to a requested item when possible (requestedProduct = the exact requested product name, else null). " +
      "Return JSON: {\"currency\": string|null, \"deliveryFee\": number|null, \"leadTimeDays\": number|null, \"validUntil\": string|null, \"confidence\": number 0-1, \"notes\": string|null, " +
      "\"items\":[{\"requestedProduct\": string|null, \"productName\": string, \"unitPrice\": number|null, \"unit\": string|null, \"quantityAvailable\": number|null, \"leadTimeDays\": number|null, \"confidence\": number 0-1}]}. " +
      "unitPrice is the price per unit (per kg, per L, per pcs). If the supplier quotes a total for a requested quantity, divide to get the per-unit price and say so in notes. " +
      "Lead time in days (\"tomorrow\" = 1, \"same day\" = 0, \"next week\" = 7). If the supplier cannot supply an item, omit it. " +
      "Set confidence low (< 0.6) whenever a number is guessed, a unit is unclear, or the text is contradictory. Ignore quoted history and signatures.";
    const user = JSON.stringify({
      requestedItems: lineItems.map((l) => ({ product: l.productName, quantity: l.quantity, unit: l.unit })),
      buyerCurrency: business.currency,
      replyText: quote.rawText.slice(0, 12_000),
      attachmentText: attachmentText?.slice(0, 20_000) ?? null,
    });
    let parsed: ParsedQuote | null = null;
    let failure: string | undefined;
    try {
      const { value, usage } = await completeJson<ParsedQuote>(system, user, { maxTokens: 1800 });
      await done(usage);
      parsed = value;
    } catch (err) {
      failure = (err as Error).message;
    }

    if (!parsed || !Array.isArray(parsed.items)) {
      await ctx.runMutation(internal.quotes.setParsed, {
        quoteId,
        parseStatus: "failed",
        confidence: 0,
        parseNotes: failure ?? "The model returned no line items.",
        items: [],
      });
      return;
    }

    const byCanonical = new Map<string, Doc<"rfqLineItems">>(lineItems.map((l) => [l.canonicalName, l]));
    const items = parsed.items
      .filter((i) => i && i.productName && num(i.unitPrice) !== undefined)
      .map((i) => {
        const requested =
          (i.requestedProduct && byCanonical.get(canonicalName(i.requestedProduct))) ||
          byCanonical.get(canonicalName(i.productName)) ||
          fuzzyMatch(byCanonical, i.productName);
        return {
          rfqLineItemId: requested?._id,
          productName: String(i.productName).trim(),
          unitPrice: num(i.unitPrice) as number,
          currency: (parsed.currency || business.currency).toUpperCase(),
          unit: (i.unit || requested?.unit || "unit").trim(),
          quantityAvailable: num(i.quantityAvailable),
          leadTimeDays: num(i.leadTimeDays) ?? num(parsed.leadTimeDays),
          confidence: clamp01(i.confidence, 0.5),
        };
      });

    const overall = clamp01(parsed.confidence, items.length ? 0.6 : 0);
    const minItem = items.reduce((m, i) => Math.min(m, i.confidence), 1);
    const unmatched = items.filter((i) => !i.rfqLineItemId).length;
    const needsReview = items.length === 0 || overall < 0.6 || minItem < 0.5 || unmatched > 0;

    await ctx.runMutation(internal.quotes.setParsed, {
      quoteId,
      parseStatus: needsReview ? "needs_review" : "parsed",
      confidence: overall,
      parseNotes: [
        parsed.notes ?? undefined,
        unmatched ? `${unmatched} quoted line(s) did not match a requested item.` : undefined,
        items.length === 0 ? "No priced items were found in the reply." : undefined,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
      currency: (parsed.currency || business.currency).toUpperCase(),
      deliveryFee: num(parsed.deliveryFee),
      leadTimeDays: num(parsed.leadTimeDays),
      validUntil: parsed.validUntil ?? undefined,
      items,
    });

    await ctx.scheduler.runAfter(0, internal.ai.rankQuotes, { rfqId: rfq._id });
  },
});

function fuzzyMatch(
  byCanonical: Map<string, Doc<"rfqLineItems">>,
  name: string,
): Doc<"rfqLineItems"> | undefined {
  const tokens = canonicalName(name).split(" ").filter((t) => t.length > 2);
  let best: { doc: Doc<"rfqLineItems">; score: number } | undefined;
  for (const [key, doc] of byCanonical) {
    const keyTokens = new Set(key.split(" "));
    const score = tokens.filter((t) => keyTokens.has(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { doc, score };
  }
  return best?.doc;
}

// ---------------------------------------------------------------------------
// SRC-18: rank quotes with a short written rationale
// ---------------------------------------------------------------------------

export const rankQuotes = internalAction({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }) => {
    const bundle: {
      rfq: Doc<"rfqs">;
      business: Doc<"businesses">;
      lineItems: Doc<"rfqLineItems">[];
      quotes: RankingQuote[];
    } | null = await ctx.runQuery(internal.quotes.rankingBundle, { rfqId });
    if (!bundle) return;
    const { business, lineItems, quotes } = bundle;
    if (quotes.length === 0) return;

    // Deterministic scoring first, so the ranking never depends on the model.
    const scored = quotes.map((q) => {
      let landed = 0;
      let covered = 0;
      let maxLead = 0;
      for (const li of lineItems) {
        const line = q.lines.find((l) => l.rfqLineItemId === li._id);
        if (!line) continue;
        covered += 1;
        landed += line.unitPrice * li.quantity;
        maxLead = Math.max(maxLead, line.leadTimeDays ?? q.leadTimeDays ?? 0);
      }
      landed += q.deliveryFee ?? 0;
      const coverage = lineItems.length ? covered / lineItems.length : 0;
      return { ...q, landedTotal: landed, coverage, maxLead };
    });

    const complete = scored.filter((s) => s.coverage === 1);
    const partial = scored.filter((s) => s.coverage < 1 && s.coverage > 0);
    const empty = scored.filter((s) => s.coverage === 0);
    const order = (a: typeof scored[number], b: typeof scored[number]) =>
      a.landedTotal - b.landedTotal || a.maxLead - b.maxLead;
    complete.sort(order);
    partial.sort((a, b) => b.coverage - a.coverage || order(a, b));
    const ranked = [...complete, ...partial, ...empty];

    // Best per line item for the mixed-supplier recommendation.
    const bestPerLine = lineItems.map((li) => {
      const options = scored
        .map((q) => ({ q, line: q.lines.find((l) => l.rfqLineItemId === li._id) }))
        .filter((o) => o.line)
        .sort((a, b) => a.line!.unitPrice - b.line!.unitPrice);
      return { li, best: options[0] };
    });

    const done = await guard(ctx, business._id, "rankQuotes");
    const system =
      "You explain a supplier ranking to a busy restaurant owner in plain language. " +
      "For each quote write one or two sentences on why it sits where it does (price, coverage, lead time, late). " +
      "Then write a two sentence overall recommendation, naming the cheapest complete option and whether splitting the order across suppliers saves money. " +
      "Return JSON: {\"rationales\": {\"<quoteId>\": string}, \"summary\": string}. No markdown.";
    const user = JSON.stringify({
      currency: business.currency,
      requested: lineItems.map((l) => ({ id: l._id, product: l.productName, quantity: l.quantity, unit: l.unit })),
      ranked: ranked.map((r, i) => ({
        rank: i + 1,
        quoteId: r._id,
        supplier: r.supplierName,
        landedTotal: Math.round(r.landedTotal),
        coverage: r.coverage,
        leadTimeDays: r.maxLead,
        deliveryFee: r.deliveryFee ?? 0,
        late: r.isLate,
        needsReview: r.parseStatus === "needs_review",
        lines: r.lines.map((l) => ({ product: l.productName, unitPrice: l.unitPrice, unit: l.unit })),
      })),
      cheapestPerLine: bestPerLine.map((b) => ({
        product: b.li.productName,
        supplier: b.best?.q.supplierName ?? null,
        unitPrice: b.best?.line?.unitPrice ?? null,
      })),
    });
    let rationales: Record<string, string> = {};
    let summary = "";
    try {
      const { value, usage } = await completeJson<{ rationales: Record<string, string>; summary: string }>(
        system,
        user,
        { maxTokens: 900 },
      );
      await done(usage);
      rationales = value.rationales ?? {};
      summary = value.summary ?? "";
    } catch (err) {
      summary = `Ranking computed on landed price, coverage and lead time. (Rationale unavailable: ${(err as Error).message})`;
    }

    await ctx.runMutation(internal.quotes.applyRanking, {
      rfqId,
      ranking: ranked.map((r, i) => ({
        quoteId: r._id,
        rank: i + 1,
        landedTotal: r.landedTotal,
        coverage: r.coverage,
        rationale:
          rationales[r._id] ??
          fallbackRationale(r.coverage, r.landedTotal, r.maxLead, business.currency),
      })),
      summary,
      bestPerLine: bestPerLine
        .filter((b) => b.best)
        .map((b) => ({ rfqLineItemId: b.li._id, supplierId: b.best!.q.supplierId })),
    });
  },
});

function fallbackRationale(coverage: number, landed: number, lead: number, currency: string) {
  if (coverage === 0) return "No requested items were priced in this reply.";
  const cov = coverage === 1 ? "covers every item" : `covers ${Math.round(coverage * 100)}% of items`;
  return `This quote ${cov} at a landed total of ${currency} ${Math.round(landed)} with a ${lead} day lead time.`;
}

// ---------------------------------------------------------------------------
// SRC-13: extract catalog prices from a scraped supplier page
// ---------------------------------------------------------------------------

export type CatalogPrice = {
  productName: string;
  unitPrice: number;
  unit: string;
  currency: string;
};

export const extractCatalogPrices = internalAction({
  args: {
    businessId: v.id("businesses"),
    markdown: v.string(),
    currency: v.string(),
    wantedProducts: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<CatalogPrice[]> => {
    const done = await guard(ctx, args.businessId, "extractCatalogPrices");
    const system =
      "You read a supplier web page (markdown) and extract listed prices for food ingredients and supplies. " +
      "Return JSON: {\"prices\":[{\"productName\": string, \"unitPrice\": number, \"unit\": string, \"currency\": string}]}. " +
      "Only include entries where a numeric price and a unit (kg, g, L, ml, pcs, dozen, box, bag, packet) are actually present on the page. " +
      "Prefer products in the wanted list but include other clearly priced items too. Never guess a price. Return an empty list if the page has no prices.";
    const user = JSON.stringify({
      wantedProducts: args.wantedProducts,
      defaultCurrency: args.currency,
      page: args.markdown.slice(0, 24_000),
    });
    const { value, usage } = await completeJson<{ prices: CatalogPrice[] }>(system, user, {
      maxTokens: 1200,
    });
    await done(usage);
    return (Array.isArray(value.prices) ? value.prices : [])
      .filter((p) => p && p.productName && num(p.unitPrice) !== undefined && p.unit)
      .map((p) => ({
        productName: String(p.productName).trim(),
        unitPrice: num(p.unitPrice) as number,
        unit: String(p.unit).trim(),
        currency: (p.currency || args.currency).toUpperCase(),
      }));
  },
});

// ---------------------------------------------------------------------------
// SRC-12: pick real supplier candidates out of search results
// ---------------------------------------------------------------------------

export type SupplierCandidate = {
  name: string;
  website: string;
  email: string | null;
  reason: string;
};

export const pickSupplierCandidates = internalAction({
  args: {
    businessId: v.id("businesses"),
    city: v.string(),
    items: v.array(v.string()),
    pages: v.array(
      v.object({ url: v.string(), title: v.string(), markdown: v.string() }),
    ),
  },
  handler: async (ctx, args): Promise<SupplierCandidate[]> => {
    const done = await guard(ctx, args.businessId, "pickSupplierCandidates");
    const system =
      "You are helping a restaurant find wholesale suppliers. From the scraped pages, list businesses that actually sell or supply the wanted items (wholesalers, distributors, farms, dairies, B2B marketplaces). " +
      "Skip directories, news, recipes, retailers selling single consumer packs, and job boards. " +
      "Return JSON: {\"candidates\":[{\"name\": string, \"website\": string, \"email\": string|null, \"reason\": string}]}. " +
      "email must be an address literally present in the page text, otherwise null. Keep reason to one short sentence.";
    const user = JSON.stringify({
      city: args.city,
      wantedItems: args.items,
      pages: args.pages.map((p) => ({ url: p.url, title: p.title, text: p.markdown.slice(0, 6000) })),
    });
    const { value, usage } = await completeJson<{ candidates: SupplierCandidate[] }>(system, user, {
      maxTokens: 1500,
    });
    await done(usage);
    return (Array.isArray(value.candidates) ? value.candidates : [])
      .filter((c) => c && c.name && c.website)
      .map((c) => ({
        name: String(c.name).trim(),
        website: String(c.website).trim(),
        email: c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email)) ? String(c.email).toLowerCase() : null,
        reason: String(c.reason ?? "").trim(),
      }));
  },
});

export const summarizeText = internalAction({
  args: { businessId: v.id("businesses"), prompt: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const done = await guard(ctx, args.businessId, "summarize");
    const { text, usage } = await completeText(args.prompt, args.text, { maxTokens: 400 });
    await done(usage);
    return text;
  },
});
