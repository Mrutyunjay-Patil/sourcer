import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { NavLink, useNavigate } from "react-router-dom";
import { UpdateBanner } from "@convex-dev/static-hosting/react";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";

type Business = {
  name: string;
  city: string;
  agentInboxId: string | null;
  isDemo: boolean;
};

export function Shell({ business, children }: { business: Business; children: ReactNode }) {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const quarantine = useQuery(api.email.quarantineList);
  const usage = useQuery(api.usage.today_);
  const unmatched = quarantine?.length ?? 0;
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">Sourcer</div>
            <div className="brand-sub">{business.name}</div>
          </div>
        </div>
        <nav className="nav stack" style={{ gap: 2 }}>
          <NavLink to="/" end>Requests</NavLink>
          <NavLink to="/suppliers">Suppliers</NavLink>
          <NavLink to="/prices">Prices</NavLink>
          <NavLink to="/history">Orders</NavLink>
          <NavLink to="/inbox">
            Inbox {unmatched > 0 && <span className="badge">{unmatched}</span>}
          </NavLink>
        </nav>
        <button className="btn tomato" style={{ marginTop: 14, justifyContent: "center" }} onClick={() => navigate("/rfqs/new")}>
          + New request
        </button>
        <div className="rail-foot">
          <div>
            <div className="tiny" style={{ color: "var(--ink-mute)" }}>Sourcing inbox</div>
            <div className="mono tiny" style={{ wordBreak: "break-all" }}>{business.agentInboxId ?? "provisioning…"}</div>
          </div>
          {usage && (
            <div className="tiny">AI today: <span className="num">{usage.requests}</span>/<span className="num">{usage.requestLimit}</span> calls</div>
          )}
          <button className="btn ghost sm" style={{ justifySelf: "start", padding: "4px 0" }} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <UpdateBanner getCurrentDeployment={api.staticHosting.getCurrentDeployment} message="A new version of Sourcer is ready." buttonText="Reload" />
        {children}
      </main>
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty card">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card card-pad stack">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${70 - i * 12}%` }} />
      ))}
    </div>
  );
}
