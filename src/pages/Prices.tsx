import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Empty, Loading, PageHead } from "../components/Shell";
import { useToast } from "../components/Toast";
import { ago, day, money } from "../lib/format";

export default function Prices() {
  const watch = useQuery(api.pricing.watchlist);
  const pages = useQuery(api.pricing.trackedPages);
  const untrack = useMutation(api.pricing.untrack);
  const { fail } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const trend = useQuery(api.pricing.trend, selected ? { canonicalName: selected } : "skip");

  if (watch === undefined || pages === undefined) return <><PageHead eyebrow="Prices" title="Price watch" /><Loading /></>;
  const arrow = (d: string) => (d === "up" ? "▲" : d === "down" ? "▼" : d === "flat" ? "▶" : "•");

  return (
    <>
      <PageHead eyebrow="Prices" title="Price watch" />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
        <div className="stack" style={{ gap: 18 }}>
          <div className="card">
            <div className="card-head"><h3>Products</h3><span className="muted small">week over week</span></div>
            {watch.length === 0 ? (
              <Empty title="No prices observed yet">Prices land here from every parsed quote, purchase order and tracked catalog page.</Empty>
            ) : (
              <table className="ledger">
                <thead><tr><th>Product</th><th className="num">Latest</th><th className="num">A week ago</th><th>Trend</th><th>Source</th></tr></thead>
                <tbody>
                  {watch.map((w) => (
                    <tr key={w.canonicalName} className={`clickable ${selected === w.canonicalName ? "best" : ""}`} onClick={() => setSelected(w.canonicalName)}>
                      <td><strong>{w.productName}</strong><div className="tiny muted">per {w.unit} · {w.observations} obs.</div></td>
                      <td className="num">{money(w.latestPrice, w.currency)}</td>
                      <td className="num muted">{w.weekAgoPrice === null ? "—" : money(w.weekAgoPrice, w.currency)}</td>
                      <td className={`trend-${w.direction} num`}>
                        {arrow(w.direction)} {w.weekAgoPrice !== null && w.weekAgoPrice !== 0 ? `${((w.latestPrice - w.weekAgoPrice) / w.weekAgoPrice * 100).toFixed(1)}%` : w.direction}
                      </td>
                      <td className="small muted">{w.latestSource} · {w.supplierName} · {ago(w.latestAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3>Tracked pages</h3><span className="muted small">re-crawled weekly by cron</span></div>
            {pages.length === 0 ? (
              <Empty title="No pages tracked">Add a supplier price-list URL on the Suppliers page. Firecrawl scrapes it and OpenAI pulls out the prices.</Empty>
            ) : (
              <table className="ledger">
                <thead><tr><th>Page</th><th>Status</th><th>Prices</th><th>Last crawl</th><th /></tr></thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p._id}>
                      <td><strong>{p.supplierName}</strong><div className="tiny"><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></div></td>
                      <td><span className={`pill ${p.status === "priced" ? "parsed" : p.status === "failed" ? "failed" : p.status === "no_price" ? "needs_review" : "pending"}`}>{p.status.replace("_", " ")}</span>{p.lastError && <div className="tiny muted">{p.lastError}</div>}</td>
                      <td className="num">{p.productCount}</td>
                      <td className="small muted">{p.lastCrawledAt ? ago(p.lastCrawledAt) : "queued"}</td>
                      <td><button className="btn ghost sm" onClick={async () => { try { await untrack({ pageId: p._id }); } catch (err) { fail(err); } }}>Stop</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card card-pad stack" style={{ alignSelf: "start" }}>
          <h3>{selected ? `Trend: ${watch.find((w) => w.canonicalName === selected)?.productName ?? selected}` : "Trend"}</h3>
          {!selected && <p className="muted small">Pick a product to see its price over time.</p>}
          {selected && trend === undefined && <div className="skeleton" />}
          {selected && trend && trend.length > 0 && (
            <>
              <Sparkline points={trend.map((t) => ({ x: t.observedAt, y: t.unitPrice }))} />
              <table className="ledger small">
                <thead><tr><th>When</th><th className="num">Price</th><th>From</th></tr></thead>
                <tbody>
                  {[...trend].reverse().slice(0, 12).map((t, i) => (
                    <tr key={i}>
                      <td>{day(t.observedAt)}</td>
                      <td className="num">{money(t.unitPrice, t.currency)}/{t.unit}</td>
                      <td className="muted">{t.source} · {t.supplierName}{t.sourceUrl && <> · <a href={t.sourceUrl} target="_blank" rel="noreferrer">page</a></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {selected && trend && trend.length === 0 && <p className="muted small">No observations yet.</p>}
        </div>
      </div>
    </>
  );
}

function Sparkline({ points }: { points: Array<{ x: number; y: number }> }) {
  if (points.length === 0) return null;
  const W = 400, H = 120, P = 10;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (x: number) => (maxX === minX ? W / 2 : P + ((x - minX) / (maxX - minX)) * (W - 2 * P));
  const sy = (y: number) => (maxY === minY ? H / 2 : H - P - ((y - minY) / (maxY - minY)) * (H - 2 * P));
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const color = last.y > first.y ? "var(--tomato)" : last.y < first.y ? "var(--leaf)" : "var(--ink-mute)";
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price trend">
      <path d={`${d} L${sx(last.x).toFixed(1)},${H} L${sx(first.x).toFixed(1)},${H} Z`} fill={color} opacity="0.1" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3" fill={color} />)}
      <text x={W - P} y={sy(last.y) - 8} textAnchor="end" fontSize="12" fontFamily="var(--mono)" fill={color}>{last.y}</text>
    </svg>
  );
}
