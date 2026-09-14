"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Makes sure a student has a tuition plan and a canteen+transport fee row.
export async function ensureFeeSetup(studentId) {
  const supabase = createClient();
  const { data: plan } = await supabase
    .from("tuition_plans")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (!plan) {
    const { data: setting } = await supabase
      .from("fee_settings")
      .select("value")
      .eq("key", "default_tuition")
      .maybeSingle();
    const standard = Number(setting?.value ?? 1200);
    await supabase.from("tuition_plans").insert({
      student_id: studentId,
      standard_amount: standard,
      discount_amount: 0,
      total_amount: standard,
      amount_paid: 0,
    });
  }
  const { data: existingFees } = await supabase
    .from("recurring_fees")
    .select("fee_type")
    .eq("student_id", studentId);
  const have = new Set((existingFees || []).map((f) => f.fee_type));
  if (!have.has("canteen_transport")) {
    await supabase.from("recurring_fees").insert({
      student_id: studentId,
      fee_type: "canteen_transport",
      frequency: "daily",
      amount: 10, // default — edit per school from the fees page
    });
  }
}

// Admin-like only (enforced in the UI + could add an RLS check, but
// tuition_plans is already admin-like-only for writes via existing policy).
// Recomputes total_amount so every page that reads it (fees-owing,
// fees-overview, report cards, parent portal, dashboard) keeps working
// unchanged — they only ever see the net amount owed.
export async function updateTuitionAmounts(formData) {
  const supabase = createClient();
  const studentId = formData.get("studentId");
  const standardAmount = Number(formData.get("standardAmount"));
  const discountAmount = Number(formData.get("discountAmount"));
  if (Number.isNaN(standardAmount) || standardAmount < 0) return;
  if (Number.isNaN(discountAmount) || discountAmount < 0) return;

  const total = Math.max(standardAmount - discountAmount, 0);
  await supabase
    .from("tuition_plans")
    .update({ standard_amount: standardAmount, discount_amount: discountAmount, total_amount: total })
    .eq("student_id", studentId);
  revalidatePath("/fees");
}

// Changes the standard tuition new enrollments get by default. Does not
// touch any existing student's tuition_plans row.
export async function updateDefaultTuition(formData) {
  const supabase = createClient();
  const value = Number(formData.get("defaultTuition"));
  if (Number.isNaN(value) || value < 0) return;
  await supabase.from("fee_settings").upsert({ key: "default_tuition", value });
  revalidatePath("/fees");
}

export async function changeFrequency(formData) {
  const supabase = createClient();
  const feeId = formData.get("feeId");
  const frequency = formData.get("frequency");
  await supabase.from("recurring_fees").update({ frequency }).eq("id", feeId);
  revalidatePath("/fees");
}

// Lets you edit the typical amount for a recurring fee — same
// daily/weekly/monthly format as before, just one merged line now.
export async function changeAmount(formData) {
  const supabase = createClient();
  const feeId = formData.get("feeId");
  const amount = Number(formData.get("amount"));
  if (Number.isNaN(amount) || amount < 0) return;
  await supabase.from("recurring_fees").update({ amount }).eq("id", feeId);
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
