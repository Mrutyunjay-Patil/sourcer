import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";

const navigate = vi.fn();
let rows: unknown = undefined;
vi.mock("convex/react", () => ({ useQuery: () => rows }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const rfq = (over: Record<string, unknown>) => ({
  _id: "r1",
  _creationTime: Date.now() - 60_000,
  title: "paneer, oil",
  status: "open",
  replyByAt: Date.now() + 600_000,
  closedAt: null,
  supplierCount: 2,
  repliedCount: 1,
  poStatus: null,
  poTotal: null,
  currency: "INR",
  ...over,
});

describe("Dashboard", () => {
  it("shows a loading skeleton while the query is pending", () => {
    rows = undefined;
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Quote requests" })).toBeInTheDocument();
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("shows an intentional empty state with a call to action", async () => {
    rows = [];
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText("No requests yet")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Write your first request" }));
    expect(navigate).toHaveBeenCalledWith("/rfqs/new");
  });

  it("groups requests by status and opens a request on click", async () => {
    rows = [
      rfq({ _id: "open1", status: "open" }),
      rfq({ _id: "d1", status: "draft", title: "draft one" }),
      rfq({ _id: "c1", status: "closed", title: "closed one", closedAt: Date.now(), poStatus: "sent", poTotal: 7515 }),
    ];
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Drafts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Closed" })).toBeInTheDocument();
    expect(screen.getByText("₹7,515.00")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("closed one"));
    expect(navigate).toHaveBeenCalledWith("/rfqs/c1");
  });
});
