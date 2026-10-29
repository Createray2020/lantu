"use client";

import { useActionState } from "react";
import { FIELD } from "@/components/ui/Field";
import { lookupClaimAction, type ClaimFormState } from "./actions";

export default function ClaimForm() {
  const [state, action, pending] = useActionState<ClaimFormState, FormData>(lookupClaimAction, { error: null });
  return (
    <form action={action} className="grid gap-3 text-left">
      <input
        name="claim"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="2610008-483921"
        className={`${FIELD} text-center font-mono text-lg tracking-wider`}
      />
      <button type="submit" disabled={pending} className="font-bold text-onbrand bg-brand hover:bg-brand2 px-6 py-2.5 rounded-lg disabled:opacity-50">
        {pending ? "查詢中…" : "下一步"}
      </button>
      {state.error && <p className="text-danger text-sm text-center">⚠ {state.error}</p>}
    </form>
  );
}
