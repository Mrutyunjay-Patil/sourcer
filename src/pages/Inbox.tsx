import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Empty, Loading, PageHead } from "../components/Shell";
import { when } from "../lib/format";

export default function Inbox() {
  const rows = useQuery(api.email.quarantineList);
  const me = useQuery(api.businesses.me);
  if (rows === undefined) return <><PageHead eyebrow="Inbox" title="Unmatched mail" /><Loading /></>;
  return (
    <>
      <PageHead eyebrow="Inbox" title="Unmatched mail">
        <span className="mono small muted">{me?.agentInboxId}</span>
      </PageHead>
      {rows.length === 0 ? (
        <Empty title="Nothing waiting">Every email that reaches your sourcing inbox is matched to a request thread. Anything that cannot be matched lands here instead of being dropped.</Empty>
      ) : (
        <div className="stack fade-in">
          {rows.map((r) => (
            <div key={r._id} className="card card-pad stack" style={{ gap: 6 }}>
              <div className="row spread">
                <strong>{r.subject || "(no subject)"}</strong>
                <span className="tiny muted">{when(r.receivedAt)}</span>
              </div>
              <div className="mono small">{r.fromAddress}</div>
              <p className="small muted">{r.preview}</p>
              <span className="tiny" style={{ color: "var(--amber)" }}>{r.reason}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
