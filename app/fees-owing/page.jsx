import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import PrintButton from "@/components/PrintButton";
import { ensureFeeSetup } from "../fees/actions";

export const dynamic = "force-dynamic";

// Mirrors the exact period-key logic used in app/fees/page.jsx, so "current period"
// here always matches what the Fees grid would show as the latest column.
function currentPeriodKey(frequency) {
  const now = new Date();

  if (frequency === "monthly") {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  if (frequency === "weekly") {
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${week}`;
  }

  // daily — only weekdays exist as columns in the Fees grid, so on a weekend
  // there's no "today" column; fall back to the most recent school weekday.
  const d = new Date(now);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function FeesOwingPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();
  const role = myProfile?.role;

  const { data: classroomsRaw } = await supabase
    .from("classrooms")
    .select("id, section, class_teacher_id, academic_levels(name, sort_order)");
  let classrooms = (classroomsRaw || []).sort(
    (a, b) => a.academic_levels.sort_order - b.academic_levels.sort_order || a.section.localeCompare(b.section)
  );
  if (role === "teacher") {
    classrooms = classrooms.filter((c) => c.class_teacher_id === user.id);
  }
  const classroomIds = classrooms.map((c) => c.id);
  const classroomById = Object.fromEntries(
    classrooms.map((c) => [c.id, `${c.academic_levels.name} ${c.section}`])
  );

  let students = [];
  if (classroomIds.length > 0) {
    const { data } = await supabase
      .from("students")
      .select("id, full_name, classroom_id")
      .in("classroom_id", classroomIds)
      .eq("status", "active")
      .order("full_name");
    students = data || [];
  }

  // Make sure every student has tuition + canteen + transport rows set up.
  for (const s of students) {
    await ensureFeeSetup(s.id);
  }

  const studentIds = students.map((s) => s.id);

  const { data: plans } = studentIds.length
    ? await supabase.from("tuition_plans").select("student_id, total_amount, amount_paid").in("student_id", studentIds)
    : { data: [] };
  const planByStudent = Object.fromEntries((plans || []).map((p) => [p.student_id, p]));

  const { data: recurringFees } = studentIds.length
    ? await supabase.from("recurring_fees").select("id, student_id, fee_type, frequency").in("student_id", studentIds)
    : { data: [] };
  const feesByStudent = {};
  (recurringFees || []).forEach((f) => {
    feesByStudent[f.student_id] = feesByStudent[f.student_id] || [];
    feesByStudent[f.student_id].push(f);
  });

  const feeIds = (recurringFees || []).map((f) => f.id);
  const { data: payments } = feeIds.length
    ? await supabase.from("recurring_fee_payments").select("recurring_fee_id, period_key").in("recurring_fee_id", feeIds)
    : { data: [] };
  const paidCurrentPeriod = new Set();
  const feeById = Object.fromEntries((recurringFees || []).map((f) => [f.id, f]));
  (payments || []).forEach((p) => {
    const fee = feeById[p.recurring_fee_id];
    if (fee && p.period_key === currentPeriodKey(fee.frequency)) {
      paidCurrentPeriod.add(p.recurring_fee_id);
    }
  });

  const rows = students
    .map((s) => {
      const plan = planByStudent[s.id];
      const tuitionBalance = plan ? Number(plan.total_amount) - Number(plan.amount_paid) : 0;
      const fees = feesByStudent[s.id] || [];
      const owingFees = fees.filter((f) => !paidCurrentPeriod.has(f.id));
      const owesAnything = tuitionBalance > 0 || owingFees.length > 0;
      return {
        id: s.id,
        name: s.full_name,
        className: classroomById[s.classroom_id] || "—",
        tuitionBalance,
        owingFeeTypes: owingFees.map((f) => f.fee_type[0].toUpperCase() + f.fee_type.slice(1)),
        owesAnything,
      };
    })
    .filter((r) => r.owesAnything)
    .sort((a, b) => b.tuitionBalance - a.tuitionBalance);

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-1 print:hidden">
          <h1 className="font-display text-2xl font-semibold text-ink">Fee-owing students</h1>
          <PrintButton />
        </div>
        <p className="text-stone-500 text-sm mb-1 hidden print:block font-display text-xl font-semibold text-ink">
          Fee-owing students
        </p>
        <p className="text-stone-500 text-sm mb-6">
          Tuition balances, plus Canteen/Transport unpaid for the current period. As of {today}.
        </p>

        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Student</th>
                <th className="text-left px-3 py-2 font-medium">Class</th>
                <th className="text-right px-3 py-2 font-medium">Tuition</th>
                <th className="text-left px-3 py-2 font-medium">Also owing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <td className="px-4 py-2 text-ink font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-stone-500">{r.className}</td>
                  <td className="px-3 py-2 text-right font-medium text-clay">
                    {r.tuitionBalance > 0 ? `Gh₵ ${r.tuitionBalance}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-stone-500">
                    {r.owingFeeTypes.length > 0 ? r.owingFeeTypes.join(", ") : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-stone-400">
                    No fee-owing students right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
