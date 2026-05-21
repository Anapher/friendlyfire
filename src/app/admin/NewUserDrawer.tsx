"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createUserAction } from "../actions";
import { Button } from "../_ui/Button";
import { Drawer } from "../_ui/Drawer";
import { Field, fieldInputClasses } from "../_ui/Field";

export function NewUserDrawer() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submitUser(formData: FormData) {
    startTransition(async () => {
      await createUserAction(formData);
      setOpen(false);
    });
  }

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title="New user"
      description="Create a local account."
      trigger={
        <Button variant="primary">
          <Plus className="h-4 w-4" aria-hidden />
          New user
        </Button>
      }
    >
      <form action={submitUser} className="flex flex-col gap-3">
        <Field label="Name">
          <input name="name" required placeholder="New Friend" className={fieldInputClasses()} />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            placeholder="friend@example.com"
            className={fieldInputClasses()}
          />
        </Field>
        <Field label="Role">
          <select name="role" defaultValue="USER" required className={fieldInputClasses()}>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </Field>
        <Field label="Starting balance (cents)">
          <input
            name="startingBalanceCents"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={0}
            required
            className={fieldInputClasses()}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            name="digestOptOut"
            type="checkbox"
            className="h-4 w-4 rounded border-line-strong text-accent focus-visible:ring-2 focus-visible:ring-accent"
          />
          Digest opt-out
        </label>
        <Button type="submit" fullWidth disabled={isPending}>
          {isPending ? "Creating..." : "Create user"}
        </Button>
      </form>
    </Drawer>
  );
}
