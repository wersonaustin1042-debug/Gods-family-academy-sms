// Server-only helpers for temporary passwords and who may manage logins.
import { randomInt } from "crypto";

// No look-alike characters (0, 1, O, I, l) so a password read out over the phone or copied
// from a screen isn't mistyped.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const POOL = LETTERS + DIGITS;

export const MIN_PASSWORD_LENGTH = 8;

// Random temporary password, always containing at least one letter and one digit.
export function generateTempPassword(length = 10) {
  const size = Math.max(length, 4);
  for (;;) {
    let out = "";
    for (let i = 0; i < size; i++) out += POOL[randomInt(POOL.length)];
    if (/[A-Za-z]/.test(out) && /[0-9]/.test(out)) return out;
  }
}

// Roles allowed to create logins and reset passwords (matches is_admin_like() in the database)
export const ADMIN_LIKE_ROLES = ["admin", "director", "headmaster", "assistant_headmaster"];

// Only these may create or reset the most powerful accounts
export const TOP_ROLES = ["admin", "director"];
