import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Loading, PageHead } from "../components/Shell";
import { useToast } from "../components/Toast";
import { ago, money, pct, until, when } from "../lib/format";
import { useClock } from "../lib/useClock";

type Board = NonNullable<ReturnType<typeof useQuery<typeof api.rfqs.board>>>;
type SupplierRow = Board["suppliers"][number];

export default function RfqDetail() {
  const { id } = useParams();
  const rfqId = id as Id<"rfqs">;
  const board = useQuery(api.rfqs.board, { rfqId });
  const me = useQuery(api.businesses.me);
  useClock(5000);
  if (board === undefined) return <><PageHead eyebrow="Request" title="Loading…" /><Loading rows={5} /></>;
  const { rfq } = board;
  return (
    <>
      <PageHead eyebrow={`Request · ${rfq.status}`} title={rfq.title}>
        <span className={`pill ${rfq.status}`}>{rfq.status === "open" && <span className="dot live" />}{rfq.status}</span>
        {rfq.status !== "closed" && rfq.status !== "draft" && <span className="small muted">closes in {until(rfq.replyByAt)}</span>}
        {rfq.status === "closed" && <span className="small muted">closed {when(rfq.closedAt)}</span>}
        {(rfq.status === "open" || rfq.status === "sending") && <CloseNow rfqId={rfqId} />}
      </PageHead>
      {rfq.status === "draft" ? <DraftStage board={board} rfqId={rfqId} /> : <LiveStage board={board} rfqId={rfqId} isDemo={!!me?.isDemo} />}
    </>
  );
}

function CloseNow({ rfqId }: { rfqId: Id<"rfqs"> }) {
  const close = useMutation(api.rfqs.closeNow);
  const { fail, push } = useToast();
  return (
    <button className="btn secondary sm" onClick={async () => { try { await close({ rfqId }); push("Request closed. Ranking the quotes that arrived.", "ok"); } catch (err) { fail(err); } }}>
      Close now and rank
    </button>
  );
}

// ---------------------------------------------------------------------------
// Draft: edit line items and the email, pick suppliers, send
// ---------------------------------------------------------------------------

