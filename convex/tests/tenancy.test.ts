// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.*s");

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const u1 = await ctx.db.insert("users", { email: "owner1@shop.test", name: "Owner One" });
    const u2 = await ctx.db.insert("users", { email: "owner2@shop.test", name: "Owner Two" });
    const b1 = await ctx.db.insert("businesses", {
      ownerUserId: u1, name: "Chai Corner Cafe", category: "cafe", city: "Bengaluru",
      deliveryPreferences: "before 10am", currency: "INR", agentInboxId: "cafe@agentmail.to",
      onboardingComplete: true, isDemo: false,
    });
    const b2 = await ctx.db.insert("businesses", {
      ownerUserId: u2, name: "Other Kitchen", category: "restaurant", city: "Pune",
      deliveryPreferences: "", currency: "INR", onboardingComplete: true, isDemo: false,
    });
    return { u1, u2, b1, b2 };
  });
  const as1 = t.withIdentity({ subject: `${ids.u1}|session1` });
  const as2 = t.withIdentity({ subject: `${ids.u2}|session2` });
  return { t, as1, as2, ...ids };
}

describe("suppliers", () => {
  it("validates email and blocks duplicates", async () => {
    const { as1 } = await seed();
    await expect(as1.mutation(api.suppliers.add, { name: "Bad", email: "not-an-email" })).rejects.toThrow(/valid supplier email/);
    await as1.mutation(api.suppliers.add, { name: "Greenleaf", email: "Sales@Greenleaf.Test", website: "https://www.greenleaf.test/x" });
    await expect(as1.mutation(api.suppliers.add, { name: "Again", email: "sales@greenleaf.test" })).rejects.toThrow(/already uses that email/);
    const list = await as1.query(api.suppliers.list, {});
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe("sales@greenleaf.test");
    expect(list[0].domain).toBe("greenleaf.test");
  });

  it("isolates suppliers per business and refuses cross-tenant edits", async () => {
    const { as1, as2 } = await seed();
    const id = await as1.mutation(api.suppliers.add, { name: "Greenleaf", email: "sales@greenleaf.test" });
    expect(await as2.query(api.suppliers.list, {})).toEqual([]);
    await expect(as2.mutation(api.suppliers.review, { supplierId: id, decision: "rejected" })).rejects.toThrow(/not found/);
    await expect(as2.mutation(api.suppliers.remove, { supplierId: id })).rejects.toThrow(/not found/);
    expect(await as1.query(api.suppliers.list, {})).toHaveLength(1);
  });

  it("requires sign-in and onboarding", async () => {
    const { t } = await seed();
    await expect(t.query(api.suppliers.list, {})).rejects.toThrow(/sign in/);
  });
});

describe("rfqs", () => {
  it("creates a draft with line items and products, and hides it from other tenants", async () => {
    const { as1, as2 } = await seed();
    const rfqId = await as1.mutation(api.rfqs.create, {
      rawRequest: "20 kg paneer, 5 kg tomatoes",
      lineItems: [
        { productName: "Paneer", quantity: 20, unit: "kg" },
        { productName: "tomato", quantity: 5, unit: "kg" },
      ],
      deliveryWindow: "Thursday morning",
      replyByAt: Date.now() + 3600_000,
      followUpAfterMs: 600_000,
    });
    const board = await as1.query(api.rfqs.board, { rfqId });
    expect(board.rfq.status).toBe("draft");
    expect(board.rfq.title).toBe("Paneer, tomato");
    expect(board.lineItems.map((l) => l.productName)).toEqual(["Paneer", "tomato"]);
    await expect(as2.query(api.rfqs.board, { rfqId })).rejects.toThrow(/not found/);
    const mine = await as1.query(api.rfqs.list, {});
    expect(mine).toHaveLength(1);
    expect(await as2.query(api.rfqs.list, {})).toEqual([]);
  });

  it("rejects empty requests, bad quantities and past deadlines", async () => {
    const { as1 } = await seed();
    const base = { rawRequest: "x", deliveryWindow: "now", replyByAt: Date.now() + 3600_000 };
    await expect(as1.mutation(api.rfqs.create, { ...base, lineItems: [] })).rejects.toThrow(/at least one item/);
    await expect(as1.mutation(api.rfqs.create, { ...base, lineItems: [{ productName: "egg", quantity: 0, unit: "dozen" }] })).rejects.toThrow(/quantity/);
    await expect(as1.mutation(api.rfqs.create, { ...base, replyByAt: Date.now() - 1, lineItems: [{ productName: "egg", quantity: 1, unit: "dozen" }] })).rejects.toThrow(/future/);
  });

  it("refuses to send without accepted suppliers or a finished draft", async () => {
    const { as1 } = await seed();
    const rfqId = await as1.mutation(api.rfqs.create, {
      rawRequest: "x", lineItems: [{ productName: "egg", quantity: 1, unit: "dozen" }],
      deliveryWindow: "now", replyByAt: Date.now() + 3600_000,
    });
    await expect(as1.mutation(api.rfqs.send, { rfqId, supplierIds: [] })).rejects.toThrow(/draft to finish/);
    await as1.mutation(api.rfqs.updateDraft, { rfqId, subject: "Quote", body: "Hi {{supplier}}" });
    await expect(as1.mutation(api.rfqs.send, { rfqId, supplierIds: [] })).rejects.toThrow(/at least one supplier/);
  });
});

