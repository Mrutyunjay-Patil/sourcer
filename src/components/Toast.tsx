import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ConvexError } from "convex/values";

type Toast = { id: number; text: string; kind: "info" | "error" | "ok" };
type Ctx = { push: (text: string, kind?: Toast["kind"]) => void; fail: (err: unknown) => void };

const ToastCtx = createContext<Ctx | null>(null);

/** Turn any thrown value into a sentence a restaurant owner can read. */
export function friendlyError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data) return String((data as { message: unknown }).message);
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/ConvexError:\s*(.+?)(\n|$)/.test(msg)) return msg.match(/ConvexError:\s*(.+?)(\n|$)/)![1];
  if (/Uncaught ConvexError:\s*(.+?)(\n|$)/.test(msg)) return msg.match(/Uncaught ConvexError:\s*(.+?)(\n|$)/)![1];
  if (/InvalidAccountId|InvalidSecret|Invalid password/i.test(msg)) return "That email and password did not match.";
  if (/already exists|AccountAlreadyExists/i.test(msg)) return "An account with that email already exists. Sign in instead.";
  if (/Server Error/i.test(msg)) return "Something went wrong on our side. Please try again.";
  return msg.length > 160 ? "Something went wrong. Please try again." : msg;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const fail = useCallback((err: unknown) => push(friendlyError(err), "error"), [push]);
  const value = useMemo(() => ({ push, fail }), [push, fail]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
}
