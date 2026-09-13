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
