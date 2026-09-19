import { useAuthActions } from "@convex-dev/auth/react";
import { useState, type FormEvent } from "react";
import { useToast } from "../components/Toast";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const { fail } = useToast();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      fail(new Error("Use a password with at least 8 characters."));
      return;
    }
    setBusy(true);
    try {
      await signIn("password", { email: email.trim().toLowerCase(), password, flow });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-art">
        <div className="lines" />
        <div className="row" style={{ position: "relative" }}>
          <div className="brand-mark" style={{ background: "var(--paper)", color: "var(--ink)" }}>S</div>
          <span className="brand-name">Sourcer</span>
        </div>
        <div style={{ position: "relative", display: "grid", gap: 18 }}>
          <h1>Your weekly reorder, quoted and ranked before service.</h1>
          <p style={{ maxWidth: 46 + "ch", opacity: 0.85, fontSize: 16 }}>
            Type what the kitchen needs. Sourcer finds suppliers, emails them for quotes,
            reads the replies as they land, and drafts the purchase order.
          </p>
          <div className="row tiny" style={{ opacity: 0.7, gap: 14 }}>
            <span>Firecrawl finds</span><span>·</span><span>AgentMail talks</span><span>·</span><span>OpenAI reads</span><span>·</span><span>Convex runs it live</span>
          </div>
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <div>
            <div className="eyebrow">{flow === "signIn" ? "Welcome back" : "Create your account"}</div>
            <h2>{flow === "signIn" ? "Sign in" : "Sign up"}</h2>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete={flow === "signIn" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            {flow === "signUp" && <span className="hint">At least 8 characters.</span>}
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "One moment…" : flow === "signIn" ? "Sign in" : "Create account"}
          </button>
          <button type="button" className="btn ghost" onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
            {flow === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