function DraftStage({ board, rfqId }: { board: Board; rfqId: Id<"rfqs"> }) {
  const suppliers = useQuery(api.suppliers.list, { status: "accepted" });
  const updateDraft = useMutation(api.rfqs.updateDraft);
  const regenerate = useMutation(api.rfqs.regenerateDraft);
  const send = useMutation(api.rfqs.send);
  const { fail, push } = useToast();
  const [subject, setSubject] = useState(board.rfq.draftSubject ?? "");
  const [body, setBody] = useState(board.rfq.draftBody ?? "");
  const [dirty, setDirty] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dirty) { setSubject(board.rfq.draftSubject ?? ""); setBody(board.rfq.draftBody ?? ""); }
  }, [board.rfq.draftSubject, board.rfq.draftBody, dirty]);
  useEffect(() => {
    if (suppliers && chosen.size === 0) setChosen(new Set(suppliers.map((s) => s._id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers?.length]);

  const drafting = !board.rfq.draftBody;

  async function saveDraft() {
    try { await updateDraft({ rfqId, subject, body }); setDirty(false); push("Draft saved.", "ok"); } catch (err) { fail(err); }
  }
  async function doSend() {
    setBusy(true);
    try {
      if (dirty) await updateDraft({ rfqId, subject, body });
      await send({ rfqId, supplierIds: Array.from(chosen) as Id<"suppliers">[] });
      push(`Sending to ${chosen.size} supplier${chosen.size === 1 ? "" : "s"}…`, "ok");
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="card">
          <div className="card-head"><h3>Items</h3><span className="muted small">deliver {board.rfq.deliveryWindow} · reply by {when(board.rfq.replyByAt)}</span></div>
          <table className="ledger">
            <thead><tr><th>Product</th><th className="num">Quantity</th><th>Unit</th></tr></thead>
            <tbody>{board.lineItems.map((l) => <tr key={l._id}><td>{l.productName}</td><td className="num">{l.quantity}</td><td>{l.unit}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Quote request email</h3>
            <span className="row">
              {drafting ? <span className="pill sending"><span className="dot live" />OpenAI is drafting</span> : <span className="tiny muted">written by OpenAI in your voice</span>}
              <button className="btn ghost sm" disabled={drafting} onClick={async () => { try { setDirty(false); await regenerate({ rfqId }); } catch (err) { fail(err); } }}>Regenerate</button>
            </span>
          </div>
          <div className="card-pad stack">
            {drafting ? (
              <div className="stack"><div className="skeleton" style={{ width: "60%" }} /><div className="skeleton" /><div className="skeleton" style={{ width: "90%" }} /><div className="skeleton" style={{ width: "40%" }} /></div>
            ) : (
              <>
                <label className="field"><span>Subject</span><input className="input" value={subject} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} /></label>
                <label className="field"><span>Body</span><textarea className="input mono" rows={14} value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} /></label>
                <div className="row spread">
                  <span className="hint">{"{{supplier}}"} and {"{{business}}"} are filled per email.</span>
                  <button className="btn secondary sm" disabled={!dirty} onClick={saveDraft}>Save edits</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="card card-pad stack" style={{ alignSelf: "start" }}>
        <h3>Send to</h3>
        {suppliers === undefined && <div className="skeleton" />}
        {suppliers && suppliers.length === 0 && <p className="small muted">No accepted suppliers yet. Add some on the Suppliers page first.</p>}
        {suppliers && suppliers.map((s) => (
          <label key={s._id} className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={chosen.has(s._id)} onChange={(e) => { const n = new Set(chosen); e.target.checked ? n.add(s._id) : n.delete(s._id); setChosen(n); }} />
            <span><strong>{s.name}</strong><div className="tiny mono muted">{s.email}</div></span>
          </label>
        ))}
        <button className="btn tomato" disabled={busy || drafting || chosen.size === 0} onClick={doSend}>
          {busy ? "Sending…" : `Send request to ${chosen.size}`}
        </button>
        <span className="hint">Each supplier gets their own thread. Replies land on this board live. Silent suppliers get one nudge after {Math.round(board.rfq.followUpAfterMs / 3600_000 * 10) / 10}h.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live: send status, quote board, ranking, purchase order
// ---------------------------------------------------------------------------

function LiveStage({ board, rfqId, isDemo }: { board: Board; rfqId: Id<"rfqs">; isDemo: boolean }) {
  const { rfq, lineItems, suppliers, purchaseOrder } = board;
  const seen = useRef<Set<string>>(new Set());
  const [landed, setLanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fresh = new Set<string>();
    for (const s of suppliers) {
      if (s.quote && !seen.current.has(s.quote._id)) { seen.current.add(s.quote._id); if (seen.current.size > 0) fresh.add(s.quote._id); }
    }
    if (fresh.size) { setLanded(fresh); const t = setTimeout(() => setLanded(new Set()), 2500); return () => clearTimeout(t); }
  }, [suppliers]);

  const quoted = suppliers.filter((s) => s.quote);
  const ranked = [...quoted].sort((a, b) => (a.quote!.rank ?? 99) - (b.quote!.rank ?? 99));
  const replied = suppliers.filter((s) => s.sendStatus === "replied" || s.sendStatus === "parsed").length;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Timeline rfq={rfq} suppliers={suppliers} />

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.6fr)" }}>
        <div className="card">
          <div className="card-head"><h3>Suppliers</h3><span className="small muted">{replied}/{suppliers.length} replied</span></div>
          <table className="ledger">
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.rfqSupplierId}>
                  <td><strong>{s.name}</strong><div className="tiny mono muted">{s.email}</div>{s.lastError && <div className="tiny" style={{ color: "var(--tomato)" }}>{s.lastError}</div>}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`pill ${s.sendStatus}`}>{s.sendStatus === "queued" && <span className="dot live" />}{s.sendStatus}</span>
                    <div className="tiny muted">{s.repliedAt ? `replied ${ago(s.repliedAt)}` : s.followUpSentAt ? `nudged ${ago(s.followUpSentAt)}` : s.sentAt ? `sent ${ago(s.sentAt)}` : "queued"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isDemo && <DemoPanel rfqId={rfqId} />}
        </div>

        <div className="card">
          <div className="card-head"><h3>Price comparison</h3><span className="small muted">per unit · {rfq.currency}</span></div>
          {quoted.length === 0 ? (
            <div className="empty"><h3>Waiting for the first reply</h3><p>Quotes appear here the moment a supplier's email lands. No refresh needed.</p></div>
          ) : (
            <table className="ledger">
              <thead>
                <tr><th>Item</th>{ranked.map((s) => <th key={s.supplierId} className="num">{s.name}</th>)}</tr>
              </thead>
              <tbody>
                {lineItems.map((li) => {
                  const prices = ranked.map((s) => s.quote!.lines.find((l) => l.rfqLineItemId === li._id));
                  const best = Math.min(...prices.filter(Boolean).map((p) => p!.unitPrice));
                  return (
                    <tr key={li._id}>
                      <td><strong>{li.productName}</strong><div className="tiny muted">{li.quantity} {li.unit}</div></td>
                      {prices.map((p, i) => (
                        <td key={i} className="num" style={p && p.unitPrice === best ? { color: "var(--leaf)", fontWeight: 600 } : undefined}>
                          {p ? <>{money(p.unitPrice, p.currency)}<div className="tiny muted">/{p.unit}{p.confidence < 0.6 ? " · check" : ""}</div></> : <span className="muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <td><strong>Landed total</strong><div className="tiny muted">incl. delivery</div></td>
                  {ranked.map((s) => <td key={s.supplierId} className="num"><strong>{money(s.quote!.landedTotal, rfq.currency)}</strong><div className="tiny muted">{pct(s.quote!.coverage)} of items</div></td>)}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {rfq.recommendationSummary && (
        <div className="callout leaf fade-in"><div className="eyebrow" style={{ color: "var(--leaf)" }}>Recommendation</div><p className="rationale">{rfq.recommendationSummary}</p></div>
      )}

      {ranked.length > 0 && (
        <div className="board">
          {ranked.map((s) => <QuoteCard key={s.quote!._id} s={s} rfq={rfq} lineItems={lineItems} landed={landed.has(s.quote!._id)} best={s.quote!.rank === 1} />)}
        </div>
      )}

      <OrderPanel board={board} rfqId={rfqId} po={purchaseOrder} />
    </div>
  );
}

function Timeline({ rfq, suppliers }: { rfq: Board["rfq"]; suppliers: SupplierRow[] }) {
  const allSent = suppliers.length > 0 && suppliers.every((s) => s.sendStatus !== "queued");
  const anyReply = suppliers.some((s) => s.sendStatus === "replied" || s.sendStatus === "parsed");
  const nudged = suppliers.some((s) => s.followUpSentAt);
  const closed = rfq.status === "closed";
  const steps = [
    { t: "Sent", d: allSent ? `${suppliers.length} suppliers` : "sending…", done: allSent, now: !allSent },
    { t: "Replies", d: anyReply ? `${suppliers.filter((s) => s.quote).length} quoted` : "waiting", done: anyReply, now: allSent && !anyReply && !closed },
    { t: "Follow-up", d: nudged ? "nudged silent suppliers" : `after ${Math.round(rfq.followUpAfterMs / 3600_000 * 10) / 10}h`, done: nudged, now: false },
    { t: "Close", d: closed ? when(rfq.closedAt) : `in ${until(rfq.replyByAt)}`, done: closed, now: false },
    { t: "Ranked", d: rfq.recommendationSummary ? "recommendation ready" : "on each reply", done: !!rfq.recommendationSummary, now: false },
  ];
  return (
    <div className="timeline fade-in" aria-label="Durable workflow progress">
      {steps.map((s) => (
        <div key={s.t} className={`step ${s.done ? "done" : ""} ${s.now ? "now" : ""}`}><span className="t">{s.t}</span>{s.d}</div>
      ))}
    </div>
  );
}

function Conversation({ threadId }: { threadId: string }) {
  const messages = useQuery(api.email.threadMessages, { threadId });
  if (messages === undefined) return <div className="skeleton" />;
  if (messages.length === 0) return <p className="small muted">No inbound messages stored for this thread yet.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="tiny muted">Inbound messages as stored by the AgentMail component, newest last.</div>
      {messages.map((m) => (
        <div key={String(m.messageId)} className="email-body" style={{ maxHeight: 220 }}>
          <div className="tiny muted" style={{ marginBottom: 6 }}>{String(m.from ?? "")} · {when(Number(m.receivedAt) || undefined)}</div>
          {m.text.slice(0, 2500)}
        </div>
      ))}
    </div>
  );
}

function QuoteCard({ s, rfq, lineItems, landed, best }: { s: SupplierRow; rfq: Board["rfq"]; lineItems: Board["lineItems"]; landed: boolean; best: boolean }) {
  const q = s.quote!;
  const [showRaw, setShowRaw] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const reparse = useMutation(api.quotes.reparse);
  const { fail } = useToast();
  return (
    <div className={`card card-pad quote-card stack ${landed ? "landed" : ""} ${best ? "best" : ""}`}>
      <div className="rank">{q.rank ?? "·"}</div>
      <div className="row spread">
        <div className="row">
          <h3>{s.name}</h3>
          <span className={`pill ${q.parseStatus}`}>{q.parseStatus === "pending" && <span className="dot live" />}{q.parseStatus.replace("_", " ")}</span>
          {q.isLate && <span className="pill late">late</span>}
          {best && <span className="pill parsed">best value</span>}
        </div>
        <span className="tiny muted">landed {ago(q.receivedAt)}</span>
      </div>
      {q.parseStatus === "pending" ? (
        <div className="stack"><div className="skeleton" style={{ width: "50%" }} /><div className="skeleton" style={{ width: "70%" }} /><span className="hint">OpenAI is reading the reply{q.attachments.length ? " and its attachment" : ""}…</span></div>
      ) : (
        <>
          {q.rationale && <p className="rationale">{q.rationale}</p>}
          <div className="row small muted" style={{ gap: 16 }}>
            <span>Landed <strong className="num">{money(q.landedTotal, rfq.currency)}</strong></span>
            <span>Delivery <span className="num">{money(q.deliveryFee ?? 0, rfq.currency)}</span></span>
            <span>Lead time <span className="num">{q.leadTimeDays ?? "?"}</span> d</span>
            {q.validUntil && <span>Valid until {q.validUntil}</span>}
            <span>Confidence <span className="num">{pct(q.confidence)}</span></span>
          </div>
          {q.lines.length > 0 && (
            <table className="ledger small">
              <thead><tr><th>Quoted item</th><th className="num">Unit price</th><th className="num">Available</th><th className="num">Lead</th><th>Matched to</th></tr></thead>
              <tbody>
                {q.lines.map((l) => (
                  <tr key={l._id}>
                    <td>{l.productName}{l.confidence < 0.6 && <span className="tiny" style={{ color: "var(--amber)" }}> · low confidence</span>}</td>
                    <td className="num">{money(l.unitPrice, l.currency)}/{l.unit}</td>
                    <td className="num">{l.quantityAvailable ?? "—"}</td>
                    <td className="num">{l.leadTimeDays ?? "—"}</td>
                    <td className="muted">{lineItems.find((x) => x._id === l.rfqLineItemId)?.productName ?? <span style={{ color: "var(--amber)" }}>unmatched</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {q.parseNotes && <div className={`callout ${q.parseStatus === "needs_review" || q.parseStatus === "failed" ? "amber" : "leaf"} small`}>{q.parseNotes}</div>}
          {q.attachments.length > 0 && (
            <div className="row small">{q.attachments.map((a) => <AttachmentLink key={a._id} id={a._id} name={a.filename} size={a.size} />)}</div>
          )}
          <div className="row">
            {(q.parseStatus === "needs_review" || q.parseStatus === "failed") && <button className="btn sm" onClick={() => setReviewing(true)}>Review and confirm</button>}
            <button className="btn ghost sm" onClick={() => setShowRaw(!showRaw)}>{showRaw ? "Hide" : "Show"} original reply</button>
            {s.threadId && <button className="btn ghost sm" onClick={() => setShowThread(!showThread)}>{showThread ? "Hide" : "Show"} conversation</button>}
            <button className="btn ghost sm" onClick={async () => { try { await reparse({ quoteId: q._id }); } catch (err) { fail(err); } }}>Re-read</button>
          </div>
          {showRaw && <div className="email-body">{q.rawText}</div>}
          {showThread && s.threadId && <Conversation threadId={s.threadId} />}
          {reviewing && <ReviewForm quoteId={q._id} lines={q.lines} lineItems={lineItems} deliveryFee={q.deliveryFee} currency={rfq.currency} onDone={() => setReviewing(false)} />}
        </>
      )}
    </div>
  );
}

function AttachmentLink({ id, name, size }: { id: Id<"quoteAttachments">; name: string; size: number }) {
  const url = useQuery(api.quotes.attachmentUrl, { attachmentId: id });
  return url ? <a className="chip" href={url} target="_blank" rel="noreferrer">📎 {name} <span className="muted tiny">{Math.round(size / 1024)} KB</span></a> : <span className="chip muted">📎 {name}</span>;
}

function ReviewForm({ quoteId, lines, lineItems, deliveryFee, currency, onDone }: {
  quoteId: Id<"quotes">; lines: NonNullable<SupplierRow["quote"]>["lines"]; lineItems: Board["lineItems"]; deliveryFee: number | null; currency: string; onDone: () => void;
}) {
  const review = useMutation(api.quotes.review);
  const { fail, push } = useToast();
  const [rows, setRows] = useState(() =>
    lineItems.map((li) => {
      const l = lines.find((x) => x.rfqLineItemId === li._id);
      return { rfqLineItemId: li._id, productName: li.productName, unitPrice: l ? String(l.unitPrice) : "", unit: l?.unit ?? li.unit, leadTimeDays: l?.leadTimeDays ? String(l.leadTimeDays) : "", include: !!l };
    }),
  );
  const [fee, setFee] = useState(deliveryFee ? String(deliveryFee) : "0");
  return (
    <div className="stack card-pad" style={{ background: "var(--amber-soft)", borderRadius: 8 }}>
      <strong>Confirm what this supplier quoted</strong>
      <table className="ledger small">
        <thead><tr><th>Include</th><th>Item</th><th className="num">Unit price ({currency})</th><th>Unit</th><th className="num">Lead days</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.rfqLineItemId}>
              <td><input type="checkbox" checked={r.include} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} /></td>
              <td>{r.productName}</td>
              <td className="num"><input className="input mono" style={{ width: 110 }} value={r.unitPrice} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} /></td>
              <td><input className="input" style={{ width: 70 }} value={r.unit} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} /></td>
              <td className="num"><input className="input mono" style={{ width: 70 }} value={r.leadTimeDays} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, leadTimeDays: e.target.value } : x))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <label className="field"><span>Delivery fee</span><input className="input mono" style={{ width: 120 }} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
        <button className="btn" onClick={async () => {
          try {
            await review({
              quoteId,
              lines: rows.filter((r) => r.include && r.unitPrice !== "").map((r) => ({ rfqLineItemId: r.rfqLineItemId, unitPrice: Number(r.unitPrice), unit: r.unit, leadTimeDays: r.leadTimeDays ? Number(r.leadTimeDays) : undefined })),
              deliveryFee: fee ? Number(fee) : undefined,
            });
            push("Quote confirmed. Ranking updated.", "ok"); onDone();
          } catch (err) { fail(err); }
        }}>Confirm</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function OrderPanel({ board, rfqId, po }: { board: Board; rfqId: Id<"rfqs">; po: Board["purchaseOrder"] }) {
  const { lineItems, suppliers, rfq } = board;
  const choose = useMutation(api.purchaseOrders.chooseSupplierForLine);
  const generate = useMutation(api.purchaseOrders.generate);
  const send = useMutation(api.purchaseOrders.send);
  const { fail, push } = useToast();
  const [busy, setBusy] = useState(false);
  const quoted = suppliers.filter((s) => s.quote && s.quote.lines.length > 0);
  const options = useMemo(() => new Map(lineItems.map((li) => [li._id, quoted.filter((s) => s.quote!.lines.some((l) => l.rfqLineItemId === li._id))])), [lineItems, quoted]);
  if (quoted.length === 0) return null;
  const allChosen = lineItems.every((li) => li.chosenSupplierId);

  return (
    <div className="card fade-in">
      <div className="card-head">
        <h3>Purchase order</h3>
        {po ? <span className={`pill ${po.status === "sent" ? "parsed" : po.status}`}>{po.poNumber} · {po.status}</span> : <span className="small muted">approve the recommendation or override per line</span>}
      </div>
      <div className="card-pad stack">
        {po?.status === "sent" ? (
          <div className="callout leaf">Sent {when(po.sentAt)} to {new Set(po.lines.map((l) => l.supplierId)).size} supplier{new Set(po.lines.map((l) => l.supplierId)).size === 1 ? "" : "s"} in their existing threads. Total <strong className="num">{money(po.total, po.currency)}</strong>.</div>
        ) : (
          <table className="ledger">
            <thead><tr><th>Item</th><th>Supplier</th><th className="num">Unit price</th><th className="num">Line total</th></tr></thead>
            <tbody>
              {lineItems.map((li) => {
                const opts = options.get(li._id) ?? [];
                const chosenRow = opts.find((s) => s.supplierId === li.chosenSupplierId);
                const line = chosenRow?.quote!.lines.find((l) => l.rfqLineItemId === li._id);
                return (
                  <tr key={li._id}>
                    <td>{li.productName} <span className="muted tiny">{li.quantity} {li.unit}</span></td>
                    <td>
                      <select className="input" style={{ width: 240 }} value={li.chosenSupplierId ?? ""} disabled={po?.status === "sending"} onChange={async (e) => { try { await choose({ rfqLineItemId: li._id, supplierId: e.target.value as Id<"suppliers"> }); } catch (err) { fail(err); } }}>
                        <option value="">Pick a supplier</option>
                        {opts.map((s) => { const l = s.quote!.lines.find((x) => x.rfqLineItemId === li._id)!; return <option key={s.supplierId} value={s.supplierId}>{s.name} · {money(l.unitPrice, l.currency)}/{l.unit}{s.quote!.rank === 1 ? " · recommended" : ""}</option>; })}
                      </select>
                    </td>
                    <td className="num">{line ? money(line.unitPrice, line.currency) : "—"}</td>
                    <td className="num">{line ? money(line.unitPrice * li.quantity, line.currency) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {po && po.status === "draft" && (
          <div className="callout leaf row spread">
            <span>PO <strong className="mono">{po.poNumber}</strong> ready: <strong className="num">{money(po.total, po.currency)}</strong> across {new Set(po.lines.map((l) => l.supplierId)).size} supplier{new Set(po.lines.map((l) => l.supplierId)).size === 1 ? "" : "s"}.</span>
            <button className="btn tomato" disabled={busy} onClick={async () => { setBusy(true); try { await send({ poId: po._id }); push("Purchase order sent through AgentMail.", "ok"); } catch (err) { fail(err); } finally { setBusy(false); } }}>
              {busy ? "Sending…" : "Send purchase order"}
            </button>
          </div>
        )}
        {(!po || po.status === "draft") && (
          <div className="row">
            <button className="btn" disabled={!allChosen || busy} onClick={async () => { setBusy(true); try { await generate({ rfqId }); push(po ? "PO regenerated." : "PO drafted. Review it, then send.", "ok"); } catch (err) { fail(err); } finally { setBusy(false); } }}>
              {po ? "Regenerate PO" : "Generate purchase order"}
            </button>
            {!allChosen && <span className="hint">Pick a supplier for every item first.</span>}
            {rfq.status === "open" && <span className="hint">Sending the PO closes this request.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function DemoPanel({ rfqId }: { rfqId: Id<"rfqs"> }) {
  const keys = useQuery(api.demoData.supplierKeys);
  const trigger = useMutation(api.demoData.triggerSupplierReply);
  const { fail, push } = useToast();
  if (!keys || keys.length === 0) return null;
  const styles: Record<string, "clean" | "messy" | "pdf"> = { greenleaf: "clean", nandini: "messy", metro: "pdf" };
  return (
    <div className="card-pad stack" style={{ borderTop: "1px dashed var(--line)", gap: 8 }}>
      <div className="eyebrow">Demo suppliers</div>
      <span className="tiny muted">Each button makes that supplier's real AgentMail inbox reply to its RFQ email. The reply travels through AgentMail, hits the signed webhook, and lands above.</span>
      <div className="row">
        {keys.map((k) => (
          <button key={k.key} className="btn secondary sm" onClick={async () => { try { await trigger({ rfqId, supplierKey: k.key, style: styles[k.key] }); push(`${k.name} is replying (${styles[k.key]})…`); } catch (err) { fail(err); } }}>
            Reply as {k.name.split(" ")[0]} · {styles[k.key]}
          </button>
        ))}
      </div>
    </div>
  );
}
