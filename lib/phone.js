// Normalizes a Ghana phone number to E.164 format (e.g. "0245117679" -> "+233245117679").
// Leaves already-E.164 numbers (starting with "+") unchanged.
export function normalizePhone(raw) {
  if (!raw) return raw;
  const v = raw.trim().replace(/[\s-]/g, "");
  if (v.startsWith("+")) return v;
  if (v.startsWith("233")) return "+" + v;
  if (v.startsWith("0")) return "+233" + v.slice(1);
  return "+233" + v;
}
