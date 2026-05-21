"use client";

import { useState, useTransition } from "react";
import { adjustBalanceAction } from "../actions";
import { Button } from "../_ui/Button";
import { Drawer } from "../_ui/Drawer";
import { Field, fieldInputClasses } from "../_ui/Field";

type AdjustBalanceDrawerProps = {
  targetUserId: string;
  targetUserName: string;
};

export function AdjustBalanceDrawer({ targetUserId, targetUserName }: AdjustBalanceDrawerProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submitAdjustment(formData: FormData) {
    startTransition(async () => {
      await adjustBalanceAction(formData);
      setOpen(false);
    });
  }

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title={`Adjust balance — ${targetUserName}`}
      description="Positive amount credits the user, negative debits them."
      trigger={
        <Button variant="secondary">Adjust balance</Button>
      }
    >
      <form action={submitAdjustment} className="flex flex-col gap-3">
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <Field label="Amount (cents)">
          <input
            name="amountCents"
            type="number"
            inputMode="numeric"
            step={1}
            defaultValue={1000}
            required
            className={fieldInputClasses()}
          />
        </Field>
        <Field label="Note">
          <input
            name="note"
            required
            placeholder="Local adjustment"
            className={fieldInputClasses()}
          />
        </Field>
        <Button type="submit" fullWidth disabled={isPending}>
          {isPending ? "Applying..." : "Apply adjustment"}
        </Button>
      </form>
    </Drawer>
  );
}
