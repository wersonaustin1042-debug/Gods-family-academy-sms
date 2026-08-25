import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";

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

function subjectTotal(t) {
  const ca = (t?.["Class Exercise/Assignment"]?.score || 0) + (t?.["Mid-term"]?.score || 0);
  const exam = t?.["End-of-term"]?.score || 0;
  const hasAny = t?.["Class Exercise/Assignment"] || t?.["Mid-term"] || t?.["End-of-term"];
  return hasAny ? ca + exam : 0;
}

function remarkFor(total) {
  if (total >= 90) return "EXCELLENT";
  if (total >= 80) return "VERY GOOD";
  if (total >= 60) return "GOOD";
  if (total >= 50) return "AVERAGE";
  if (total >= 40) return "BELOW AVERAGE";
  return "WEAK";
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function rankMap(entries) {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const map = new Map();
  let rank = 1;
  sorted.forEach((entry, i) => {
    if (i > 0 && entry.value < sorted[i - 1].value) rank = i + 1;
    map.set(entry.id, rank);
  });
  return { map, outOf: sorted.length };
}

export default async function ParentPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const selectedTerm = searchParams?.term || "Term 1";
  const termOptions = [
    { value: "Term 1", label: "Term 1" },
    { value: "Term 2", label: "Term 2" },
    { value: "Term 3", label: "Term 3" },
  ];

  const { data: links } = await supabase
    .from("student_guardians")
    .select("student_id, students(id, full_name, classroom_id, classrooms(section, academic_levels(name)))")
    .eq("parent_id", user?.id);

  const children = (links || []).map((l) => l.students).filter(Boolean);

  const childData = [];
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  for (const child of children) {
    const { data: attendance } = await supabase
      .from("attendance")
      .select("status")
      .eq("student_id", child.id)
      .gte("date", monthStart);

    const presentDays = (attendance || []).filter((a) => a.status === "present").length;
    const totalDays = (attendance || []).length;

    const { data: plan } = await supabase
      .from("tuition_plans")
      .select("total_amount, amount_paid")
      .eq("student_id", child.id)
      .maybeSingle();

    const { data: fees } = await supabase
      .from("recurring_fees")
      .select("id, fee_type, frequency")
      .eq("student_id", child.id);

    let canteenPaid = null;
    let transportPaid = null;
    for (const fee of fees || []) {
      const periodKey = getPeriodKey(fee.frequency);
      const { data: payment } = await supabase
        .from("recurring_fee_payments")
        .select("id")
        .eq("recurring_fee_id", fee.id)
        .eq("period_key", periodKey)
        .maybeSingle();
      if (fee.fee_type === "canteen") canteenPaid = !!payment;
      if (fee.fee_type === "transport") transportPaid = !!payment;
    }

    // ---- Grades for the selected term ----
    let subjectRows = [];
    let overallTotal = 0;
    let overallPosition = "—";
    let outOf = 0;

    if (child.classroom_id) {
      const { data: exams } = await supabase
        .from("exams")
        .select("id, subject_name, exam_type")
        .eq("classroom_id", child.classroom_id)
        .eq("term", selectedTerm);
      const examIds = (exams || []).map((e) => e.id);
      const subjects = [...new Set((exams || []).map((e) => e.subject_name))];

      if (examIds.length > 0) {
        const { data: classmates } = await supabase
          .from("students")
          .select("id")
          .eq("classroom_id", child.classroom_id)
          .eq("status", "active");

        const { data: allResults } = await supabase
          .from("results")
          .select("student_id, score, exams(subject_name, exam_type)")
          .in("exam_id", examIds);

        const studentTotals = {};
        (allResults || []).forEach((r) => {
          const sid = r.student_id;
          const subj = r.exams.subject_name;
          if (!studentTotals[sid]) studentTotals[sid] = {};
          if (!studentTotals[sid][subj]) studentTotals[sid][subj] = {};
          studentTotals[sid][subj][r.exams.exam_type] = { score: r.score };
        });

        subjectRows = subjects.map((subject) => {
          const entries = (classmates || []).map((c) => ({
            id: c.id,
            value: subjectTotal(studentTotals[c.id]?.[subject]),
          }));
          const { map, outOf: subjectOutOf } = rankMap(entries);
          const t = studentTotals[child.id]?.[subject];
          const total = subjectTotal(t);
          return {
            subject,
            total,
            grade: total > 0 ? remarkFor(total) : "—",
            position: map.get(child.id) ? ordinal(map.get(child.id)) : "—",
            outOf: subjectOutOf,
          };
        });

        const overallEntries = (classmates || []).map((c) => {
          const value = subjects.reduce((sum, subj) => sum + subjectTotal(studentTotals[c.id]?.[subj]), 0);
          return { id: c.id, value };
        });
        const { map: overallMap, outOf: classOutOf } = rankMap(overallEntries);
        overallTotal = subjectRows.reduce((sum, r) => sum + r.total, 0);
        overallPosition = overallMap.get(child.id) ? ordinal(overallMap.get(child.id)) : "—";
        outOf = classOutOf;
      }
    }

    childData.push({
      ...child,
      presentDays,
      totalDays,
      tuitionBalance: plan ? Number(plan.total_amount) - Number(plan.amount_paid) : null,
      canteenPaid,
      transportPaid,
      subjectRows,
      overallTotal,
      overallPosition,
      outOf,
    });
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">My children</h1>
        <p className="text-stone-500 text-sm mb-4">A quick view of attendance, tuition, fees, and grades.</p>

        <form method="GET" className="mb-6">
          <AutoSubmitSelect
            name="term"
            defaultValue={selectedTerm}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            options={termOptions}
          />
        </form>

        <div className="space-y-4">
          {childData.map((child) => (
            <div key={child.id} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
              <div>
                <p className="font-display text-lg font-semibold text-ink">{child.full_name}</p>
                <p className="text-xs text-stone-400">
                  {child.classrooms?.academic_levels?.name} {child.classrooms?.section}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-xs text-stone-400">Attendance this month</p>
                  <p className="text-sm font-medium text-ink">
                    {child.totalDays > 0 ? `${child.presentDays}/${child.totalDays} days present` : "No records yet"}
                  </p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-xs text-stone-400">Tuition</p>
                  <p className="text-sm font-medium text-ink">
                    {child.tuitionBalance === null
                      ? "—"
                      : child.tuitionBalance <= 0
                      ? "Fully paid"
                      : `GHS ${child.tuitionBalance} remaining`}
                  </p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-xs text-stone-400">Canteen</p>
                  <p className="text-sm font-medium text-ink">
                    {child.canteenPaid === null ? "—" : child.canteenPaid ? "Paid" : "Due"}
                  </p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-xs text-stone-400">Transport</p>
                  <p className="text-sm font-medium text-ink">
                    {child.transportPaid === null ? "—" : child.transportPaid ? "Paid" : "Due"}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-ink">Grades — {selectedTerm}</p>
                  {child.subjectRows.length > 0 && (
                    <p className="text-xs text-stone-400">
                      Total {child.overallTotal} · Position {child.overallPosition} of {child.outOf}
                    </p>
                  )}
                </div>
                {child.subjectRows.length > 0 ? (
                  <div className="border border-stone-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-stone-50 text-stone-500 uppercase">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Subject</th>
                          <th className="text-center px-3 py-1.5 font-medium">Total</th>
                          <th className="text-center px-3 py-1.5 font-medium">Grade</th>
                          <th className="text-center px-3 py-1.5 font-medium">Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {child.subjectRows.map((r) => (
                          <tr key={r.subject} className="border-t border-stone-100">
                            <td className="px-3 py-1.5 text-ink">{r.subject}</td>
                            <td className="px-3 py-1.5 text-center text-stone-600">{r.total || "—"}</td>
                            <td className="px-3 py-1.5 text-center font-semibold text-pine">{r.grade}</td>
                            <td className="px-3 py-1.5 text-center text-stone-600">
                              {r.position} of {r.outOf}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">No grades recorded for {selectedTerm} yet.</p>
                )}
              </div>
            </div>
          ))}
          {childData.length === 0 && (
            <p className="text-sm text-stone-400">
              No children are linked to your account yet. Please contact the school office.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
