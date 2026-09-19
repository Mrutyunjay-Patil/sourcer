import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Every business-scoped table carries businessId and is indexed on it so
// multi-tenant filtering happens at the query level, never in the client.

export const supplierStatus = v.union(
  v.literal("candidate"),
  v.literal("accepted"),
  v.literal("rejected"),
);

export const rfqStatus = v.union(
  v.literal("draft"),
  v.literal("sending"),
  v.literal("open"),
  v.literal("closed"),
);

export const sendStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("replied"),
  v.literal("parsed"),
);

export const parseStatus = v.union(
  v.literal("pending"),
  v.literal("parsed"),
  v.literal("needs_review"),
  v.literal("failed"),
);

export default defineSchema({
  ...authTables,

  businesses: defineTable({
    ownerUserId: v.id("users"),
    name: v.string(),
    category: v.string(),
    city: v.string(),
    deliveryPreferences: v.string(),
    currency: v.string(),
    agentInboxId: v.optional(v.string()),
    onboardingComplete: v.boolean(),
    isDemo: v.boolean(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_inbox", ["agentInboxId"]),

  suppliers: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    domain: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("discovered")),
    status: supplierStatus,
    discoveryRunId: v.optional(v.id("discoveryRuns")),
    notes: v.optional(v.string()),
  })
    .index("by_business", ["businessId"])
    .index("by_business_status", ["businessId", "status"])
    .index("by_business_domain", ["businessId", "domain"])
    .index("by_business_email", ["businessId", "email"]),

  products: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    canonicalName: v.string(),
    unit: v.string(),
  })
    .index("by_business", ["businessId"])
    .index("by_business_canonical", ["businessId", "canonicalName"]),

  rfqs: defineTable({
    businessId: v.id("businesses"),
    title: v.string(),
    status: rfqStatus,
    rawRequest: v.string(),
    deliveryWindow: v.string(),
    replyByAt: v.number(),
    followUpAfterMs: v.number(),
    draftSubject: v.optional(v.string()),
    draftBody: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    ownerNotifiedAt: v.optional(v.number()),
    recommendationSummary: v.optional(v.string()),
  })
    .index("by_business", ["businessId"])
    .index("by_business_status", ["businessId", "status"])
    .index("by_status_replyBy", ["status", "replyByAt"]),

  rfqLineItems: defineTable({
    businessId: v.id("businesses"),
    rfqId: v.id("rfqs"),
    productName: v.string(),
    canonicalName: v.string(),
    quantity: v.number(),
    unit: v.string(),
    notes: v.optional(v.string()),
    chosenSupplierId: v.optional(v.id("suppliers")),
  })
    .index("by_rfq", ["rfqId"])
    .index("by_business", ["businessId"]),

  // One row per supplier per RFQ: send lifecycle and follow-up bookkeeping.
  rfqSuppliers: defineTable({
    businessId: v.id("businesses"),
    rfqId: v.id("rfqs"),
    supplierId: v.id("suppliers"),
    status: sendStatus,
    outboundId: v.optional(v.string()),
    sentMessageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    followUpOutboundId: v.optional(v.string()),
    followUpSentAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
  })
    .index("by_rfq", ["rfqId"])
    .index("by_rfq_supplier", ["rfqId", "supplierId"])
    .index("by_business", ["businessId"])
    .index("by_outbound", ["outboundId"])
    .index("by_followUp_outbound", ["followUpOutboundId"]),

  emailThreads: defineTable({
    businessId: v.id("businesses"),
    rfqId: v.id("rfqs"),
    supplierId: v.id("suppliers"),
    inboxId: v.string(),
    threadId: v.string(),
    lastInboundMessageId: v.optional(v.string()),
    lastOutboundMessageId: v.optional(v.string()),
    inboundCount: v.number(),
    outboundCount: v.number(),
    lastActivityAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_rfq", ["rfqId"])
    .index("by_supplier", ["supplierId"])
    .index("by_business", ["businessId"]),

  quotes: defineTable({
    businessId: v.id("businesses"),
    rfqId: v.id("rfqs"),
    supplierId: v.id("suppliers"),
    threadId: v.string(),
    messageId: v.string(),
    rawText: v.string(),
    parseStatus: parseStatus,
    confidence: v.optional(v.number()),
    parseNotes: v.optional(v.string()),
    leadTimeDays: v.optional(v.number()),
    validUntil: v.optional(v.string()),
    currency: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    landedTotal: v.optional(v.number()),
    coverage: v.optional(v.number()),
    rank: v.optional(v.number()),
    rationale: v.optional(v.string()),
    isLate: v.boolean(),
    receivedAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_rfq", ["rfqId"])
    .index("by_rfq_supplier", ["rfqId", "supplierId"])
    .index("by_business", ["businessId"])
    .index("by_message", ["messageId"])
    .index("by_thread", ["threadId"]),

  quoteLineItems: defineTable({
    businessId: v.id("businesses"),
    quoteId: v.id("quotes"),
    rfqId: v.id("rfqs"),
    rfqLineItemId: v.optional(v.id("rfqLineItems")),
    productName: v.string(),
    unitPrice: v.number(),
    currency: v.string(),
    unit: v.string(),
    quantityAvailable: v.optional(v.number()),
    leadTimeDays: v.optional(v.number()),
    confidence: v.number(),
  })
    .index("by_quote", ["quoteId"])
    .index("by_rfq", ["rfqId"])
    .index("by_business", ["businessId"]),

  quoteAttachments: defineTable({
    businessId: v.id("businesses"),
    quoteId: v.id("quotes"),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    extractedText: v.optional(v.string()),
  })
    .index("by_quote", ["quoteId"])
    .index("by_business", ["businessId"]),

  purchaseOrders: defineTable({
    businessId: v.id("businesses"),
    rfqId: v.id("rfqs"),
    poNumber: v.string(),
    status: v.union(v.literal("draft"), v.literal("sending"), v.literal("sent")),
    lines: v.array(
      v.object({
        supplierId: v.id("suppliers"),
        rfqLineItemId: v.id("rfqLineItems"),
        productName: v.string(),
        quantity: v.number(),
        unit: v.string(),
        unitPrice: v.number(),
        currency: v.string(),
      }),
    ),
    total: v.number(),
    currency: v.string(),
    sends: v.array(
      v.object({
        supplierId: v.id("suppliers"),
        outboundId: v.string(),
        threadId: v.optional(v.string()),
      }),
    ),
    sentAt: v.optional(v.number()),
  })
    .index("by_rfq", ["rfqId"])
    .index("by_business", ["businessId"]),

  priceHistory: defineTable({
    businessId: v.id("businesses"),
    supplierId: v.id("suppliers"),
    productName: v.string(),
    canonicalName: v.string(),
    unitPrice: v.number(),
    currency: v.string(),
    unit: v.string(),
    source: v.union(v.literal("catalog"), v.literal("quote"), v.literal("order")),
    sourceUrl: v.optional(v.string()),
    observedAt: v.number(),
    deltaFromPrevious: v.optional(v.number()),
  })
    .index("by_business", ["businessId"])
    .index("by_supplier", ["supplierId"])
    .index("by_business_product", ["businessId", "canonicalName"])
    .index("by_business_product_time", ["businessId", "canonicalName", "observedAt"]),

  trackedPages: defineTable({
    businessId: v.id("businesses"),
    supplierId: v.id("suppliers"),
    url: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("priced"),
      v.literal("no_price"),
      v.literal("failed"),
    ),
    lastCrawledAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    productCount: v.number(),
  })
    .index("by_business", ["businessId"])
    .index("by_supplier", ["supplierId"])
    .index("by_business_url", ["businessId", "url"]),

  discoveryRuns: defineTable({
    businessId: v.id("businesses"),
    query: v.string(),
    items: v.array(v.string()),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    candidatesFound: v.number(),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_business", ["businessId"]),

  // Inbound mail the webhook could not match to an RFQ thread.
  quarantine: defineTable({
    businessId: v.optional(v.id("businesses")),
    inboxId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    fromAddress: v.string(),
    subject: v.string(),
    text: v.string(),
    reason: v.string(),
    receivedAt: v.number(),
  })
    .index("by_business", ["businessId"])
    .index("by_message", ["messageId"]),

  // Per-business daily AI spend guard.
  aiUsage: defineTable({
    businessId: v.id("businesses"),
    day: v.string(),
    requests: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  }).index("by_business_day", ["businessId", "day"]),
});
