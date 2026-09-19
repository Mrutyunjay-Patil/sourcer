import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Empty, Loading, PageHead } from "../components/Shell";
import { money, until, when } from "../lib/format";

export default function Dashboard() {
  const rfqs = useQuery(api.rfqs.list);
  const navigate = useNavigate();
  if (rfqs === undefined) return <><PageHead eyebrow="Requests" title="Quote requests" /><Loading /></>;
  const open = rfqs.filter((r) => r.status === "open" || r.status === "sending");
  const drafts = rfqs.filter((r) => r.status === "draft");
  const closed = rfqs.filter((r) => r.status === "closed");
  return (
    <>
      <PageHead eyebrow="Requests" title="Quote requests">
        <button className="btn tomato" onClick={() => navigate("/rfqs/new")}>+ New request</button>
      </PageHead>
      {rfqs.length === 0 ? (
        <Empty title="No requests yet" action={<button className="btn" onClick={() => navigate("/rfqs/new")}>Write your first request</button>}>
          Type what the kitchen needs, pick suppliers, and Sourcer handles the email thread.
        </Empty>
      ) : (
        <div className="stack" style={{ gap: 22 }}>
          {open.length > 0 && <Section title="Open" rows={open} />}
          {drafts.length > 0 && <Section title="Drafts" rows={drafts} />}
          {closed.length > 0 && <Section title="Closed" rows={closed} />}
        </div>
      )}
    </>
  );
}

type Row = {
  _id: string; title: string; status: string; replyByAt: number; closedAt?: number | null;
  supplierCount: number; repliedCount: number; poStatus: string | null; poTotal: number | null; currency: string; _creationTime: number;
};

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const navigate = useNavigate();
  return (
    <div className="card fade-in">
      <div className="card-head"><h3>{title}</h3><span className="muted small">{rows.length}</span></div>
      <table className="ledger">
        <thead>
          <tr><th>Request</th><th>Status</th><th>Suppliers</th><th>Replies</th><th>Reply by</th><th className="num">Order</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className="clickable" onClick={() => navigate(`/rfqs/${r._id}`)}>
              <td><strong>{r.title}</strong><div className="tiny muted">created {when(r._creationTime)}</div></td>
              <td><span className={`pill ${r.status}`}>{r.status}</span></td>
              <td className="num">{r.supplierCount}</td>
              <td className="num">{r.repliedCount}</td>
              <td>{r.status === "closed" ? <span className="muted">closed {when(r.closedAt)}</span> : <>in {until(r.replyByAt)}</>}</td>
              <td className="num">{r.poStatus ? <>{money(r.poTotal, r.currency)} <span className={`pill ${r.poStatus === "sent" ? "parsed" : "draft"}`}>{r.poStatus}</span></> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
