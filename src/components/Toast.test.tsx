import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { ToastProvider, friendlyError, useToast } from "./Toast";

describe("friendlyError", () => {
  it("passes through a ConvexError message untouched", () => {
    expect(friendlyError(new ConvexError("Pick at least one supplier."))).toBe("Pick at least one supplier.");
  });
  it("extracts the message from a server-formatted ConvexError string", () => {
    const err = new Error("[Request ID: abc] Server Error\nUncaught ConvexError: You already have a business.\n at handler");
    expect(friendlyError(err)).toBe("You already have a business.");
  });
  it("translates auth failures into plain language", () => {
    expect(friendlyError(new Error("InvalidSecret"))).toBe("That email and password did not match.");
    expect(friendlyError(new Error("AccountAlreadyExists"))).toMatch(/already exists/);
  });
  it("hides raw server errors and stack traces", () => {
    const out = friendlyError(new Error("[Request ID: x] Server Error\n at a\n at b\n at c"));
    expect(out).not.toMatch(/Request ID|at a/);
    expect(out).toBe("Something went wrong on our side. Please try again.");
  });
  it("never shows a very long unknown message verbatim", () => {
    expect(friendlyError(new Error("x".repeat(400)))).toBe("Something went wrong. Please try again.");
  });
});

function Pusher() {
  const { push, fail } = useToast();
  return (
    <>
      <button onClick={() => push("Saved.", "ok")}>ok</button>
      <button onClick={() => fail(new ConvexError("Nope."))}>fail</button>
    </>
  );
}

describe("ToastProvider", () => {
  it("renders pushed toasts with their tone", () => {
    render(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    act(() => screen.getByText("ok").click());
    act(() => screen.getByText("fail").click());
    expect(screen.getByText("Saved.")).toHaveClass("toast", "ok");
    expect(screen.getByText("Nope.")).toHaveClass("toast", "error");
  });
});
