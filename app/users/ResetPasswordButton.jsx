"use client";

import { useFormState } from "react-dom";
import { resetUserPassword } from "./actions";

export default function ResetPasswordButton({ userId, name }) {
  const [state, formAction] = useFormState(resetUserPassword, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Give ${name} a new temporary password? Their current password will stop working.`)) {
          e.preventDefault();
        }
      }}
      className="space-y-1"
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="text-[11px] font-medium bg-stone-100 hover:bg-clay/10 hover:text-clay text-stone-600 px-2.5 py-1 rounded-full"
      >
        Reset password
      </button>
      {state?.error && <p className="text-[11px] text-clay">{state.error}</p>}
      {state?.tempPassword && (
        <div className="text-[11px] text-ink bg-pine/10 border border-pine/30 rounded-lg px-2 py-1.5 space-y-0.5">
          <p>{state.success}</p>
          <p>
            Username: <span className="font-mono font-bold select-all">{state.loginName}</span>
          </p>
          <p>
            Password: <span className="font-mono font-bold select-all">{state.tempPassword}</span>
          </p>
          <p className="text-stone-500">Shown only now. They must choose their own at next sign-in.</p>
        </div>
      )}
    </form>
  );
}
