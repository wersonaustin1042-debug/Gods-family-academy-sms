import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { saveTermInfo, saveRemarks } from "./actions";
import PrintButton from "./PrintButton";

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
  // Ghanaian academic year runs roughly September to August
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

export default async function ReportCardPage({ searchParams }) {
  const now = new Date();
  const supabase = createClient();
  const selectedClassroomId = searchParams?.classroomId;
  const selectedTerm = searchParams?.term || "Term 1";
  const selectedStudentId = searchParams?.studentId;

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
  if (myProfile?.role === "teacher") {
    const { data: assigned } = await supabase
      .from("teacher_classrooms")
      .select("classroom_id")
      .eq("teacher_id", user.id);
    const ids = new Set((assigned || []).map((a) => a.classroom_id));
    classrooms = classrooms.filter((c) => ids.has(c.id));
  }

  const { data: termInfo } = await supabase.from("term_info").select("*").eq("term", selectedTerm).single();

  let classSummary = [];
  let activeClassroom = null;

  if (selectedClassroomId) {
    activeClassroom = classrooms.find((c) => c.id === selectedClassroomId);

    const { data: classmates } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("classroom_id", selectedClassroomId)
      .eq("status", "active")
      .order("full_name");

    const { data: exams } = await supabase
      .from("exams")
      .select("id, subject_name, exam_type")
      .eq("classroom_id", selectedClassroomId)
      .eq("term", selectedTerm);
    const examIds = (exams || []).map((e) => e.id);
    const subjects = [...new Set((exams || []).map((e) => e.subject_name))];

    let allResults = [];
    if (examIds.length > 0) {
      const { data: resultsData } = await supabase
        .from("results")
        .select("student_id, score, exams(subject_name, exam_type)")
        .in("exam_id", examIds);
      allResults = resultsData || [];
    }

    const studentTotals = {};
    allResults.forEach((r) => {
      const sid = r.student_id;
      const subj = r.exams.subject_name;
      if (!studentTotals[sid]) studentTotals[sid] = {};
      if (!studentTotals[sid][subj]) studentTotals[sid][subj] = {};
      studentTotals[sid][subj][r.exams.exam_type] = { score: r.score };
    });

    const overallEntries = (classmates || []).map((c) => {
      const value = subjects.reduce((sum, subj) => sum + subjectTotal(studentTotals[c.id]?.[subj]), 0);
      return { id: c.id, value };
    });
    const { map: overallMap, outOf } = rankMap(overallEntries);

    classSummary = (classmates || [])
      .map((c) => ({
        id: c.id,
        full_name: c.full_name,
        total: overallEntries.find((e) => e.id === c.id)?.value || 0,
        position: overallMap.get(c.id) ? ordinal(overallMap.get(c.id)) : "—",
        outOf,
      }))
      .sort((a, b) => b.total - a.total);
  }

  // ---- Detail view for one student ----
  let detail = null;
  if (selectedStudentId && activeClassroom) {
    const { data: studentInfo } = await supabase
      .from("students")
      .select("id, full_name, photo_url")
      .eq("id", selectedStudentId)
      .single();

    const { data: classmates } = await supabase
      .from("students")
      .select("id")
      .eq("classroom_id", selectedClassroomId)
      .eq("status", "active");
    const classSize = (classmates || []).length;

    const { data: exams } = await supabase
      .from("exams")
      .select("id, subject_name, exam_type")
      .eq("classroom_id", selectedClassroomId)
      .eq("term", selectedTerm);
    const examIds = (exams || []).map((e) => e.id);
    const subjects = [...new Set((exams || []).map((e) => e.subject_name))];

    let allResults = [];
    if (examIds.length > 0) {
      const { data: resultsData } = await supabase
        .from("results")
        .select("student_id, score, exams(subject_name, exam_type)")
        .in("exam_id", examIds);
      allResults = resultsData || [];
    }

    const studentTotals = {};
    allResults.forEach((r) => {
      const sid = r.student_id;
      const subj = r.exams.subject_name;
      if (!studentTotals[sid]) studentTotals[sid] = {};
      if (!studentTotals[sid][subj]) studentTotals[sid][subj] = {};
      studentTotals[sid][subj][r.exams.exam_type] = { score: r.score };
    });

    const subjectRows = subjects.map((subject) => {
      const entries = (classmates || []).map((c) => ({
        id: c.id,
        value: subjectTotal(studentTotals[c.id]?.[subject]),
      }));
      const { map, outOf } = rankMap(entries);
      const t = studentTotals[selectedStudentId]?.[subject];
      const total = subjectTotal(t);
      return {
        subject,
        ca: (t?.["Class Exercise/Assignment"]?.score || 0) + (t?.["Mid-term"]?.score || 0),
        exam: t?.["End-of-term"]?.score ?? null,
        total,
        grade: total > 0 ? remarkFor(total, 100) : "—",
        position: map.get(selectedStudentId) ? ordinal(map.get(selectedStudentId)) : "—",
        outOf,
      };
    });

    const overallEntries = (classmates || []).map((c) => {
      const value = subjects.reduce((sum, subj) => sum + subjectTotal(studentTotals[c.id]?.[subj]), 0);
      return { id: c.id, value };
    });
    const { map: overallMap } = rankMap(overallEntries);
    const overallTotal = subjectRows.reduce((sum, r) => sum + r.total, 0);
    const overallPosition = overallMap.get(selectedStudentId)
      ? ordinal(overallMap.get(selectedStudentId))
      : "—";

    // Attendance within term dates
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

    // Fees
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
      studentInfo,
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
        <h1 className="font-display text-2xl font-semibold text-ink mb-1 print:hidden">Report cards</h1>
        <p className="text-stone-500 text-sm mb-6 print:hidden">Pick a class to see the class list, then open a student's full report card.</p>

        <div className="flex flex-wrap gap-2 mb-4 print:hidden">
          {classrooms.map((c) => (
            <Link
              key={c.id}
              href={`/report-card?classroomId=${c.id}&term=${selectedTerm}`}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
                c.id === selectedClassroomId
                  ? "bg-pine text-paper border-pine"
                  : "text-stone-500 border-stone-300 hover:border-pine/50"
              }`}
            >
              {c.academic_levels.name} {c.section}
            </Link>
          ))}
        </div>

        {selectedClassroomId && (
          <form method="GET" className="mb-4 print:hidden">
            <input type="hidden" name="classroomId" value={selectedClassroomId} />
            <AutoSubmitSelect
              name="term"
              defaultValue={selectedTerm}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              options={termOptions}
            />
          </form>
        )}

        {myProfile?.role && ["admin", "director", "headmaster", "assistant_headmaster"].includes(myProfile.role) && (
          <details className="mb-6 print:hidden">
            <summary className="text-xs text-stone-400 cursor-pointer">Set {selectedTerm} dates (vacation / reopening)</summary>
            <form action={saveTermInfo} className="flex flex-wrap gap-2 mt-2 items-end">
              <input type="hidden" name="term" value={selectedTerm} />
              <div>
                <label className="text-[10px] text-stone-400 block">Term starts</label>
                <input type="date" name="startDate" defaultValue={termInfo?.start_date || ""} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-stone-400 block">Vacation date</label>
                <input type="date" name="endDate" defaultValue={termInfo?.end_date || ""} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-stone-400 block">Reopening date</label>
                <input type="date" name="reopeningDate" defaultValue={termInfo?.reopening_date || ""} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="text-xs font-medium bg-stone-700 text-white px-3 py-2 rounded-lg">Save</button>
            </form>
          </details>
        )}

        {selectedClassroomId && !selectedStudentId && (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-center px-3 py-2 font-medium">Total</th>
                  <th className="text-center px-3 py-2 font-medium">Position</th>
                </tr>
              </thead>
              <tbody>
                {classSummary.map((s, i) => (
                  <tr key={s.id} className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/report-card?classroomId=${selectedClassroomId}&term=${selectedTerm}&studentId=${s.id}`}
                        className="text-ink font-medium hover:text-pine"
                      >
                        {s.full_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center text-stone-600">{s.total || "—"}</td>
                    <td className="px-3 py-2 text-center text-stone-600">
                      {s.position} of {s.outOf}
                    </td>
                  </tr>
                ))}
                {classSummary.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-stone-400">No students in this class.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {detail && (
          <div className="bg-white rounded-xl border border-stone-200 p-5 print:shadow-none print:border-0 print:p-0">
            <div className="flex items-center justify-between mb-4 print:hidden">
              <Link
                href={`/report-card?classroomId=${selectedClassroomId}&term=${selectedTerm}`}
                className="text-xs text-stone-400 hover:text-pine inline-block"
              >
                ← Back to class list
              </Link>
              <PrintButton />
            </div>

            {/* Header */}
            <div className="relative text-center pb-2 mb-3">
              {detail.studentInfo?.photo_url && (
                <img
                  src={detail.studentInfo.photo_url}
                  alt=""
                  className="absolute top-0 right-0 w-16 h-20 object-cover rounded border border-stone-300"
                />
              )}
              <img src="/logo.png" alt="" className="h-16 w-16 mx-auto mb-1 object-contain" />
              <p className="font-display text-base font-bold text-ink leading-tight">BARIMA DUAH MEMORIAL SCHOOL</p>
              <p className="text-[10px] text-stone-500 leading-tight">(Founded and Supported by ABAK FOUNDATION GHANA - NGO)</p>
              <p className="text-[10px] text-stone-500 leading-tight">Location: Kumasi Sokoban Timpomu — Contact: 0246-731605</p>
              <p className="text-sm font-semibold text-ink mt-1.5 uppercase tracking-wide">Pupil's Report Card</p>
            </div>

            {/* Top info: name/class/total, term/roll/position, date/next term */}
            <div className="text-[13px] leading-relaxed border-y border-stone-300 py-2 mb-3">
              <p>
                <span className="text-stone-500">NAME: </span>
                <span className="font-semibold text-ink uppercase">{detail.studentInfo?.full_name}</span>
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

            {/* Bottom info: attendance/promoted, attitude/interest, remarks */}
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

            {/* Bills */}
            <p className="text-xs font-semibold text-ink uppercase mb-1.5">
              {selectedTerm === "Term 3" ? "1st" : selectedTerm === "Term 1" ? "2nd" : "3rd"} Term {academicYear(now)} Academic Year — Bills:
            </p>
            <form action={saveRemarks} className="text-[13px] space-y-1 mb-3">
              <input type="hidden" name="studentId" value={selectedStudentId} />
              <input type="hidden" name="term" value={selectedTerm} />
              <input type="hidden" name="attitude" value={detail.remarks?.attitude || ""} />
              <input type="hidden" name="interests" value={detail.remarks?.interests || ""} />
              <input type="hidden" name="teacherRemarks" value={detail.remarks?.teacher_remarks || ""} />
              <input type="hidden" name="headteacherRemarks" value={detail.remarks?.headteacher_remarks || ""} />
              <p className="flex items-center gap-2 print:hidden">
                <span className="text-stone-500">NEW BILL FOR NEXT TERM:</span>
                <span className="text-ink font-medium">Gh₵</span>
                <input
                  type="number"
                  name="nextTermBill"
                  step="0.01"
                  defaultValue={detail.nextTermBill}
                  placeholder="0.00"
                  className="w-24 rounded border border-stone-300 px-2 py-0.5 text-sm"
                />
              </p>
              <p className="hidden print:block">
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
              <button type="submit" className="text-xs font-medium bg-pine text-paper px-3 py-1.5 rounded-lg hover:bg-pine/90 mt-1 print:hidden">
                Save
              </button>
            </form>

            {/* Editable remarks (kept separate from the printed-style card above) */}
            <details className="mb-4 print:hidden">
              <summary className="text-xs text-stone-400 cursor-pointer">Edit attitude / interests / remarks</summary>
              <form action={saveRemarks} className="space-y-2 mt-2">
                <input type="hidden" name="studentId" value={selectedStudentId} />
                <input type="hidden" name="term" value={selectedTerm} />
                <input type="hidden" name="nextTermBill" value={detail.nextTermBill} />
                <input name="attitude" defaultValue={detail.remarks?.attitude || ""} placeholder="Attitude / conduct" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <input name="interests" defaultValue={detail.remarks?.interests || ""} placeholder="Interest / hobby" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <input name="teacherRemarks" defaultValue={detail.remarks?.teacher_remarks || ""} placeholder="Class teacher's remark" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <input name="headteacherRemarks" defaultValue={detail.remarks?.headteacher_remarks || ""} placeholder="Head teacher's remark" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <button type="submit" className="text-xs font-medium bg-stone-700 text-white px-3 py-2 rounded-lg">
                  Save
                </button>
              </form>
            </details>

            {/* Signature */}
            <div className="pt-2">
              <p className="text-sm text-ink mb-4">DIRECTOR'S SIGNATURE: ___________________________________</p>
              <p className="text-[11px] font-semibold text-clay text-center uppercase">
                Amount paid are not refundable under any condition
              </p>
            </div>
          </div>
        )}

        {!selectedClassroomId && (
          <p className="text-sm text-stone-400">Select a class above to see the report card list.</p>
        )}
      </main>
    </div>
  );
}
