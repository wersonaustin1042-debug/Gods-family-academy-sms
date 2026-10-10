import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadGradingConfig,
  loadTermResults,
  buildPupilCard,
  scaleKeyForLevel,
  fmt,
} from "@/lib/grading";

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

    let canteenTransportPaid = null;
    for (const fee of fees || []) {
      const periodKey = getPeriodKey(fee.frequency);
      const { data: payment } = await supabase
        .from("recurring_fee_payments")
        .select("id")
        .eq("recurring_fee_id", fee.id)
        .eq("period_key", periodKey)
        .maybeSingle();
      if (fee.fee_type === "canteen_transport") canteenTransportPaid = !!payment;
    }

    // ---- Grades for the selected term ----
    // Subject positions need the whole class's marks, which a parent can't read directly. The
    // child is already confirmed as this parent's (via student_guardians above), so a server-side
    // client reads the class marks only to work out ranks; only this child's marks are shown.
    let card = null;

    if (child.classroom_id) {
      const admin = createAdminClient();
      const { data: classmates } = await admin
        .from("students")
        .select("id")
        .eq("classroom_id", child.classroom_id)
        .eq("status", "active");
      const termData = await loadTermResults(admin, child.classroom_id, selectedTerm);
      if (termData.subjectIds.length > 0) {
        const config = await loadGradingConfig(supabase);
        const { data: levelRow } = await supabase
          .from("classrooms")
          .select("academic_levels(sort_order)")
          .eq("id", child.classroom_id)
          .single();
        const scaleRows = config.scales[scaleKeyForLevel(levelRow?.academic_levels?.sort_order)] || [];
        card = buildPupilCard({
          studentId: child.id,
          classmateIds: (classmates || []).map((c) => c.id),
          totals: termData.totals,
          subjectIds: termData.subjectIds,
          subjectNameById: termData.subjectNameById,
          scaleRows,
          bands: config.bands,
        });
      }
    }

    childData.push({
      ...child,
      presentDays,
      totalDays,
      tuitionBalance: plan ? Number(plan.total_amount) - Number(plan.amount_paid) : null,
      canteenTransportPaid,
      card,
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
                  <p className="text-xs text-stone-400">Canteen & transport</p>
                  <p className="text-sm font-medium text-ink">
                    {child.canteenTransportPaid === null ? "—" : child.canteenTransportPaid ? "Paid" : "Due"}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-ink">Grades — {selectedTerm}</p>
                  {child.card?.complete && (
                    <p className="text-xs text-stone-400">
                      Total {fmt(child.card.overallTotal)} · {child.card.classLabel}
                    </p>
                  )}
                </div>
                {child.card?.complete ? (
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
                        {child.card.subjectRows.map((r) => (
                          <tr key={r.subject} className="border-t border-stone-100">
                            <td className="px-3 py-1.5 text-ink">{r.subject}</td>
                            <td className="px-3 py-1.5 text-center text-stone-600">{fmt(r.total)}</td>
                            <td className="px-3 py-1.5 text-center font-semibold text-pine">{r.grade}</td>
                            <td className="px-3 py-1.5 text-center text-stone-600">
                              {r.position ? `${r.position} of ${r.outOf}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : child.card ? (
                  <p className="text-xs text-stone-400">
                    The school hasn't finished entering all marks for {selectedTerm}. Please check back later.
                  </p>
                ) : (
                  <p className="text-xs text-stone-400">No grades recorded for {selectedTerm} yet.</p>
                )}
              </div>

              <a
                href={`/parent/report-card?studentId=${child.id}&term=${selectedTerm}`}
                className="inline-block text-xs font-medium text-pine hover:underline"
              >
                View / print full report card →
              </a>
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
