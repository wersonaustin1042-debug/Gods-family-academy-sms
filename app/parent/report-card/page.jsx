import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import PrintButton from "@/app/report-card/PrintButton";

export const dynamic = "force-dynamic";

function remarkFor(score, total) {
  const pct = (score / total) * 100;
  if (pct >= 90) return "EXCELLENT";
  if (pct >= 80) return "VERY GOOD";
  if (pct >= 60) return "GOOD";
  if (pct >= 50) return "AVERAGE";
  if (pct >= 40) return "BELOW AVERAGE";
  return "WEAK";
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

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

function subjectTotal(t) {
  const ca = (t?.["Class Exercise/Assignment"]?.score || 0) + (t?.["Mid-term"]?.score || 0);
  const exam = t?.["End-of-term"]?.score || 0;
  const hasAny = t?.["Class Exercise/Assignment"] || t?.["Mid-term"] || t?.["End-of-term"];
  return hasAny ? ca + exam : 0;
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
    const { data: classmates } = await supabase
      .from("students")
      .select("id")
      .eq("classroom_id", studentInfo.classroom_id)
      .eq("status", "active");
    const classSize = (classmates || []).length;

    const { data: exams } = await supabase
      .from("exams")
      .select("id, subject_id, exam_type, subjects(name)")
      .eq("classroom_id", studentInfo.classroom_id)
      .eq("term", selectedTerm);
    const examIds = (exams || []).map((e) => e.id);
    const subjectNameById = new Map((exams || []).map((e) => [e.subject_id, e.subjects?.name || "Unknown"]));
    const subjectIds = [...subjectNameById.keys()];

    let allResults = [];
    if (examIds.length > 0) {
      const { data: resultsData } = await supabase
        .from("results")
        .select("student_id, score, exams(subject_id, exam_type)")
        .in("exam_id", examIds);
      allResults = resultsData || [];
    }

    const studentTotals = {};
    allResults.forEach((r) => {
      const sid = r.student_id;
      const subj = r.exams.subject_id;
      if (!studentTotals[sid]) studentTotals[sid] = {};
      if (!studentTotals[sid][subj]) studentTotals[sid][subj] = {};
      studentTotals[sid][subj][r.exams.exam_type] = { score: r.score };
    });

    const subjectRows = subjectIds.map((subjectId) => {
      const entries = (classmates || []).map((c) => ({
        id: c.id,
        value: subjectTotal(studentTotals[c.id]?.[subjectId]),
      }));
      const { map, outOf } = rankMap(entries);
      const t = studentTotals[selectedStudentId]?.[subjectId];
      const total = subjectTotal(t);
      return {
        subject: subjectNameById.get(subjectId),
        ca: (t?.["Class Exercise/Assignment"]?.score || 0) + (t?.["Mid-term"]?.score || 0),
        exam: t?.["End-of-term"]?.score ?? null,
        total,
        grade: total > 0 ? remarkFor(total, 100) : "—",
        position: map.get(selectedStudentId) ? ordinal(map.get(selectedStudentId)) : "—",
        outOf,
      };
    });

    const overallEntries = (classmates || []).map((c) => {
      const value = subjectIds.reduce((sum, subj) => sum + subjectTotal(studentTotals[c.id]?.[subj]), 0);
      return { id: c.id, value };
    });
    const { map: overallMap } = rankMap(overallEntries);
    const overallTotal = subjectRows.reduce((sum, r) => sum + r.total, 0);
    const overallPosition = overallMap.get(selectedStudentId) ? ordinal(overallMap.get(selectedStudentId)) : "—";

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
      classSize,
      subjectRows,
      overallTotal,
      overallPosition,
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

        {detail && activeClassroom && (
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
                <span className="font-medium text-ink">{detail.overallTotal}</span>
              </p>
              <p>
                <span className="text-stone-500">TERM: </span>
                <span className="font-medium text-ink">{selectedTerm} — {academicYear(now)} Academic Year</span>
                <span className="text-stone-500 ml-3">NO. ON ROLL: </span>
                <span className="font-medium text-ink">{detail.classSize}</span>
                <span className="text-stone-500 ml-3">POSITION IN CLASS: </span>
                <span className="font-medium text-ink">{detail.overallPosition}</span>
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
                  <th className="text-center px-2 py-1.5 border border-stone-300">30% Score</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">70% Score</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Total (100%)</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Position</th>
                  <th className="text-center px-2 py-1.5 border border-stone-300">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {detail.subjectRows.map((r) => (
                  <tr key={r.subject}>
                    <td className="px-2 py-1.5 border border-stone-200 text-ink">{r.subject}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center text-stone-600">{r.ca || "—"}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center text-stone-600">{r.exam ?? "—"}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center font-medium text-ink">{r.total || "—"}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center text-stone-600">{r.position}</td>
                    <td className="px-2 py-1.5 border border-stone-200 text-center font-semibold text-pine">{r.grade}</td>
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

        {!detail && (
          <p className="text-sm text-stone-400">No report card available for {selectedTerm} yet.</p>
        )}
      </main>
    </div>
  );
}
