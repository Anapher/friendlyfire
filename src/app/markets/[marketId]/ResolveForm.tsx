"use client";

import { useState } from "react";
import {
  correctMarketResolutionAction,
  resolveMarketAction,
} from "../../actions";
import { AlertDialog } from "../../_ui/AlertDialog";
import { Button } from "../../_ui/Button";
import { Field, fieldInputClasses } from "../../_ui/Field";
import { Segmented } from "../../_ui/Segmented";
import type { Resolution } from "@/domain/types";

type ResolveFormProps = {
  marketId: string;
  defaultResolution?: Resolution;
  mode: "RESOLVE" | "CORRECT";
};

const modeCopy = {
  RESOLVE: {
    title: "Resolve market?",
    description: "All open orders are cancelled, positions settled, and balances credited.",
    confirmLabel: "Resolve",
    submitLabel: "Resolve",
    action: resolveMarketAction,
  },
  CORRECT: {
    title: "Correct resolution?",
    description: "Re-settle positions and balances using the corrected outcome.",
    confirmLabel: "Correct resolution",
    submitLabel: "Correct resolution",
    action: correctMarketResolutionAction,
  },
} as const;

export function ResolveForm({ marketId, defaultResolution = "YES", mode }: ResolveFormProps) {
  const [resolution, setResolution] = useState<Resolution>(defaultResolution);
  const [note, setNote] = useState("");
  const copy = modeCopy[mode];

  async function submit() {
    const formData = new FormData();
    formData.set("marketId", marketId);
    formData.set("resolution", resolution);
    formData.set("note", note);
    await copy.action(formData);
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Result">
        <Segmented<Resolution>
          name="resolution"
          value={resolution}
          onChange={setResolution}
          options={[
            { value: "YES", label: "YES" },
            { value: "NO", label: "NO" },
            { value: "CANCELLED", label: "CANCEL" },
          ]}
          ariaLabel="Resolution result"
        />
      </Field>
      <Field label="Note">
        <textarea
          name="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={fieldInputClasses("min-h-24 py-2")}
        />
      </Field>
      <AlertDialog
        trigger={
          <Button variant="danger" fullWidth>
            {copy.submitLabel}
          </Button>
        }
        title={copy.title}
        description={
          <span>
            {copy.description} Result: <strong>{resolution}</strong>
          </span>
        }
        confirmLabel={copy.confirmLabel}
        onConfirm={submit}
      />
    </div>
  );
}
