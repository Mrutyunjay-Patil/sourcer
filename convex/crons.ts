import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// SRC-21: safety net behind the workflow; closes any open RFQ past reply-by.
crons.interval("close expired RFQs", { minutes: 5 }, internal.rfqs.closeExpired, {});

// SRC-14: weekly re-crawl of tracked supplier pages with a price diff.
crons.weekly(
  "weekly supplier price re-crawl",
  { dayOfWeek: "monday", hourUTC: 1, minuteUTC: 30 },
  internal.pricing.recrawlAll,
  {},
);

export default crons;
