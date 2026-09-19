import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Empty, Loading, PageHead } from "../components/Shell";
import { useToast } from "../components/Toast";
import { ago } from "../lib/format";

export default function Suppliers() {
  const suppliers = useQuery(api.suppliers.list, {});
  const run = useQuery(api.discovery.latestRun);
  const me = useQuery(api.businesses.me);
  const add = useMutation(api.suppliers.add);
  const review = useMutation(api.suppliers.review);
  const edit = useMutation(api.suppliers.edit);
  const remove = useMutation(api.suppliers.remove);
  const startDiscovery = useMutation(api.discovery.start);
  const track = useMutation(api.pricing.track);
  const { fail, push } = useToast();
  const [form, setForm] = useState({ name: "", email: "", website: "" });
  const [items, setItems] = useState("paneer, sunflower oil, tomatoes");
  const [editing, setEditing] = useState<Id<"suppliers"> | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [trackUrl, setTrackUrl] = useState<Record<string, string>>({});

  async function submitAdd(e: FormEvent) {
    e.preventDefault();
    try {
      await add({ name: form.name, email: form.email, website: form.website || undefined });
      setForm({ name: "", email: "", website: "" });
      push("Supplier added.", "ok");
    } catch (err) { fail(err); }
  }

  async function discover() {
    try {
      await startDiscovery({ items: items.split(",").map((s) => s.trim()).filter(Boolean) });
      push("Firecrawl is searching for suppliers…");
    } catch (err) { fail(err); }
  }

  if (suppliers === undefined) return <><PageHead eyebrow="Suppliers" title="Supplier book" /><Loading /></>;
  const accepted = suppliers.filter((s) => s.status === "accepted");
  const rejected = suppliers.filter((s) => s.status === "rejected");
  const running = run?.status === "running";

  return (
    <>
      <PageHead eyebrow="Suppliers" title="Supplier book" />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
        <div className="stack" style={{ gap: 18 }}>
          <div className="card">
            <div className="card-head">
              <h3>Discover with Firecrawl</h3>
              {run && <span className={`pill ${running ? "sending" : run.status === "failed" ? "failed" : "parsed"}`}>{running && <span className="dot live" />}{run.status}</span>}
            </div>
            <div className="card-pad stack">
              <div className="row">
                <input className="input" style={{ flex: 1 }} value={items} onChange={(e) => setItems(e.target.value)} placeholder="paneer, sunflower oil, tomatoes" />
                <button className="btn" onClick={discover} disabled={running}>{running ? "Searching…" : "Find suppliers"}</button>
              </div>
              <span className="hint">Searches the web near {me?.city ?? "you"}, scrapes candidate pages, and lets OpenAI keep only real suppliers. You approve each one before any email goes out.</span>
              {run && (
                <div className="small muted">
                  Last run: "{run.query}" · {run.candidatesFound} page{run.candidatesFound === 1 ? "" : "s"} considered · {run.finishedAt ? `finished ${ago(run.finishedAt)}` : `started ${ago(run.startedAt)}`}
                  {run.error && <div className="callout" style={{ marginTop: 8 }}>{run.error}</div>}
                </div>
              )}
              {run && run.candidates.length > 0 && (
                <table className="ledger fade-in">
                  <thead><tr><th>Candidate</th><th>Email</th><th>Why</th><th /></tr></thead>
                  <tbody>
                    {run.candidates.map((c) => (
                      <tr key={c._id}>
                        <td><strong>{c.name}</strong>{c.website && <div className="tiny"><a href={c.website} target="_blank" rel="noreferrer">{c.website}</a></div>}</td>
                        <td>
                          {editing === c._id ? (
                            <span className="row">
                              <input className="input" style={{ width: 200 }} value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="sales@supplier.com" />
                              <button className="btn sm" onClick={async () => { try { await edit({ supplierId: c._id, email: editEmail }); setEditing(null); } catch (err) { fail(err); } }}>Save</button>
                            </span>
                          ) : (
                            <span className="row">
                              <span className="mono small">{c.email ?? <span className="muted">not found</span>}</span>
                              <button className="btn ghost sm" onClick={() => { setEditing(c._id); setEditEmail(c.email ?? ""); }}>edit</button>
                            </span>
                          )}
                        </td>
                        <td className="small muted">{c.notes}</td>
                        <td>
                          <span className="row" style={{ flexWrap: "nowrap" }}>
                            <button className="btn sm" disabled={!c.email} title={c.email ? "" : "Add an email first"} onClick={async () => { try { await review({ supplierId: c._id, decision: "accepted" }); } catch (err) { fail(err); } }}>Accept</button>
                            <button className="btn ghost sm" onClick={async () => { try { await review({ supplierId: c._id, decision: "rejected" }); } catch (err) { fail(err); } }}>Reject</button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {run && !running && run.candidates.length === 0 && run.status === "completed" && (
                <span className="small muted">No new candidates from that search. Try different items or add suppliers by hand.</span>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Accepted suppliers</h3><span className="muted small">{accepted.length}</span></div>
            {accepted.length === 0 ? (
              <Empty title="No suppliers yet">Add one by hand on the right, or discover some above.</Empty>
            ) : (
              <table className="ledger">
                <thead><tr><th>Supplier</th><th>Email</th><th>Track a price page</th><th /></tr></thead>
                <tbody>
                  {accepted.map((s) => (
                    <tr key={s._id}>
                      <td><strong>{s.name}</strong>{s.website && <div className="tiny"><a href={s.website} target="_blank" rel="noreferrer">{s.website}</a></div>}{s.source === "discovered" && <span className="tiny muted"> · discovered</span>}</td>
                      <td className="mono small">{s.email}</td>
                      <td>
                        <span className="row" style={{ flexWrap: "nowrap" }}>
                          <input className="input" style={{ width: 220 }} placeholder="https://supplier.com/price-list" value={trackUrl[s._id] ?? ""} onChange={(e) => setTrackUrl({ ...trackUrl, [s._id]: e.target.value })} />
                          <button className="btn sm secondary" disabled={!trackUrl[s._id]} onClick={async () => { try { await track({ supplierId: s._id, url: trackUrl[s._id] }); setTrackUrl({ ...trackUrl, [s._id]: "" }); push("Page queued for a price crawl.", "ok"); } catch (err) { fail(err); } }}>Track</button>
                        </span>
                      </td>
                      <td>
                        <button className="btn ghost sm" onClick={async () => { try { await remove({ supplierId: s._id }); } catch (err) { fail(err); } }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {rejected.length > 0 && (
            <details className="card card-pad">
              <summary className="small muted" style={{ cursor: "pointer" }}>{rejected.length} rejected</summary>
              <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {rejected.map((s) => (
                  <li key={s._id}>{s.name} <button className="btn ghost sm" onClick={async () => { try { await review({ supplierId: s._id, decision: "accepted" }); } catch (err) { fail(err); } }}>restore</button></li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <form className="card card-pad stack" onSubmit={submitAdd} style={{ alignSelf: "start" }}>
          <h3>Add a supplier by hand</h3>
          <label className="field"><span>Name</span><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nandini Dairy Wholesale" /></label>
          <label className="field"><span>Email</span><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="orders@supplier.com" /></label>
          <label className="field"><span>Website (optional)</span><input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></label>
          <button className="btn" type="submit">Add supplier</button>
        </form>
      </div>
    </>
  );
}
