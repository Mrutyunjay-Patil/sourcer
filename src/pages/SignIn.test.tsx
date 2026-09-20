import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../components/Toast";
import SignIn from "./SignIn";

const signIn = vi.fn();
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn, signOut: vi.fn() }),
}));

function setup() {
  render(
    <ToastProvider>
      <SignIn />
    </ToastProvider>,
  );
  return userEvent.setup();
}

describe("SignIn", () => {
  it("signs in with a lower-cased, trimmed email", async () => {
    const user = setup();
    signIn.mockResolvedValueOnce(undefined);
    await user.type(screen.getByLabelText("Email"), "  Judge@Sourcer.Demo ");
    await user.type(screen.getByLabelText("Password"), "SourcerJudge2026");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("password", {
        email: "judge@sourcer.demo",
        password: "SourcerJudge2026",
        flow: "signIn",
      }),
    );
  });

  it("switches to the sign-up flow and sends flow=signUp", async () => {
    const user = setup();
    signIn.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: /Create an account/ }));
    expect(screen.getByRole("heading", { name: "Sign up" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "new@shop.test");
    await user.type(screen.getByLabelText("Password"), "longenough1");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("password", expect.objectContaining({ flow: "signUp" })));
  });

  it("shows a readable message when the server rejects the credentials", async () => {
    const user = setup();
    signIn.mockRejectedValueOnce(new Error("Uncaught Error: InvalidSecret"));
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "wrongwrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("That email and password did not match.")).toBeInTheDocument();
  });
});
