"use client";

import { blacklistUserAction } from "../../actions";
import { Button } from "../../_ui/Button";
import { Field, fieldInputClasses } from "../../_ui/Field";

type BlacklistFormProps = {
  marketId: string;
  users: { id: string; name: string }[];
};

export function BlacklistForm({ marketId, users }: BlacklistFormProps) {
  return (
    <form action={blacklistUserAction} className="flex flex-col gap-3">
      <input type="hidden" name="marketId" value={marketId} />
      <Field label="User">
        <select name="userId" required className={fieldInputClasses()} defaultValue="">
          <option value="" disabled>
            Select user…
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note">
        <input
          name="note"
          placeholder="Conflict or eligibility note"
          className={fieldInputClasses()}
        />
      </Field>
      <Button type="submit" fullWidth>
        Blacklist user
      </Button>
    </form>
  );
}
