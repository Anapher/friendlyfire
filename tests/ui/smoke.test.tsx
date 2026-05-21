import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrderBookLadder } from "@/app/_ui/OrderBookLadder";
import { ResponsiveTable, type Column } from "@/app/_ui/ResponsiveTable";
import { Segmented } from "@/app/_ui/Segmented";
import { summarizeBook } from "@/lib/bookView";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("UI primitives", () => {
  it("Segmented updates its hidden input when an option is clicked", () => {
    const { container } = render(
      <Segmented
        name="outcome"
        options={[
          { value: "YES", label: "YES" },
          { value: "NO", label: "NO" },
        ]}
        defaultValue="YES"
      />,
    );

    const hidden = container.querySelector('input[name="outcome"]') as HTMLInputElement;
    expect(hidden.value).toBe("YES");

    fireEvent.click(screen.getByRole("radio", { name: "NO" }));

    expect(hidden.value).toBe("NO");
  });

  it("ResponsiveTable renders primary content for each row", () => {
    type Row = { id: string; name: string };
    const columns: Column<Row>[] = [
      { key: "name", label: "Name", priority: "primary", render: (row) => row.name },
    ];
    render(
      <ResponsiveTable
        rows={[
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
        ]}
        columns={columns}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob").length).toBeGreaterThan(0);
  });

  it("OrderBookLadder renders ladder prices and quantities", () => {
    const levels = summarizeBook([
      { outcome: "YES", action: "BUY", limitPriceCents: 30, remainingQuantity: 5 },
      { outcome: "YES", action: "SELL", limitPriceCents: 40, remainingQuantity: 7 },
    ]);

    render(<OrderBookLadder levels={levels} />);

    expect(screen.getByText("30¢")).toBeTruthy();
    expect(screen.getByText("40¢")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("OrderBookLadder invokes onTap with the opposite side", () => {
    const taps: Array<{ outcome: string; action: string; priceCents: number }> = [];
    const levels = summarizeBook([
      { outcome: "YES", action: "BUY", limitPriceCents: 30, remainingQuantity: 5 },
      { outcome: "YES", action: "SELL", limitPriceCents: 40, remainingQuantity: 7 },
    ]);

    render(<OrderBookLadder levels={levels} onTap={(tap) => taps.push(tap)} />);

    fireEvent.click(screen.getByLabelText(/Sell YES into 5/));
    fireEvent.click(screen.getByLabelText(/Buy YES 7/));

    expect(taps).toEqual([
      { outcome: "YES", action: "SELL", priceCents: 30 },
      { outcome: "YES", action: "BUY", priceCents: 40 },
    ]);
  });
});
