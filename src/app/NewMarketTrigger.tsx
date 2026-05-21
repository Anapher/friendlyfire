"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createMarketAction } from "./actions";
import { Button } from "./_ui/Button";
import { Drawer } from "./_ui/Drawer";
import { Field, fieldInputClasses } from "./_ui/Field";

type NewMarketTriggerProps = {
  defaultCloseTime: string;
};

export function NewMarketTrigger({ defaultCloseTime }: NewMarketTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title="New market"
      description="Create a new prediction market."
      trigger={
        <Button variant="primary">
          <Plus className="h-4 w-4" aria-hidden />
          New market
        </Button>
      }
    >
      <form action={createMarketAction} className="flex flex-col gap-3">
        <Field label="Question">
          <input
            name="question"
            required
            placeholder="Will the demo work?"
            className={fieldInputClasses()}
          />
        </Field>
        <Field label="Resolution criteria">
          <textarea
            name="resolutionCriteria"
            required
            rows={3}
            className={fieldInputClasses("min-h-24 py-2")}
          />
        </Field>
        <Field label="Close time">
          <input
            name="closeTime"
            type="datetime-local"
            defaultValue={defaultCloseTime}
            required
            className={fieldInputClasses()}
          />
        </Field>
        <Button type="submit" fullWidth>
          Create market
        </Button>
      </form>
    </Drawer>
  );
}
