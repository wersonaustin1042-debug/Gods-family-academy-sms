"use client";

import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { changeOwnPassword } from "./actions";

export default function ChangePasswordForm({ forced }) {
  const router = useRouter();
  const supabase = createClient();
  const [state, formAction] = useFormState(changeOwnPassword, { error: null });

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inputCls =
    "w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pine/40";

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <img
          src="/logo.png"
          alt="God's Family Academy"
          className="h-14 w-14 mx-auto mb-2 object-contain"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <h1 className="font-display text-2xl font-semibold text-pine">
          {forced ? "Choose your password" : "Change password"}
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          {forced
            ? "You signed in with a temporary password. Choose your own to continue. No one else will see it."
            : "Enter your current password, then a new one."}
        </p>
      </div>

      <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
        {state?.error && (
          <p className="text-sm text-clay bg-clay/10 border border-clay/30 rounded-lg px-3 py-2">{state.error}</p>
        )}

        {!forced && (
          <div>
            <label className="text-xs font-medium text-stone-500">Current password</label>
            <input type="password" name="currentPassword" required autoComplete="current-password" className={inputCls} />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-stone-500">New password</label>
          <input
            type="password"
            name="newPassword"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="at least 8 characters"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Confirm new password</label>
          <input type="password" name="confirmPassword" required minLength={8} autoComplete="new-password" className={inputCls} />
        </div>
        <button type="submit" className="w-full bg-pine text-paper text-sm font-medium py-2.5 rounded-lg hover:bg-pine/90">
          Save password
        </button>
      </form>

      <button onClick={signOut} className="block mx-auto mt-4 text-xs text-stone-400 hover:text-clay">
        Sign out
      </button>
    </div>
  );
}
