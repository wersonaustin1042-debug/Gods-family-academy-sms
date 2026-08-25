"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
// Makes sure a student has a tuition plan and canteen/transport fee rows.
export async function ensureFeeSetup(studentId) {
  const supabase = createClient();
  const { data: plan } = await supabase
    .from("tuition_plans")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (!plan) {
    await supabase.from("tuition_plans").insert({ student_id: studentId, total_amount: 1200, amount_paid: 0 });
  }
  const { data: existingFees } = await supabase
    .from("recurring_fees")
    .select("fee_type")
    .eq("student_id", studentId);
  const have = new Set((existingFees || []).map((f) => f.fee_type));
  const toInsert = [];
  if (!have.has("canteen")) {
    toInsert.push({ student_id: studentId, fee_type: "canteen", frequency: "daily", amount: 5 });
  }
  if (!have.has("transport")) {
    toInsert.push({ student_id: studentId, fee_type: "transport", frequency: "monthly", amount: 60 });
  }
  if (toInsert.length > 0) {
    await supabase.from("recurring_fees").insert(toInsert);
  }
}
export async function changeFrequency(formData) {
  const supabase = createClient();
  const feeId = formData.get("feeId");
  const frequency = formData.get("frequency");
  await supabase.from("recurring_fees").update({ frequency }).eq("id", feeId);
  revalidatePath("/fees");
}
// Saves a whole month's worth of canteen/transport amounts at once.
// Only touches rows that are actually new or actually changed, so
// recorded_by on untouched entries is never overwritten.
export async function saveRecurringMonth(formData) {
  const supabase = createClient();
  const feeId = formData.get("feeId");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existingRows } = await supabase
    .from("recurring_fee_payments")
    .select("period_key, amount")
    .eq("recurring_fee_id", feeId);
  const existingByPeriod = {};
  (existingRows || []).forEach((r) => {
    existingByPeriod[r.period_key] = Number(r.amount);
  });

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("amt__")) continue;
    const periodKey = key.replace("amt__", "");
    const hadExisting = periodKey in existingByPeriod;

    if (value === "") {
      if (hadExisting) {
        await supabase
          .from("recurring_fee_payments")
          .delete()
          .eq("recurring_fee_id", feeId)
          .eq("period_key", periodKey);
      }
      continue;
    }

    const newAmount = Number(value);
    if (hadExisting && existingByPeriod[periodKey] === newAmount) {
      // Unchanged — leave the row (and its original recorded_by) alone.
      continue;
    }

    await supabase.from("recurring_fee_payments").upsert(
      { recurring_fee_id: feeId, period_key: periodKey, amount: newAmount, recorded_by: user?.id },
      { onConflict: "recurring_fee_id,period_key" }
    );
  }
  revalidatePath("/fees");
}
// Saves a whole month's worth of tuition payments (one entry per day) at once.
// Only touches rows that are actually new or actually changed, so
// recorded_by on untouched entries is never overwritten.
export async function saveTuitionMonth(formData) {
  const supabase = createClient();
  const studentId = formData.get("studentId");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existingRows } = await supabase
    .from("tuition_payments")
    .select("paid_on, amount")
    .eq("student_id", studentId);
  const existingByDate = {};
  (existingRows || []).forEach((r) => {
    existingByDate[r.paid_on] = Number(r.amount);
  });

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("amt__")) continue;
    const dateIso = key.replace("amt__", "");
    const hadExisting = dateIso in existingByDate;

    if (value === "") {
      if (hadExisting) {
        await supabase.from("tuition_payments").delete().eq("student_id", studentId).eq("paid_on", dateIso);
      }
      continue;
    }

    const newAmount = Number(value);
    if (hadExisting && existingByDate[dateIso] === newAmount) {
      // Unchanged — leave the row (and its original recorded_by) alone.
      continue;
    }

    await supabase.from("tuition_payments").upsert(
      { student_id: studentId, paid_on: dateIso, amount: newAmount, recorded_by: user?.id },
      { onConflict: "student_id,paid_on" }
    );
  }
  // Recompute the running total from the ledger, so it never drifts
  const { data: payments } = await supabase
    .from("tuition_payments")
    .select("amount")
    .eq("student_id", studentId);
  const total = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
  await supabase.from("tuition_plans").update({ amount_paid: total }).eq("student_id", studentId);
  revalidatePath("/fees");
}
