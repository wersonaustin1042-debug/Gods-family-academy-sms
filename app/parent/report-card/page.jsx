import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import PrintButton from "@/app/report-card/PrintButton";
import {
  loadGradingConfig,
  loadTermResults,
  buildPupilCard,
  scaleKeyForLevel,
  fmt,
  ordinal,
} from "@/lib/grading";

export const dynamic = "force-dynamic";

function formatFullDate(date) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const day = date.getDate();
  return `${days[date.getDay()]} ${ordinal(day)} ${months[date.getMonth()]}, ${date.getFullYear()}`;
}

function academicYear(date) {
  const y = date.getFullYear();
  return date.getMonth() >= 8 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`;
}

export default async function ParentReportCardPage({ searchParams }) {
  const now = new Date();
  const supabase = createClient();
  const selectedStudentId = searchParams?.studentId;
  const selectedTerm = searchParams?.term || "Term 1";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Security check: this student must actually be linked to the logged-in parent.
  const { data: link } = await supabase
    .from("student_guardians")
    .select("student_id")
    .eq("parent_id", user?.id)
    .eq("student_id", selectedStudentId || "")
    .maybeSingle();

  if (!selectedStudentId || !link) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-5 sm:p-8 max-w-3xl">
          <p className="text-sm text-stone-400">Report card not found, or this child isn't linked to your account.</p>
          <Link href="/parent" className="text-xs text-pine hover:underline mt-2 inline-block">← Back to my children</Link>
        </main>
      </div>
    );
  }

  const { data: studentInfo } = await supabase
    .from("students")
    .select("id, full_name, photo_url, classroom_id, classrooms(section, academic_levels(name, sort_order))")
    .eq("id", selectedStudentId)
    .single();

  const activeClassroom = studentInfo?.classrooms
    ? { section: studentInfo.classrooms.section, academic_levels: studentInfo.classrooms.academic_levels }
    : null;

  const { data: termInfo } = await supabase.from("term_info").select("*").eq("term", selectedTerm).single();

  let detail = null;
  if (activeClassroom) {
    // Subject positions need the whole class's marks, which a parent can't read directly.
    // The link check above has passed, so a server-side client reads the class marks purely
    // to work out ranks; only this child's own marks and positions are shown.
    const admin = createAdminClient();
    const { data: classmates } = await admin
      .from("students")
      .select("id")
      .eq("classroom_id", studentInfo.classroom_id)
      .eq("status", "active");
    const classmateIds = (classmates || []).map((c) => c.id);

    const termData = await loadTermResults(admin, studentInfo.classroom_id, selectedTerm);
    const config = await loadGradingConfig(supabase);
    const scaleRows = config.scales[scaleKeyForLevel(activeClassroom.academic_levels.sort_order)] || [];

    const card = buildPupilCard({
      studentId: selectedStudentId,
      classmateIds,
      totals: termData.totals,
      subjectIds: termData.subjectIds,
      subjectNameById: termData.subjectNameById,
      scaleRows,
      bands: config.bands,
    });

    let presentDays = 0;
    let totalDays = 0;
    if (termInfo?.start_date && termInfo?.end_date) {
      const { data: attendance } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", selectedStudentId)
        .gte("date", termInfo.start_date)
        .lte("date", termInfo.end_date);
      totalDays = (attendance || []).length;
      presentDays = (attendance || []).filter((a) => a.status === "present").length;
    }

    const { data: plan } = await supabase
      .from("tuition_plans")
      .select("total_amount, amount_paid")
      .eq("student_id", selectedStudentId)
      .maybeSingle();
    const balance = plan ? Number(plan.total_amount) - Number(plan.amount_paid) : 0;

    const { data: remarks } = await supabase
      .from("term_remarks")
      .select("*")
      .eq("student_id", selectedStudentId)
      .eq("term", selectedTerm)
      .maybeSingle();

    const { data: nextLevel } = await supabase
      .from("academic_levels")
      .select("name")
      .eq("sort_order", activeClassroom.academic_levels.sort_order + 1)
      .maybeSingle();

    detail = {
      classSize: classmateIds.length,
      card,
      presentDays,
      totalDays,
      balance,
      remarks,
      nextTermBill: remarks?.next_term_bill ?? "",
      promotedTo: nextLevel?.name || "—",
    };
  }

  const termOptions = [
    { value: "Term 1", label: "Term 1" },
    { value: "Term 2", label: "Term 2" },
    { value: "Term 3", label: "Term 3" },
  ];

  const ready = detail && activeClassroom && detail.card.subjectRows.length > 0 && detail.card.complete;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl print:p-0 print:max-w-full">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link href="/parent" className="text-xs text-stone-400 hover:text-pine inline-block">
            ← Back to my children
          </Link>
          <PrintButton />
        </div>

        <form method="GET" className="mb-4 print:hidden">
          <input type="hidden" name="studentId" value={selectedStudentId} />
          <AutoSubmitSelect
            name="term"
            defaultValue={selectedTerm}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            options={termOptions}
          />
        </form>

        {ready && (
          <div className="bg-white rounded-xl border border-stone-200 p-5 print:shadow-none print:border-0 print:p-0">
            {/* Header */}
            <div className="relative text-center pb-2 mb-3">
              {studentInfo?.photo_url && (
                <img
                  src={studentInfo.photo_url}
                  alt=""
                  className="absolute top-0 right-0 w-16 h-20 object-cover rounded border border-stone-300"
                />
              )}
              <img src="/logo.png" alt="" className="h-16 w-16 mx-auto mb-1 object-contain" />
              <p className="font-display text-base font-bold text-ink leading-tight">God's Family Academy</p>
              <p className="text-[10px] text-stone-500 italic leading-tight">Service to God and Humanity</p>
              <p className="text-[10px] text-stone-500 leading-tight">Sokoban Ampayoo, P.O. Box AH 8193, Kumasi</p>
              <p className="text-[10px] text-stone-500 leading-tight">Tel: 0244748974 / 0208225706 / 0273123182 — Email: attaadwumoline@yahoo.com</p>
              <p className="text-sm font-semibold text-ink mt-1.5 uppercase tracking-wide">Pupil's Report Card</p>
            </div>

            {/* Top info */}
            <div className="text-[13px] leading-relaxed border-y border-stone-300 py-2 mb-3">
              <p>
                <span className="text-stone-500">NAME: </span>
                <span className="font-medium text-ink">{studentInfo.full_name}</span>
                <span className="text-stone-500 ml-3">CLASS: </span>
                <span className="font-medium text-ink">{activeClassroom.academic_levels.name} {activeClassroom.section}</span>
                <span className="text-stone-500 ml-3">TOTAL SCORE: </span>
                <span className="font-medium text-ink">{fmt(detail.card.overallTotal)}</span>
              </p>
              <p>
                <span className="text-stone-500">TERM: </span>
                <span className="font-medium text-ink">{selectedTerm} — {academicYear(now)} Academic Year</span>
                <span className="text-stone-500 ml-3">NO. ON ROLL: </span>
                <span className="font-medium text-ink">{detail.classSize}</span>
              </p>
              <p>
                <span className="text-stone-500">AVERAGE: </span>
                <span className="font-medium text-ink">{fmt(detail.card.average)}</span>
                <span className="text-stone-500 ml-3">CLASS ACHIEVED: </span>
                <span className="font-semibold text-pine">{detail.card.classLabel}</span>
              </p>
              <p>
                <span className="text-stone-500">DATE: </span>
                <span className="font-medium text-ink">{formatFullDate(now)}</span>
                <span className="text-stone-500 ml-3">NEXT TERM BEGINS: </span>
                <span className="font-medium text-ink">{termInfo?.reopening_date || "—"}</span>
              </p>
            </div>

            {/* Subjects table */}
            <table className="w-full text-xs mb-3 border border-stone-300">
              <thead className="bg-pine/10 text-ink uppercase">
                <tr>
                  <th className="text-left px-2 py-1.5 border border-stone-300">Subject</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">SBA (50%)</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Exam (50%)</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Total (100%)</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Grade</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Position</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {detail.card.subjectRows.map((r) => (
                  <tr key={r.subject}>
                    <td className="px-2 py-1.5 border border-stone-200 text-ink">{r.subject}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center text-stone-600">
                      {fmt(r.sbaScaled)}
                      {r.sbaDnw && <span className="block text-[10px] text-clay">Did not write</span>}
                    </td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center text-stone-600">
                      {r.examDnw ? <span className="text-clay">Did not write</span> : fmt(r.examScaled)}
                    </td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center font-medium text-ink">{fmt(r.total)}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center font-semibold text-pine">
                      {r.grade}
                      {r.gradeValue ? <span className="text-stone-400 font-normal"> ({r.gradeValue})</span> : null}
                    </td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center text-stone-600">{r.position ? `${r.position} of ${r.outOf}` : "—"}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center text-stone-600">{r.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Bottom info */}
            <div className="text-[13px] leading-relaxed border-y border-stone-300 py-2 mb-3">
              <p>
                <span className="text-stone-500">ATTENDANCE: </span>
                <span className="font-medium text-ink">{detail.presentDays}</span>
                <span className="text-stone-500 ml-3">OUT OF TOTAL OF: </span>
                <span className="font-medium text-ink">{detail.totalDays}</span>
                <span className="text-stone-500 ml-3">PROMOTED TO: </span>
                <span className="font-medium text-ink">{detail.promotedTo}</span>
              </p>
              <p>
                <span className="text-stone-500">ATTITUDE: </span>
                <span className="font-medium text-ink">{detail.remarks?.attitude || "—"}</span>
                <span className="text-stone-500 ml-3">INTEREST / HOBBY: </span>
                <span className="font-medium text-ink">{detail.remarks?.interests || "—"}</span>
              </p>
              <p>
                <span className="text-stone-500">TEACHER'S REMARK: </span>
                <span className="font-medium text-ink">{detail.remarks?.teacher_remarks || "—"}</span>
              </p>
              <p>
                <span className="text-stone-500">HEAD TEACHER'S REMARK: </span>
                <span className="font-medium text-ink">{detail.remarks?.headteacher_remarks || "—"}</span>
              </p>
            </div>

            {/* Bills — read-only for parents */}
            <p className="text-xs font-semibold text-ink uppercase mb-1.5">
              {selectedTerm === "Term 3" ? "1st" : selectedTerm === "Term 1" ? "2nd" : "3rd"} Term {academicYear(now)} Academic Year — Bills:
            </p>
            <div className="text-[13px] space-y-1 mb-3">
              <p>
                <span className="text-stone-500">NEW BILL FOR NEXT TERM: </span>
                <span className="text-ink font-medium">Gh₵ {Number(detail.nextTermBill || 0).toFixed(2)}</span>
              </p>
              <p>
                <span className="text-stone-500">OLD ARREARS/DEBT (As at this vacation day): </span>
                <span className="font-medium text-clay">Gh₵ {detail.balance}</span>
              </p>
              <p className="font-semibold">
                <span className="text-ink">Total Termly Bill to Pay: </span>
                <span className="text-ink">Gh₵ {(detail.balance + Number(detail.nextTermBill || 0)).toFixed(2)}</span>
              </p>
            </div>

            {/* Signature */}
            <div className="pt-2">
              <p className="text-sm text-ink mb-4">DIRECTOR'S SIGNATURE: ___________________________________</p>
              <p className="text-[11px] font-semibold text-clay text-center uppercase">
                Amount paid are not refundable under any condition
              </p>
            </div>
          </div>
        )}

        {!ready && (
          <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
            <p className="text-sm font-medium text-ink mb-1">Report card not ready yet</p>
            <p className="text-xs text-stone-400">
              The school hasn't finished entering grades for {selectedTerm}. Please check back later.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
