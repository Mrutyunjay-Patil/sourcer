export function money(amount: number | null | undefined, currency = "INR"): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function when(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(ts);
}

export function day(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(ts);
}

export function ago(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function until(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.round((ts - Date.now()) / 1000);
  if (s <= 0) return "passed";
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)} days`;
}

export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 100)}%`;
}
