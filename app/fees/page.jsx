import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { ensureFeeSetup, changeFrequency, saveRecurringMonth, saveTuitionMonth } from "./actions";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function weekdaysInMonth(year, month) {
  const days = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push({ iso: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d });
    }
  }
  return days;
}

function weeksInMonth(year, month) {
  const days = weekdaysInMonth(year, month);
  const seen = new Map();
  days.forEach((d) => {
    const date = new Date(d.iso);
    const jan1 = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil(((date - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    const key = `${date.getFullYear()}-W${week}`;
    if (!seen.has(key)) seen.set(key, `Wk ${seen.size + 1}`);
  });
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function CalendarGrid({ periods, existingByKey, formAction, hiddenFields, title, subtitle }) {
  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {hiddenFields}
      <div className="p-4 border-b border-stone-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="text-xs text-stone-400">{subtitle}</p>
        </div>
        <button type="submit" className="text-xs font-medium bg-pine text-paper px-3 py-1.5 rounded-lg hover:bg-pine/90">
          Save
        </button>
      </div>
      <div className="p-3 flex flex-wrap gap-2">
        {periods.map((p) => (
          <label key={p.key} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-stone-400">{p.label}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              name={`amt__${p.key}`}
              defaultValue={existingByKey[p.key] ?? ""}
              placeholder="—"
              className={`w-16 rounded-lg border px-1.5 py-1.5 text-xs text-center ${
                existingByKey[p.key] !== undefined
                  ? "border-pine/40 bg-pine/5 text-pine font-medium"
                  : "border-stone-200 text-stone-600"
              }`}
            />
          </label>
        ))}
        {periods.length === 0 && <p className="text-xs text-stone-400 px-1 py-2">Nothing to show.</p>}
      </div>
    </form>
  );
}

export default async function FeesPage({ searchParams }) {
  const supabase = createClient();
  const selectedClassroomId = searchParams?.classroomId;
  const selectedStudentId = searchParams?.studentId;

  const now = new Date();
  const selectedYear = Number(searchParams?.year) || now.getFullYear();
  const selectedMonth = Number(searchParams?.month) || now.getMonth() + 1;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();

  const { data: classroomsRaw } = await supabase
    .from("classrooms")
    .select("id, section, class_teacher_id, academic_levels(name, sort_order)");
  let classrooms = (classroomsRaw || []).sort(
    (a, b) =>
      a.academic_levels.sort_order - b.academic_levels.sort_order ||
      a.section.localeCompare(b.section)
  );

  // Teachers only manage fees for their own homeroom class, not every class they teach.
  if (myProfile?.role === "teacher") {
    classrooms = classrooms.filter((c) => c.class_teacher_id === user.id);
  }

  let classStudents = [];
  let statusByStudent = {};

  if (selectedClassroomId) {
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("classroom_id", selectedClassroomId)
      .eq("status", "active")
      .order("full_name");
    classStudents = studentsData || [];

    for (const s of classStudents) {
      await ensureFeeSetup(s.id);
      const { data: plan } = await supabase
        .from("tuition_plans")
        .select("total_amount, amount_paid")
        .eq("student_id", s.id)
        .single();
      statusByStudent[s.id] = {
        tuitionBalance: plan ? Number(plan.total_amount) - Number(plan.amount_paid) : 0,
      };
    }
  }

  let selectedStudentInfo = null;
  let plan = null;
  let recurringFees = [];
  let tuitionExisting = {};
  let feeExistingByType = {};

  if (selectedStudentId) {
    selectedStudentInfo = classStudents.find((s) => s.id === selectedStudentId);

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

    const monthStartIso = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const monthEndIso = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-31`;

    const { data: tuitionPayments } = await supabase
      .from("tuition_payments")
      .select("paid_on, amount")
      .eq("student_id", selectedStudentId)
      .gte("paid_on", monthStartIso)
      .lte("paid_on", monthEndIso);
    (tuitionPayments || []).forEach((p) => {
      tuitionExisting[p.paid_on] = p.amount;
    });

    for (const fee of recurringFees) {
      const { data: payments } = await supabase
        .from("recurring_fee_payments")
        .select("period_key, amount")
        .eq("recurring_fee_id", fee.id);
      feeExistingByType[fee.id] = {};
      (payments || []).forEach((p) => {
        feeExistingByType[fee.id][p.period_key] = p.amount;
      });
    }
  }

  const balance = plan ? Number(plan.total_amount) - Number(plan.amount_paid) : 0;
  const pct = plan ? Math.round((Number(plan.amount_paid) / Number(plan.total_amount)) * 100) : 0;
  const days = weekdaysInMonth(selectedYear, selectedMonth).map((d) => ({ key: d.iso, label: String(d.day) }));
  const weeks = weeksInMonth(selectedYear, selectedMonth);
  const monthOnly = [{ key: monthKey(selectedYear, selectedMonth), label: MONTH_NAMES[selectedMonth - 1] }];

  const monthOptions = MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }));
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({
    value: String(y),
    label: String(y),
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Fees & payments</h1>
        <p className="text-stone-500 text-sm mb-6">Pick a class, then a student, then record exact amounts by day.</p>

        <div className="flex flex-wrap gap-2 mb-6">
          {classrooms.map((c) => (
            <Link
              key={c.id}
              href={`/fees?classroomId=${c.id}`}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
                c.id === selectedClassroomId
                  ? "bg-pine text-paper border-pine"
                  : "text-stone-500 border-stone-300 hover:border-pine/50"
              }`}
            >
              {c.academic_levels.name} {c.section}
            </Link>
          ))}
          {myProfile?.role === "teacher" && classrooms.length === 0 && (
            <p className="text-xs text-stone-400">You aren't set as the homeroom teacher for any class yet.</p>
          )}
        </div>

        {selectedClassroomId && (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-center px-3 py-2 font-medium">Tuition balance</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.map((s) => (
                  <tr key={s.id} className={`border-t border-stone-100 ${s.id === selectedStudentId ? "bg-stone-50" : ""}`}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/fees?classroomId=${selectedClassroomId}&studentId=${s.id}&year=${selectedYear}&month=${selectedMonth}`}
                        className="text-ink font-medium hover:text-pine"
                      >
                        {s.full_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                          statusByStudent[s.id]?.tuitionBalance <= 0
                            ? "bg-pine/10 text-pine border-pine/30"
                            : "bg-slateblue/10 text-slateblue border-slateblue/30"
                        }`}
                      >
                        {statusByStudent[s.id]?.tuitionBalance <= 0
                          ? "Paid"
                          : `GHS ${statusByStudent[s.id]?.tuitionBalance}`}
                      </span>
                    </td>
                  </tr>
                ))}
                {classStudents.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-stone-400">No students in this class.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedStudentInfo && plan && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm font-medium text-ink">
                Managing: <span className="text-pine">{selectedStudentInfo.full_name}</span>
              </p>
              <form method="GET" className="flex gap-2">
                <input type="hidden" name="classroomId" value={selectedClassroomId} />
                <input type="hidden" name="studentId" value={selectedStudentId} />
                <AutoSubmitSelect
                  name="month"
                  defaultValue={String(selectedMonth)}
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                  options={monthOptions}
                />
                <AutoSubmitSelect
                  name="year"
                  defaultValue={String(selectedYear)}
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                  options={yearOptions}
                />
              </form>
            </div>

            <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Tuition — overall balance</p>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${balance <= 0 ? "bg-pine/10 text-pine border-pine/30" : "bg-slateblue/10 text-slateblue border-slateblue/30"}`}>
                  {balance <= 0 ? "Fully paid" : `GHS ${balance} remaining`}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full bg-pine rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-stone-400">GHS {plan.amount_paid} of GHS {plan.total_amount} paid ({pct}%)</p>
            </div>

            <CalendarGrid
              title={`Tuition — ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
              subtitle="Tap a day to enter the amount paid that day."
              periods={days}
              existingByKey={tuitionExisting}
              formAction={saveTuitionMonth}
              hiddenFields={<input type="hidden" name="studentId" value={selectedStudentId} />}
            />

            {recurringFees.map((fee) => {
              const periods = fee.frequency === "daily" ? days : fee.frequency === "weekly" ? weeks : monthOnly;
              return (
                <div key={fee.id} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <p className="text-xs text-stone-500 capitalize font-medium">{fee.fee_type}</p>
                    <span className="text-xs text-stone-400">GHS {fee.amount} typical ·</span>
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
                  <CalendarGrid
                    title={`${fee.fee_type[0].toUpperCase() + fee.fee_type.slice(1)} — ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                    subtitle="Enter the exact amount paid for each period."
                    periods={periods}
                    existingByKey={feeExistingByType[fee.id] || {}}
                    formAction={saveRecurringMonth}
                    hiddenFields={<input type="hidden" name="feeId" value={fee.id} />}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
