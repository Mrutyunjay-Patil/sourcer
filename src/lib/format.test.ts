import { describe, expect, it, vi, afterEach } from "vitest";
import { ago, day, money, pct, toLocalInput, until, when } from "./format";

describe("money", () => {
  it("formats INR with the rupee sign and two decimals", () => {
    expect(money(8135, "INR")).toBe("₹8,135.00");
  });
  it("uses Indian grouping for large numbers", () => {
    expect(money(1234567.5, "INR")).toBe("₹12,34,567.50");
  });
  it("returns a dash for missing values", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
    expect(money(Number.NaN)).toBe("—");
  });
  it("falls back to a plain string for an unknown currency code", () => {
    expect(money(10, "NOTREAL")).toBe("NOTREAL 10.00");
  });
});

describe("relative times", () => {
  afterEach(() => vi.useRealTimers());
  it("ago describes seconds, minutes, hours and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
    const now = Date.now();
    expect(ago(now - 2_000)).toBe("just now");
    expect(ago(now - 30_000)).toBe("30s ago");
    expect(ago(now - 5 * 60_000)).toBe("5m ago");
    expect(ago(now - 3 * 3600_000)).toBe("3h ago");
    expect(ago(now - 3 * 86400_000)).toBe("3d ago");
    expect(ago(null)).toBe("—");
  });
  it("until counts down and says passed after the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
    const now = Date.now();
    expect(until(now - 1)).toBe("passed");
    expect(until(now + 20_000)).toBe("20s");
    expect(until(now + 12 * 60_000)).toBe("12 min");
    expect(until(now + 90 * 60_000)).toBe("1h 30m");
    expect(until(now + 3 * 86400_000)).toBe("3 days");
  });
});

describe("date helpers", () => {
  it("toLocalInput produces a datetime-local value in local time", () => {
    const d = new Date(2026, 8, 20, 9, 5);
    expect(toLocalInput(d.getTime())).toBe("2026-09-20T09:05");
  });
  it("when and day render a dash for empty input", () => {
    expect(when(null)).toBe("—");
    expect(day(undefined)).toBe("—");
  });
  it("pct rounds a ratio to a whole percent", () => {
    expect(pct(0.666)).toBe("67%");
    expect(pct(1)).toBe("100%");
    expect(pct(null)).toBe("—");
  });
});