describe("ranking and purchase orders", () => {
  async function seedQuotes() {
    const s = await seed();
    const { t, as1, b1 } = s;
    const rfqId = await as1.mutation(api.rfqs.create, {
      rawRequest: "x",
      lineItems: [
        { productName: "paneer", quantity: 20, unit: "kg" },
        { productName: "tomato", quantity: 5, unit: "kg" },
      ],
      deliveryWindow: "now", replyByAt: Date.now() + 3600_000,
    });
    const ids = await t.run(async (ctx) => {
      const lines = await ctx.db.query("rfqLineItems").withIndex("by_rfq", (q) => q.eq("rfqId", rfqId)).collect();
      const paneer = lines.find((l) => l.productName === "paneer")!._id;
      const tomato = lines.find((l) => l.productName === "tomato")!._id;
      const sA = await ctx.db.insert("suppliers", { businessId: b1, name: "A", email: "a@x.test", source: "manual", status: "accepted" });
      const sB = await ctx.db.insert("suppliers", { businessId: b1, name: "B", email: "b@x.test", source: "manual", status: "accepted" });
      const mkQuote = async (supplierId: Id<"suppliers">, messageId: string, receivedAt: number, prices: Record<string, number>) => {
        const quoteId = await ctx.db.insert("quotes", {
          businessId: b1, rfqId, supplierId, threadId: `t-${supplierId}`, messageId, rawText: "q",
          parseStatus: "parsed", confidence: 0.9, isLate: false, receivedAt, currency: "INR", deliveryFee: 0,
        });
        for (const [lineId, price] of Object.entries(prices)) {
          await ctx.db.insert("quoteLineItems", {
            businessId: b1, quoteId, rfqId, rfqLineItemId: lineId as Id<"rfqLineItems">,
            productName: lineId === paneer ? "paneer" : "tomato", unitPrice: price, currency: "INR", unit: "kg", confidence: 0.9,
          });
        }
        return quoteId;
      };
      const qA = await mkQuote(sA, "m-a", 1000, { [paneer]: 320, [tomato]: 34 });
      const qBold = await mkQuote(sB, "m-b-old", 900, { [paneer]: 350, [tomato]: 40 });
      const qBnew = await mkQuote(sB, "m-b-new", 2000, { [paneer]: 301, [tomato]: 36 });
      return { paneer, tomato, sA, sB, qA, qBold, qBnew };
    });
    return { ...s, rfqId, ...ids };
  }

  it("ranks the latest quote per supplier, clears stale ranks, and suggests the cheapest supplier per line", async () => {
    const { t, rfqId, paneer, tomato, sA, sB, qA, qBold, qBnew } = await seedQuotes();
    await t.run(async (ctx) => { await ctx.db.patch(qBold, { rank: 1, rationale: "stale" }); });
    await t.mutation(internal.quotes.applyRanking, {
      rfqId,
      ranking: [
        { quoteId: qBnew, rank: 1, landedTotal: 6200, coverage: 1, rationale: "cheapest overall" },
        { quoteId: qA, rank: 2, landedTotal: 6570, coverage: 1, rationale: "pricier paneer" },
      ],
      summary: "Go with B.",
      bestPerLine: [
        { rfqLineItemId: paneer, supplierId: sB },
        { rfqLineItemId: tomato, supplierId: sA },
      ],
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(qBold))!.rank).toBeUndefined();
      expect((await ctx.db.get(qBnew))!.rank).toBe(1);
      expect((await ctx.db.get(paneer))!.chosenSupplierId).toBe(sB);
      expect((await ctx.db.get(tomato))!.chosenSupplierId).toBe(sA);
      expect((await ctx.db.get(rfqId))!.recommendationSummary).toBe("Go with B.");
    });
  });

  it("keeps an owner's override through later re-ranking and generates a PO from it", async () => {
    const { t, as1, rfqId, paneer, tomato, sA, sB, qA, qBnew } = await seedQuotes();
    await as1.mutation(api.purchaseOrders.chooseSupplierForLine, { rfqLineItemId: paneer, supplierId: sA });
    await t.mutation(internal.quotes.applyRanking, {
      rfqId,
      ranking: [{ quoteId: qBnew, rank: 1, landedTotal: 1, coverage: 1, rationale: "" }, { quoteId: qA, rank: 2, landedTotal: 2, coverage: 1, rationale: "" }],
      summary: "",
      bestPerLine: [{ rfqLineItemId: paneer, supplierId: sB }, { rfqLineItemId: tomato, supplierId: sB }],
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(paneer))!.chosenSupplierId).toBe(sA);
      expect((await ctx.db.get(paneer))!.chosenByOwner).toBe(true);
      expect((await ctx.db.get(tomato))!.chosenSupplierId).toBe(sB);
    });
    const poId = await as1.mutation(api.purchaseOrders.generate, { rfqId });
    const po = await as1.query(api.purchaseOrders.get, { poId });
    expect(po.status).toBe("draft");
    expect(po.total).toBe(20 * 320 + 5 * 36);
    expect(po.lines.map((l) => l.supplierName)).toEqual(["A", "B"]);
  });

  it("blocks another tenant from touching the order", async () => {
    const { as2, rfqId, paneer, sA } = await seedQuotes();
    await expect(as2.mutation(api.purchaseOrders.chooseSupplierForLine, { rfqLineItemId: paneer, supplierId: sA })).rejects.toThrow(/not found/);
    await expect(as2.mutation(api.purchaseOrders.generate, { rfqId })).rejects.toThrow(/not found/);
  });
});

describe("AI spend guard", () => {
  beforeEach(() => { process.env.AI_DAILY_REQUEST_LIMIT = "2"; });
  it("stops at the daily request ceiling with a readable message", async () => {
    const { t, b1 } = await seed();
    await t.mutation(internal.usage.reserve, { businessId: b1, purpose: "parseRequest" });
    await t.mutation(internal.usage.reserve, { businessId: b1, purpose: "parseRequest" });
    await expect(t.mutation(internal.usage.reserve, { businessId: b1, purpose: "parseRequest" })).rejects.toThrow(/Daily AI budget reached/);
  });
});
