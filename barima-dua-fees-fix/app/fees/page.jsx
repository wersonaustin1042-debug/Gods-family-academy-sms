import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import {
  ensureRecurringFees,
  recordInstallment,
  changeFrequency,
  recordRecurringPayment,
} from "./actions";

export const dynamic = "force-dynamic";

function getPeriodKey(frequency, date = new Date()) {
  if (frequency === "daily") return date.toISOString().slice(0, 10);
  if (frequency === "weekly") {
    const jan1 = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil(((date - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${week}`;
  }
  return date.toISOString().slice(0, 7);
}

function periodLabel(frequency) {
  if (frequency === "daily") return "today";
  if (frequency === "weekly") return "this week";
  return "this month";
}

export default async function FeesPage({ searchParams }) {
  const supabase = createClient();
  const selectedStudentId = searchParams?.studentId;

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, classrooms(section, academic_levels(name))")
    .eq("status", "active")
    .order("full_name");

  let plan = null;
  let recurringFees = [];
  let paidPeriodsByFee = {};

  if (selectedStudentId) {
    await ensureRecurringFees(selectedStudentId);

    const { data: planData } = await supabase
      .from("tuition_plans")
      .select("total_amount, amount_paid")
      .eq("student_id", selectedStudentId)
      .single();
    plan = planData;

    const { data: feesData } = await supabase
      .from("recurring_fees")
      .select("id, fee_type, frequency, amount")
      .eq("student_id", selectedStudentId)
      .order("fee_type");
    recurringFees = feesData || [];

    for (const fee of recurringFees) {
      const periodKey = getPeriodKey(fee.frequency);
      const { data: payment } = await supabase
        .from("recurring_fee_payments")
        .select("id")
        .eq("recurring_fee_id", fee.id)
        .eq("period_key", periodKey)
        .maybeSingle();
      paidPeriodsByFee[fee.id] = !!payment;
    }
  }

  const balance = plan ? plan.total_amount - plan.amount_paid : 0;
  const pct = plan ? Math.round((plan.amount_paid / plan.total_amount) * 100) : 0;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Fees & payments</h1>
        <p className="text-stone-500 text-sm mb-6">
          Tuition by installment, canteen and transport on a recurring schedule.
        </p>

        <form method="GET" className="mb-6">
          <AutoSubmitSelect
            name="studentId"
            defaultValue={selectedStudentId || ""}
            className="w-full max-w-sm rounded-lg border border-stone-300 px-3 py-2 text-sm"
            options={[
              { value: "", label: "Select a student", disabled: true },
              ...(students || []).map((s) => ({
                value: s.id,
                label: `${s.full_name} — ${s.classrooms?.academic_levels?.name} ${s.classrooms?.section}`,
              })),
            ]}
          />
        </form>

        {selectedStudentId && plan && (
          <div className="space-y-4">
            {/* Tuition */}
            <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Tuition</p>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    balance <= 0
                      ? "bg-pine/10 text-pine border-pine/30"
                      : "bg-slateblue/10 text-slateblue border-slateblue/30"
                  }`}
                >
                  {balance <= 0 ? "Fully paid" : `GHS ${balance} remaining`}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full bg-pine rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-stone-400">
                GHS {plan.amount_paid} of GHS {plan.total_amount} paid ({pct}%)
              </p>
              {balance > 0 && (
                <form action={recordInstallment} className="flex gap-2 pt-1">
                  <input type="hidden" name="studentId" value={selectedStudentId} />
                  <input
                    type="number"
                    name="amount"
                    min="1"
                    max={balance}
                    required
                    placeholder={`Amount (up to GHS ${balance})`}
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="text-xs font-medium bg-pine text-paper px-3 py-2 rounded-lg hover:bg-pine/90 whitespace-nowrap"
                  >
                    Record installment
                  </button>
                </form>
              )}
            </div>

            {/* Canteen + Transport */}
            {recurringFees.map((fee) => {
              const isPaid = paidPeriodsByFee[fee.id];
              return (
                <div key={fee.id} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink capitalize">{fee.fee_type}</p>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${
                        isPaid
                          ? "bg-pine/10 text-pine border-pine/30"
                          : "bg-clay/10 text-clay border-clay/30"
                      }`}
                    >
                      {isPaid ? "Paid" : "Due"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400">GHS {fee.amount} · billed</span>
                    <form action={changeFrequency}>
                      <input type="hidden" name="feeId" value={fee.id} />
                      <AutoSubmitSelect
                        name="frequency"
                        defaultValue={fee.frequency}
                        className="text-xs rounded-lg border border-stone-300 px-2 py-1"
                        options={[
                          { value: "daily", label: "Daily" },
                          { value: "weekly", label: "Weekly" },
                          { value: "monthly", label: "Monthly" },
                        ]}
                      />
                    </form>
                  </div>
                  <p className="text-xs text-stone-400">
                    {isPaid ? `Covered for ${periodLabel(fee.frequency)}` : `Not yet paid for ${periodLabel(fee.frequency)}`}
                  </p>
                  {!isPaid && (
                    <form action={recordRecurringPayment}>
                      <input type="hidden" name="feeId" value={fee.id} />
                      <input type="hidden" name="frequency" value={fee.frequency} />
                      <button
                        type="submit"
                        className="text-xs font-medium bg-pine text-paper px-3 py-1.5 rounded-lg hover:bg-pine/90"
                      >
                        Record payment for {periodLabel(fee.frequency)}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!selectedStudentId && (
          <p className="text-sm text-stone-400">Select a student above to view their fees.</p>
        )}
      </main>
    </div>
  );
}
