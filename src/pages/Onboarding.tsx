import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useToast } from "../components/Toast";

type Business = { _id: string; name: string; category: string; city: string; deliveryPreferences: string; currency: string; onboardingComplete: boolean } | null;

const CATEGORIES = ["restaurant", "cafe", "cloud kitchen", "bakery", "bar", "grocery", "catering", "other"];

export default function Onboarding({ business }: { business: Business }) {
  const create = useMutation(api.businesses.create);
  const update = useMutation(api.businesses.update);
  const complete = useMutation(api.businesses.completeOnboarding);
  const seed = useMutation(api.demoData.seedMine);
  const { signOut } = useAuthActions();
  const { fail, push } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(business?.name ?? "");
  const [category, setCategory] = useState(business?.category ?? "restaurant");
  const [city, setCity] = useState(business?.city ?? "");
  const [prefs, setPrefs] = useState(business?.deliveryPreferences ?? "");
  const [currency, setCurrency] = useState(business?.currency ?? "INR");
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    if (business) {
      await update({ name, category, city, deliveryPreferences: prefs, currency });
    } else {
      await create({ name, category, city, deliveryPreferences: prefs, currency });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save();
      await complete();
      push("Business saved. Add suppliers or send your first request.", "ok");
      navigate("/suppliers");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function skipToDemo() {
    setBusy(true);
    try {
      if (!business) {
        await create({
          name: name || "Chai Corner Cafe",
          category: category || "cafe",
          city: city || "Bengaluru",
          deliveryPreferences: prefs || "Deliver before 10am at the back entrance. Weekly order on Thursdays.",
          currency: currency || "INR",
        });
      }
      await seed();
      push("Demo suppliers and price history are loading.", "ok");
      navigate("/");
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
        <div style={{ position: "relative", display: "grid", gap: 14 }}>
          <h1>Tell us about the kitchen.</h1>
          <p style={{ opacity: 0.85, maxWidth: "44ch" }}>
            This takes under a minute. Sourcer uses it to write quote requests in your voice and to give you a dedicated sourcing inbox.
          </p>
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <div>
            <div className="eyebrow">Step 1 of 1</div>
            <h2>Your business</h2>
          </div>
          <div className="field">
            <label htmlFor="bname">Business name</label>
            <input id="bname" className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Chai Corner Cafe" />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="cat">Category</label>
              <select id="cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cur">Currency</label>
              <select id="cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" className="input" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
          </div>
          <div className="field">
            <label htmlFor="prefs">Delivery preferences</label>
            <textarea id="prefs" className="input" value={prefs} onChange={(e) => setPrefs(e.target.value)} placeholder="Deliver before 10am at the back entrance. Weekly order on Thursdays." />
            <span className="hint">Goes into every quote request so suppliers price the right delivery.</span>
          </div>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button>
          <button className="btn secondary" type="button" disabled={busy} onClick={skipToDemo}>
            Skip: load the seeded demo kitchen
          </button>
          <button className="btn ghost" type="button" onClick={() => void signOut()}>Sign out</button>
        </form>
      </section>
    </div>
  );
}
