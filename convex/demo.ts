"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

// SRC-28: demo fixtures. Three real AgentMail supplier inboxes reply to RFQs
// through the real AgentMail API, so the inbound webhook, parser and ranking
// run exactly as they would for a human supplier.

const AGENTMAIL_BASE = process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0";

export const SUPPLIER_FIXTURES = [
  {
    key: "greenleaf",
    username: "greenleaf-farms-supply",
    name: "Greenleaf Farms Supply",
    displayName: "Greenleaf Farms Supply",
    website: "https://greenleaffarms.example.com",
    style: "clean" as const,
  },
  {
    key: "nandini",
    username: "nandini-dairy-wholesale",
    name: "Nandini Dairy Wholesale",
    displayName: "Nandini Dairy Wholesale",
    website: "https://nandinidairy.example.com",
    style: "messy" as const,
  },
  {
    key: "metro",
    username: "metro-kitchen-traders",
    name: "Metro Kitchen Traders",
    displayName: "Metro Kitchen Traders",
    website: "https://metrokitchen.example.com",
    style: "pdf" as const,
  },
];

async function am<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY is not set.");
  const res = await fetch(`${AGENTMAIL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgentMail ${init?.method ?? "GET"} ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Create (or reuse) the three supplier inboxes. Idempotent by client_id. */
export const ensureSupplierInboxes = internalAction({
  args: {},
  handler: async (): Promise<Array<{ key: string; email: string; name: string; website: string }>> => {
    const out = [];
    for (const f of SUPPLIER_FIXTURES) {
      try {
        const inbox = await am<{ inbox_id: string }>("/inboxes", {
          method: "POST",
          body: JSON.stringify({
            username: f.username,
            display_name: f.displayName,
            client_id: `sourcer-demo-${f.key}`,
          }),
        });
        out.push({ key: f.key, email: inbox.inbox_id, name: f.name, website: f.website });
      } catch (err) {
        // Free AgentMail plans cap inboxes; seed whatever fits and say so.
        if (String((err as Error).message).includes("limit_exceeded")) {
          console.warn(`Inbox limit reached; skipping demo supplier ${f.key}.`);
          continue;
        }
        throw err;
      }
    }
    return out;
  },
});

/** Seed the signed-in owner's business with demo suppliers and history. */
export const seedBusiness = internalAction({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const inboxes = await ctx.runAction(internal.demo.ensureSupplierInboxes, {});
    await ctx.runMutation(internal.demoData.applySeed, { businessId, suppliers: inboxes });
  },
});

type Thread = {
  thread_id: string;
  subject?: string;
  message_ids?: string[];
  updated_at?: string;
  last_message_id?: string;
};

/**
 * Reply from a supplier inbox to the most recent RFQ thread it received.
 * The reply goes through AgentMail's real send API, lands in the business's
 * inbox and triggers the signed webhook like any human reply would.
 */
export const replyAsSupplier = internalAction({
  args: {
    supplierKey: v.string(),
    rfqId: v.id("rfqs"),
    style: v.optional(v.union(v.literal("clean"), v.literal("messy"), v.literal("pdf"))),
  },
  handler: async (
    ctx,
    { supplierKey, rfqId, style },
  ): Promise<{ inboxId: string; threadId: string; messageId: string }> => {
    const fixture = SUPPLIER_FIXTURES.find((f) => f.key === supplierKey);
    if (!fixture) throw new Error(`Unknown supplier key ${supplierKey}`);
    const bundle: { rfq: Doc<"rfqs">; business: Doc<"businesses">; lineItems: Doc<"rfqLineItems">[] } | null =
      await ctx.runQuery(internal.rfqs.bundleForAi, { rfqId });
    if (!bundle) throw new Error("RFQ not found");
    const inboxId = `${fixture.username}@agentmail.to`;
    const threads = await am<{ threads: Thread[] }>(
      `/inboxes/${encodeURIComponent(inboxId)}/threads?limit=20`,
    );
    const thread = threads.threads.find((t) =>
      (t.subject ?? "").toLowerCase().includes((bundle.rfq.draftSubject ?? "quote").toLowerCase().slice(0, 20)),
    ) ?? threads.threads[0];
    if (!thread) throw new Error(`No RFQ thread found in ${inboxId} yet.`);
    const full = await am<{ messages: Array<{ message_id: string; from: string; to?: string[] }> }>(
      `/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(thread.thread_id)}`,
    );
    // Reply to the buyer's latest message, never to our own earlier reply.
    const fromBuyer = full.messages.filter((m) => !(m.from ?? "").includes(inboxId));
    const last = fromBuyer[fromBuyer.length - 1] ?? full.messages[full.messages.length - 1];
    const buyerAddress = bundle.business.agentInboxId;
    const body = replyBody(style ?? fixture.style, fixture.name, bundle.business, bundle.lineItems);
    const payload: Record<string, unknown> = { text: body.text, html: body.html };
    if (buyerAddress) payload.to = [buyerAddress];
    if ((style ?? fixture.style) === "pdf") {
      const pdf = priceSheetPdf(fixture.name, bundle.business.currency, bundle.lineItems);
      payload.attachments = [
        { filename: "price-sheet.pdf", content: pdf, content_type: "application/pdf" },
      ];
    }
    const sent = await am<{ message_id: string; thread_id: string }>(
      `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(last.message_id)}/reply`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    return { inboxId, threadId: sent.thread_id, messageId: sent.message_id };
  },
});

function priceFor(canonical: string, style: string): { price: number; unit: string } {
  const base: Record<string, { price: number; unit: string }> = {
    paneer: { price: 320, unit: "kg" },
    "sunflower oil": { price: 138, unit: "L" },
    tomato: { price: 34, unit: "kg" },
    tomatoes: { price: 34, unit: "kg" },
    onion: { price: 28, unit: "kg" },
    onions: { price: 28, unit: "kg" },
    rice: { price: 62, unit: "kg" },
    "basmati rice": { price: 96, unit: "kg" },
    milk: { price: 54, unit: "L" },
    butter: { price: 480, unit: "kg" },
    "chicken": { price: 210, unit: "kg" },
    potato: { price: 26, unit: "kg" },
    potatoes: { price: 26, unit: "kg" },
    flour: { price: 44, unit: "kg" },
    "wheat flour": { price: 44, unit: "kg" },
    sugar: { price: 46, unit: "kg" },
    eggs: { price: 7, unit: "pcs" },
    egg: { price: 7, unit: "pcs" },
  };
  const found = base[canonical] ?? { price: 90, unit: "kg" };
  const factor = style === "clean" ? 1.0 : style === "messy" ? 0.94 : 1.06;
  return { price: Math.round(found.price * factor), unit: found.unit };
}

function replyBody(
  style: "clean" | "messy" | "pdf",
  supplierName: string,
  business: Doc<"businesses">,
  lineItems: Doc<"rfqLineItems">[],
): { text: string; html: string } {
  const cur = business.currency;
  let text: string;
  if (style === "clean") {
    const rows = lineItems.map((li) => {
      const p = priceFor(li.canonicalName, style);
      return `- ${li.productName}: ${cur} ${p.price} per ${p.unit}, ${li.quantity} ${li.unit} available, delivery next day`;
    });
    text =
      `Hello ${business.name} team,\n\nThanks for the request. Our quote:\n\n${rows.join("\n")}\n\n` +
      `Delivery charge: ${cur} 150 flat. Prices valid for 7 days. Lead time 1 day for all items.\n\n` +
      `Regards,\nPriya\n${supplierName}`;
  } else if (style === "messy") {
    const rows = lineItems.map((li, i) => {
      const p = priceFor(li.canonicalName, style);
      if (i === 0) return `${li.productName} we can do at ${p.price}/${p.unit} (fresh batch, this rate is for ${li.quantity}${li.unit} min)`;
      if (i === lineItems.length - 1 && lineItems.length > 1)
        return `${li.productName} - sorry currently out of stock till next week, can do ${p.price + 4} rs ${p.unit} after that`;
      return `${li.productName} ${p.price} rs per ${p.unit} ok`;
    });
    text =
      `hi\n\n${rows.join("\n")}\n\nno delivery charge if order above 5000. can deliver day after tomorrow morning.\n\nthanks\nRamesh\n${supplierName}\n+91 98xxxxxx`;
  } else {
    text =
      `Dear ${business.name},\n\nPlease find our price sheet attached for the items you requested. All prices are per unit, ex-warehouse, valid until end of month. Standard lead time is 2 days; delivery is ${cur} 250 per drop.\n\nBest regards,\nAnita Menon\nSales, ${supplierName}`;
  }
  const html = `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</div>`;
  return { text, html };
}

/** Minimal single-page PDF with selectable text (Helvetica, no compression). */
function priceSheetPdf(supplierName: string, currency: string, lineItems: Doc<"rfqLineItems">[]): string {
  const lines = [
    `${supplierName} - Price Sheet`,
    `Currency: ${currency}. Prices per unit, ex-warehouse. Valid until month end.`,
    "",
    "Item                     Unit price   Unit   Available   Lead time",
    ...lineItems.map((li) => {
      const p = priceFor(li.canonicalName, "pdf");
      return `${li.productName.padEnd(24)} ${String(p.price).padEnd(12)} ${p.unit.padEnd(6)} ${String(li.quantity * 3).padEnd(11)} 2 days`;
    }),
    "",
    `Delivery charge: ${currency} 250 per drop.`,
  ];
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "BT\n/F1 11 Tf\n50 780 Td\n14 TL\n";
  for (const l of lines) content += `(${esc(l)}) Tj T*\n`;
  content += "ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1").toString("base64");
}

export const _ids = { rfq: undefined as unknown as Id<"rfqs"> };
