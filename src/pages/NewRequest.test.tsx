import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/Toast";
import NewRequest from "./NewRequest";

const parse = vi.fn();
const create = vi.fn();
const navigate = vi.fn();
vi.mock("convex/react", () => ({
  useAction: () => parse,
  useMutation: () => create,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

function setup() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <NewRequest />
      </ToastProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("NewRequest", () => {
  it("turns the note into chips, flags the ambiguous item, and blocks creation until it is filled", async () => {
    const user = setup();
    parse.mockResolvedValueOnce([
      { productName: "paneer", quantity: 20, unit: "kg", ambiguous: false, question: null },
      { productName: "egg", quantity: null, unit: null, ambiguous: true, question: "How many eggs?" },
    ]);
    await user.type(screen.getByRole("textbox", { name: /Type it like a note/ }), "20 kg paneer and some eggs");
    await user.click(screen.getByRole("button", { name: "Read items" }));
    expect(await screen.findByText("How many eggs?")).toBeInTheDocument();
    const createBtn = screen.getByRole("button", { name: /Create request/ });
    expect(createBtn).toBeDisabled();

    const eggChip = screen.getByText("egg").closest(".chip")!;
    await user.type(eggChip.querySelector("input")!, "5");
    await user.selectOptions(eggChip.querySelector("select")!, "dozen");
    expect(eggChip).not.toHaveClass("warn");
    expect(createBtn).toBeEnabled();

    create.mockResolvedValueOnce("rfq123");
    await user.click(createBtn);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          lineItems: [
            { productName: "paneer", quantity: 20, unit: "kg" },
            { productName: "egg", quantity: 5, unit: "dozen" },
          ],
        }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith("/rfqs/rfq123");
  });

  it("removes a chip with its remove button", async () => {
    const user = setup();
    parse.mockResolvedValueOnce([{ productName: "tomato", quantity: 5, unit: "kg", ambiguous: false, question: null }]);
    await user.type(screen.getByRole("textbox", { name: /Type it like a note/ }), "5 kg tomatoes");
    await user.click(screen.getByRole("button", { name: "Read items" }));
    await user.click(await screen.findByRole("button", { name: "Remove tomato" }));
    expect(screen.queryByText("tomato")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create request/ })).toBeDisabled();
  });

  it("surfaces a parse failure as a toast instead of crashing", async () => {
    const user = setup();
    parse.mockRejectedValueOnce(new Error("Uncaught ConvexError: Daily AI budget reached for today (300/300 requests). parseRequest will resume tomorrow."));
    await user.type(screen.getByRole("textbox", { name: /Type it like a note/ }), "anything");
    await user.click(screen.getByRole("button", { name: "Read items" }));
    expect(await screen.findByText(/Daily AI budget reached/)).toBeInTheDocument();
  });
});
