import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PageHead } from "../components/Shell";
import { useToast } from "../components/Toast";
import { toLocalInput } from "../lib/format";

const UNITS = ["kg", "g", "L", "ml", "pcs", "dozen", "box", "crate", "bag", "packet", "bunch", "tin", "bottle"];

type Chip = { productName: string; quantity: number | null; unit: string | null; ambiguous: boolean; question: string | null };

export default function NewRequest() {
  const parse = useAction(api.ai.parseRequest);
  const create = useMutation(api.rfqs.create);
  const navigate = useNavigate();
  const { fail, push } = useToast();
  const [text, setText] = useState("");
  const [chips, setChips] = useState<Chip[] | null>(null);
  const [deliveryWindow, setDeliveryWindow] = useState("Thursday morning");
  const [replyBy, setReplyBy] = useState(toLocalInput(Date.now() + 24 * 3600_000));
  const [followUpHours, setFollowUpHours] = useState("12");
  const [busy, setBusy] = useState<"parse" | "create" | null>(null);

  async function doParse() {
    if (!text.trim()) return;
    setBusy("parse");
    try {
      const items = await parse({ text });
      if (items.length === 0) push("No items found. Try naming quantities, like '20 kg paneer'.", "error");
      setChips(items);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  function edit(i: number, patch: Partial<Chip>) {
    setChips((c) => c && c.map((x, j) => (j === i ? { ...x, ...patch, ambiguous: false } : x)));
  }

  const ready = chips && chips.length > 0 && chips.every((c) => c.quantity && c.quantity > 0 && c.unit);

  async function doCreate() {
    if (!chips || !ready) return;
    setBusy("create");
    try {
      const replyByAt = new Date(replyBy).getTime();
      const rfqId = await create({
        rawRequest: text,
        lineItems: chips.map((c) => ({ productName: c.productName, quantity: c.quantity!, unit: c.unit! })),
        deliveryWindow,
        replyByAt,
        followUpAfterMs: Math.max(0.01, Number(followUpHours) || 12) * 3600_000,
      });
      navigate(`/rfqs/${rfqId}`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHead eyebrow="New request" title="What does the kitchen need?" />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
        <div className="stack">
          <div className="card card-pad stack">
            <label className="field">
              <span>Type it like a note to yourself</span>
              <textarea
                className="input"
                rows={4}
                placeholder="20 kg paneer, 10 L sunflower oil, 5 kg tomatoes, and a few boxes of eggs"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void doParse(); }}
              />
            </label>
            <div className="row spread">
              <span className="hint">OpenAI turns this into line items. Ambiguous ones get a question, not a guess.</span>
              <button className="btn" onClick={doParse} disabled={busy !== null || !text.trim()}>
                {busy === "parse" ? "Reading…" : chips ? "Re-read" : "Read items"}
              </button>
            </div>
          </div>

          {chips && (
            <div className="card card-pad stack fade-in">
              <div className="row spread">
                <h3>Line items</h3>
                <span className="muted small">{chips.length} item{chips.length === 1 ? "" : "s"}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {chips.map((c, i) => (
                  <span key={i} className={`chip ${c.ambiguous ? "warn" : ""}`} title={c.question ?? undefined}>
                    <strong>{c.productName}</strong>
                    <input type="number" min={0} step="any" value={c.quantity ?? ""} placeholder="qty" onChange={(e) => edit(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })} />
                    <select value={c.unit ?? ""} onChange={(e) => edit(i, { unit: e.target.value || null })}>
                      <option value="">unit</option>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <button className="x" aria-label={`Remove ${c.productName}`} onClick={() => setChips(chips.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
              </div>
              {chips.some((c) => c.ambiguous) && (
                <div className="callout amber stack" style={{ gap: 4 }}>
                  {chips.filter((c) => c.ambiguous).map((c, i) => (
                    <div key={i} className="small"><strong>{c.productName}:</strong> {c.question ?? "Please confirm the quantity and unit."}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card card-pad stack">
          <h3>Send settings</h3>
          <label className="field">
            <span>Delivery window</span>
            <input className="input" value={deliveryWindow} onChange={(e) => setDeliveryWindow(e.target.value)} />
          </label>
          <label className="field">
            <span>Suppliers must reply by</span>
            <input className="input" type="datetime-local" value={replyBy} onChange={(e) => setReplyBy(e.target.value)} />
            <span className="hint">The request auto-closes and ranks at this time.</span>
          </label>
          <label className="field">
            <span>Nudge silent suppliers after (hours)</span>
            <input className="input" type="number" min={0.05} step="any" value={followUpHours} onChange={(e) => setFollowUpHours(e.target.value)} />
            <span className="hint">One polite follow-up in the same thread, never more.</span>
          </label>
          <button className="btn tomato" disabled={!ready || busy !== null} onClick={doCreate}>
            {busy === "create" ? "Creating…" : "Create request and draft the email"}
          </button>
          {!ready && chips && <span className="hint">Fill every quantity and unit to continue.</span>}
        </div>
      </div>
    </>
  );
}
