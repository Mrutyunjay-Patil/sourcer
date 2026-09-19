import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Resolve the signed-in user's id or throw a user-facing error. */
export async function requireUserId(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("You need to sign in first.");
  }
  return userId;
}

/**
 * Resolve the caller's business from their auth identity. Every query and
 * mutation that touches business data goes through here so businessId is
 * never taken from client input.
 */
export async function requireBusiness(ctx: Ctx): Promise<Doc<"businesses">> {
  const userId = await requireUserId(ctx);
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
    .unique();
  if (!business) {
    throw new ConvexError("Finish onboarding to create your business first.");
  }
  return business;
}

/** Same as requireBusiness but returns null when the user has none yet. */
export async function currentBusiness(
  ctx: Ctx,
): Promise<Doc<"businesses"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
    .unique();
}

/** Load a row and prove it belongs to the caller's business. */
export async function ownedDoc<T extends OwnedTable>(
  ctx: Ctx,
  business: Doc<"businesses">,
  table: T,
  id: Id<T>,
): Promise<Doc<T>> {
  const doc = await ctx.db.get(id);
  if (!doc || (doc as unknown as { businessId: Id<"businesses"> }).businessId !== business._id) {
    throw new ConvexError(`${table === "rfqs" ? "Request" : "Item"} not found.`);
  }
  return doc as Doc<T>;
}

export type OwnedTable =
  | "suppliers"
  | "products"
  | "rfqs"
  | "rfqLineItems"
  | "rfqSuppliers"
  | "emailThreads"
  | "quotes"
  | "quoteLineItems"
  | "quoteAttachments"
  | "purchaseOrders"
  | "priceHistory"
  | "trackedPages"
  | "discoveryRuns";

/** Normalise a product name so "Paneer (fresh)" and "paneer" match. */
export function canonicalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function domainOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}
