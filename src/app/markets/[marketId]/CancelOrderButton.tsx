"use client";

import { cancelOrderAction } from "../../actions";
import { AlertDialog } from "../../_ui/AlertDialog";
import { Button } from "../../_ui/Button";

type CancelOrderButtonProps = {
  marketId: string;
  orderId: string;
};

export function CancelOrderButton({ marketId, orderId }: CancelOrderButtonProps) {
  async function submit() {
    const formData = new FormData();
    formData.set("marketId", marketId);
    formData.set("orderId", orderId);
    await cancelOrderAction(formData);
  }

  return (
    <AlertDialog
      trigger={
        <Button variant="secondary" className="w-auto px-3 text-danger">
          Cancel
        </Button>
      }
      title="Cancel this order?"
      description="The order will be removed from the book and any locked balance returned."
      confirmLabel="Cancel order"
      cancelLabel="Keep"
      onConfirm={submit}
    />
  );
}
