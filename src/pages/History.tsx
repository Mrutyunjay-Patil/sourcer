import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Empty, Loading, PageHead } from "../components/Shell";
import { money, when } from "../lib/format";

export default function History() {
  const orders = useQuery(api.rfqs.history);
  const navigate = useNavigate();
  if (orders === undefined) return <><PageHead eyebrow="Orders" title="Order history" /><Loading /></>;
  return (
    <>
      <PageHead eyebrow="Orders" title="Order history" />
      {orders.length === 0 ? (
        <Empty title="No purchase orders yet">Approve a ranked quote on a request and the PO will show up here with its total and suppliers.</Empty>
      ) : (
        <div className="card fade-in">
          <table className="ledger">
            <thead><tr><th>PO</th><th>Request</th><th>Suppliers</th><th>Status</th><th>Sent</th><th className="num">Total</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id} className="clickable" onClick={() => navigate(`/rfqs/${o.rfqId}`)}>
                  <td className="mono">{o.poNumber}</td>
                  <td>{o.rfqTitle}</td>
                  <td>{o.suppliers.join(", ")}</td>
                  <td><span className={`pill ${o.status === "sent" ? "parsed" : o.status}`}>{o.status}</span></td>
                  <td className="muted">{o.sentAt ? when(o.sentAt) : "—"}</td>
                  <td className="num"><strong>{money(o.total, o.currency)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
