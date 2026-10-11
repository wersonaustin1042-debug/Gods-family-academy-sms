// Users log in with a "username" of the form GFA + their phone number,
// e.g. "GFA0245117679". This file builds/normalizes that username and maps
// it to an internal Supabase auth email — Supabase needs a real email or a
// valid E.164 phone as the auth identity, and arbitrary usernames aren't
// natively supported, so we use a hidden pseudo-email under the hood.
// This address is never used to send real mail.

export function buildUsername(raw) {
  if (!raw) return "";
  let v = raw.trim().toUpperCase();
  if (v.startsWith("GFA")) v = v.slice(3);
  const digits = v.replace(/[^0-9]/g, "");
  return "GFA" + digits;
}

export function usernameToAuthEmail(username) {
  return `${username.toLowerCase()}@gfa-sms.local`;
}

// The name a person types to sign in: the GFA… username for username accounts,
// or the real email for older email-only accounts.
export function authEmailToLoginName(email) {
  if (!email) return "";
  const suffix = "@gfa-sms.local";
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length).toUpperCase() : email;
}
