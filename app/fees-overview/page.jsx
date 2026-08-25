import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function FeesOverviewPage() {
  const supabase = createClient();

  // Every student's tuition balance, worst debtors first
  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, classrooms(section, academic_levels(name)), tuition_plans(total_amount, amount_paid)")
    .eq("status", "active");

  const debtors = (students || [])
    .map((s) => {
      const plan = Array.isArray(s.tuition_plans) ? s.tuition_plans[0] : s.tuition_plans;
      const balance = plan ? Number(plan.total_amount) - Number(plan.amount_paid) : 0;
      return {
        id: s.id,
        full_name: s.full_name,
        className: `${s.classrooms?.academic_levels?.name || ""} ${s.classrooms?.section || ""}`.trim(),
        balance,
      };
    })
    .filter((s) => s.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const totalOwed = debtors.reduce((sum, d) => sum + d.balance, 0);

  // Recent tuition payments (audit trail)
  const { data: tuitionPayments } = await supabase
    .from("tuition_payments")
    .select("id, amount, paid_on, student_id, recorded_by, students(full_name)")
    .order("paid_on", { ascending: false })
    .limit(30);

  // Recent recurring fee payments (canteen/transport)
  const { data: recurringPayments } = await supabase
    .from("recurring_fee_payments")
    .select("id, amount, period_key, recorded_by, recurring_fees(fee_type, student_id, students(full_name))")
    .order("id", { ascending: false })
    .limit(30);

  // Resolve recorder names
  const recorderIds = new Set();
  (tuitionPayments || []).forEach((p) => p.recorded_by && recorderIds.add(p.recorded_by));
  (recurringPayments || []).forEach((p) => p.recorded_by && recorderIds.add(p.recorded_by));

  let recorderNames = {};
  if (recorderIds.size > 0) {
    const { data: recorders } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", [...recorderIds]);
    (recorders || []).forEach((r) => {
      recorderNames[r.id] = `${r.full_name} (${r.role})`;
    });
  }

  const combinedLog = [
    ...(tuitionPayments || []).map((p) => ({
      id: `t-${p.id}`,
      type: "Tuition",
      student: p.students?.full_name,
      amount: p.amount,
      when: p.paid_on,
      recordedBy: recorderNames[p.recorded_by] || "—",
    })),
    ...(recurringPayments || []).map((p) => ({
      id: `r-${p.id}`,
      type: p.recurring_fees?.fee_type ? p.recurring_fees.fee_type[0].toUpperCase() + p.recurring_fees.fee_type.slice(1) : "Fee",
      student: p.recurring_fees?.students?.full_name,
      amount: p.amount,
      when: p.period_key,
      recordedBy: recorderNames[p.recorded_by] || "—",
    })),
  ].sort((a, b) => (a.when < b.when ? 1 : -1));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Fees overview</h1>
        <p className="text-stone-500 text-sm mb-6">
          School-wide debtors and a full audit trail of every payment recorded.
        </p>

        <div className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
          <p className="text-xs text-stone-400">Total outstanding across the school</p>
          <p className="font-display text-2xl font-semibold text-clay">Gh₵ {totalOwed.toFixed(2)}</p>
        </div>

        <p className="text-sm font-medium text-ink mb-2">Students who owe money</p>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Student</th>
                <th className="text-left px-4 py-2 font-medium">Class</th>
                <th className="text-right px-4 py-2 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map((d) => (
                <tr key={d.id} className="border-t border-stone-100">
                  <td className="px-4 py-2 text-ink">{d.full_name}</td>
                  <td className="px-4 py-2 text-stone-500">{d.className}</td>
                  <td className="px-4 py-2 text-right font-medium text-clay">Gh₵ {d.balance}</td>
                </tr>
              ))}
              {debtors.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-stone-400">No outstanding balances.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-sm font-medium text-ink mb-2">Recent payment activity (audit trail)</p>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Date/Period</th>
                <th className="text-left px-3 py-2 font-medium">Student</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {combinedLog.slice(0, 40).map((row) => (
                <tr key={row.id} className="border-t border-stone-100">
                  <td className="px-3 py-2 text-stone-500 font-mono text-xs">{row.when}</td>
                  <td className="px-3 py-2 text-ink">{row.student || "—"}</td>
                  <td className="px-3 py-2 text-stone-500">{row.type}</td>
                  <td className="px-3 py-2 text-right font-medium text-ink">Gh₵ {row.amount}</td>
                  <td className="px-3 py-2 text-stone-500">{row.recordedBy}</td>
                </tr>
              ))}
              {combinedLog.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-stone-400">No payments recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
