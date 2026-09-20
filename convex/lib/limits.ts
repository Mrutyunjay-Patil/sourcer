import { RateLimiter, HOUR, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

const DAY = 24 * HOUR;

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Application rate limits, enforced transactionally by the rate-limiter
 * component. Keys are business ids so every tenant gets its own budget.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // SRC-15: per-business daily AI ceiling (requests and tokens).
  aiRequests: { kind: "fixed window", rate: envNumber("AI_DAILY_REQUEST_LIMIT", 300), period: DAY },
  aiTokens: { kind: "fixed window", rate: envNumber("AI_DAILY_TOKEN_LIMIT", 600_000), period: DAY },
  // Firecrawl discovery is credit-backed; allow bursts but not hammering.
  discovery: { kind: "token bucket", rate: 6, period: 10 * MINUTE, capacity: 3 },
  // Site crawls cost more credits per run.
  siteCrawl: { kind: "token bucket", rate: 4, period: HOUR, capacity: 2 },
});
