import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Shell } from "./Shell";

const queries: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: { name: string }) => queries[ref.name],
  useMutation: () => vi.fn(),
}));
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signOut: vi.fn() }) }));
vi.mock("@convex-dev/static-hosting/react", () => ({ UpdateBanner: () => null }));
vi.mock("../../convex/_generated/api", () => ({
  api: {
    email: { quarantineList: { name: "quarantine" } },
    usage: { today_: { name: "usage" } },
    businesses: { retryInbox: {} },
    demoData: { resetMine: {} },
    staticHosting: { getCurrentDeployment: {} },
  },
}));

const business = { name: "Chai Corner Cafe", city: "Bengaluru", agentInboxId: "cafe@agentmail.to", isDemo: false };

describe("Shell", () => {
  it("renders navigation, the sourcing inbox, and the AI budget", () => {
    queries.quarantine = [];
    queries.usage = { requests: 4, requestLimit: 300, tokens: 100, tokenLimit: 600000 };
    render(<MemoryRouter><Shell business={business}><p>page</p></Shell></MemoryRouter>);
    for (const name of ["Requests", "Suppliers", "Prices", "Orders", "Inbox"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("cafe@agentmail.to")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("Reset demo")).not.toBeInTheDocument();
  });

  it("badges unmatched mail on the Inbox link", () => {
    queries.quarantine = [{ _id: "q1" }, { _id: "q2" }];
    render(<MemoryRouter><Shell business={business}><p /></Shell></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Inbox/ })).toHaveTextContent("2");
  });

  it("explains a failed inbox and offers a retry", () => {
    queries.quarantine = [];
    render(
      <MemoryRouter>
        <Shell business={{ ...business, agentInboxId: null, inboxError: "The AgentMail plan's inbox limit is reached." }}><p /></Shell>
      </MemoryRouter>,
    );
    expect(screen.getByText(/inbox limit is reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "retry" })).toBeInTheDocument();
  });

  it("shows the demo reset only for demo businesses", () => {
    queries.quarantine = [];
    render(<MemoryRouter><Shell business={{ ...business, isDemo: true }}><p /></Shell></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Reset demo" })).toBeInTheDocument();
  });
});
