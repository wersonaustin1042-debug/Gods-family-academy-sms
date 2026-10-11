"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

// Checks a password against the auth server without touching the signed-in user's cookies/session.
async function passwordWorks(email, password) {
  const probe = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  return !error && !!data?.session;
}

export async function changeOwnPassword(prevState, formData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // Read from the server's copy of the user, never from the form
  const forced = user.app_metadata?.must_change_password === true;

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (newPassword !== confirmPassword) {
    return { error: "The two new passwords don't match." };
  }

  // A voluntary change must prove the current password; a forced change comes straight after
  // signing in with the temporary one, so it skips that.
  if (!forced) {
    if (!currentPassword || !(await passwordWorks(user.email, currentPassword))) {
      return { error: "Your current password isn't correct." };
    }
  }

  // The new password can't be the one that already works (the temporary or the current one)
  if (await passwordWorks(user.email, newPassword)) {
    return { error: "Please choose a different password from the one you signed in with." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
    app_metadata: { must_change_password: false },
  });
  if (error) return { error: error.message };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  let destination = "/dashboard";
  if (profile?.role === "parent") destination = "/parent";
  else if (profile?.role === "accountant") destination = "/fees";
  else if (profile?.role === "teacher") destination = "/attendance";

  redirect(destination);
}
