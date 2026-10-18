import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import CommentPicker from "@/components/CommentPicker";
import OptionPicker from "@/components/OptionPicker";
import {
  loadGradingConfig,
  loadTermResults,
  buildPupilCard,
  scaleKeyForLevel,
  fmt,
  ordinal,
} from "@/lib/grading";
import { saveTermInfo, saveRemarks } from "./actions";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

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

  // Teachers can only generate report cards for their own homeroom class, not every class they teach.
  if (myProfile?.role === "teacher") {
    classrooms = classrooms.filter((c) => c.class_teacher_id === user.id);
  }

  const { data: termInfo } = await supabase.from("term_info").select("*").eq("term", selectedTerm).single();

  const config = await loadGradingConfig(supabase);
  const { data: commentList } = await supabase
    .from("report_comments")
    .select("id, category, comment, tag")
    .order("sort_order");
  const { data: optionList } = await supabase
    .from("report_options")
    .select("id, kind, label")
    .order("sort_order");
  const interestOptions = (optionList || []).filter((o) => o.kind === "interest");
  const attitudeOptions = (optionList || []).filter((o) => o.kind === "attitude");

  let classSummary = [];
  let activeClassroom = null;
  let classmates = [];
  let termData = null;
  let scaleRows = [];

  if (selectedClassroomId) {
    activeClassroom = classrooms.find((c) => c.id === selectedClassroomId);

    if (activeClassroom) {
      const { data: classmatesData } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("classroom_id", selectedClassroomId)
        .eq("status", "active")
        .order("full_name");
      classmates = classmatesData || [];

      termData = await loadTermResults(supabase, selectedClassroomId, selectedTerm);
      scaleRows = config.scales[scaleKeyForLevel(activeClassroom.academic_levels.sort_order)] || [];

      const classmateIds = classmates.map((c) => c.id);
      classSummary = classmates.map((c) => {
        const card = buildPupilCard({
          studentId: c.id,
          classmateIds,
          totals: termData.totals,
          subjectIds: termData.subjectIds,
          subjectNameById: termData.subjectNameById,
          scaleRows,
          bands: config.bands,
        });
        return {
          id: c.id,
          full_name: c.full_name,
          total: card.overallTotal,
          classLabel: card.classLabel,
          missingSubjects: card.incomplete.length,
          hasSubjects: card.subjectRows.length > 0,
        };
      });
    }
  }

  // ---- Detail view for one student ----
  let detail = null;
  if (selectedStudentId && activeClassroom && termData) {
    const { data: studentInfo } = await supabase
      .from("students")
      .select("id, full_name, photo_url")
      .eq("id", selectedStudentId)
      .single();

    const card = buildPupilCard({
      studentId: selectedStudentId,
      classmateIds: classmates.map((c) => c.id),
      totals: termData.totals,
      subjectIds: termData.subjectIds,
      subjectNameById: termData.subjectNameById,
      scaleRows,
      bands: config.bands,
    });

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
      classSize: classmates.length,
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
                  <th className="text-center px-3 py-2 font-medium">Class</th>
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
                    <td className="px-3 py-2 text-center text-stone-600">{s.hasSubjects ? fmt(s.total) : "—"}</td>
                    <td className="px-3 py-2 text-center text-stone-600">
                      {s.classLabel ? (
                        s.classLabel
                      ) : s.hasSubjects ? (
                        <span className="text-clay text-xs">
                          Marks missing ({s.missingSubjects} subject{s.missingSubjects === 1 ? "" : "s"})
                        </span>
                      ) : (
                        "—"
                      )}
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

            {detail.card.incomplete.length > 0 && (
              <div className="mb-4 rounded-lg border border-clay/40 bg-clay/5 p-3 text-xs text-ink print:hidden">
                <p className="font-semibold text-clay mb-1">Marks are still missing for this pupil:</p>
                <ul className="list-disc ml-4 space-y-0.5">
                  {detail.card.incomplete.map((r) => (
                    <li key={r.subject}>
                      <span className="font-medium">{r.subject}</span> — {r.missing.join(", ")}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-stone-500">
                  Enter them on the Grades page. If the pupil didn't write a paper, tick "Did not write" there to count
                  it as 0 and continue. The class is shown once every subject is complete.
                </p>
              </div>
            )}

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
              <p className="font-display text-base font-bold text-ink leading-tight">God's Family Academy</p>
              <p className="text-[10px] text-stone-500 italic leading-tight">Service to God and Humanity</p>
              <p className="text-[10px] text-stone-500 leading-tight">Sokoban Ampayoo, P.O. Box AH 8193, Kumasi</p>
              <p className="text-[10px] text-stone-500 leading-tight">Tel: 0244748974 / 0208225706 / 0273123182 — Email: attaadwumoline@yahoo.com</p>
              <p className="text-sm font-semibold text-ink mt-1.5 uppercase tracking-wide">Pupil's Report Card</p>
            </div>

            {/* Top info: name/class/total, term/roll/class achieved, date/next term */}
            <div className="text-[13px] leading-relaxed border-y border-stone-300 py-2 mb-3">
              <p>
                <span className="text-stone-500">NAME: </span>
                <span className="font-semibold text-ink uppercase">{detail.studentInfo?.full_name}</span>
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
                <span className="font-medium text-ink">{detail.card.complete ? fmt(detail.card.average) : "—"}</span>
                <span className="text-stone-500 ml-3">CLASS ACHIEVED: </span>
                <span className="font-semibold text-pine">{detail.card.classLabel || "— (marks missing)"}</span>
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
                    {r.complete ? (
                      <>
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
                      </>
                    ) : (
                      <td colSpan={6} className="px-2 py-1.5 border border-stone-200 text-center text-clay">
                        Marks missing: {r.missing.join(", ")}
                      </td>
                    )}
                  </tr>
                ))}
                {detail.card.subjectRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-center text-stone-400">
                      No marks have been entered for {selectedTerm} yet.
                    </td>
                  </tr>
                )}
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

            {/* Editable remarks: pick a ready-made comment or type your own */}
            <details className="mb-4 print:hidden" open>
              <summary className="text-xs text-stone-400 cursor-pointer">Attitude / interests / remarks</summary>
              <form action={saveRemarks} className="space-y-3 mt-2">
                <input type="hidden" name="studentId" value={selectedStudentId} />
                <input type="hidden" name="term" value={selectedTerm} />
                <input type="hidden" name="nextTermBill" value={detail.nextTermBill} />
                <div>
                  <p className="text-[11px] text-stone-400 mb-1">Attitude / conduct</p>
                  <OptionPicker
                    key={`a-${selectedStudentId}-${selectedTerm}`}
                    name="attitude"
                    defaultValue={detail.remarks?.attitude || ""}
                    placeholder="Attitude / conduct"
                    options={attitudeOptions}
                  />
                </div>
                <div>
                  <p className="text-[11px] text-stone-400 mb-1">Interest / hobby</p>
                  <OptionPicker
                    key={`i-${selectedStudentId}-${selectedTerm}`}
                    name="interests"
                    defaultValue={detail.remarks?.interests || ""}
                    placeholder="Interest / hobby"
                    options={interestOptions}
                  />
                </div>
                <div>
                  <p className="text-[11px] text-stone-400 mb-1">Class teacher's remark</p>
                  <CommentPicker
                    key={`t-${selectedStudentId}-${selectedTerm}`}
                    name="teacherRemarks"
                    defaultValue={detail.remarks?.teacher_remarks || ""}
                    placeholder="Class teacher's remark"
                    comments={commentList || []}
                  />
                </div>
                <div>
                  <p className="text-[11px] text-stone-400 mb-1">Head teacher's remark</p>
                  <CommentPicker
                    key={`h-${selectedStudentId}-${selectedTerm}`}
                    name="headteacherRemarks"
                    defaultValue={detail.remarks?.headteacher_remarks || ""}
                    placeholder="Head teacher's remark"
                    comments={commentList || []}
                  />
                </div>
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
