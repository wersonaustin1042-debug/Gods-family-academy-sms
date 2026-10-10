import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { ALL_TYPES, MAX_BY_TYPE, SBA_MAX_EACH, SBA_MAX_TOTAL, EXAM_MAX } from "@/lib/grading";
import { saveAllMarks, addSubject } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_TO_KEY = { "SBA 1": "sba1", "SBA 2": "sba2", "SBA 3": "sba3", "SBA 4": "sba4", Exam: "exam" };
const COLUMNS = [
  { key: "sba1", label: "SBA 1", max: MAX_BY_TYPE["SBA 1"] },
  { key: "sba2", label: "SBA 2", max: MAX_BY_TYPE["SBA 2"] },
  { key: "sba3", label: "SBA 3", max: MAX_BY_TYPE["SBA 3"] },
  { key: "sba4", label: "SBA 4", max: MAX_BY_TYPE["SBA 4"] },
  { key: "exam", label: "Exam", max: EXAM_MAX },
];

export default async function GradesPage({ searchParams }) {
  const supabase = createClient();
  const selectedClassroomId = searchParams?.classroomId;
  const selectedSubjectId = searchParams?.subject; // now a subject id, not a name
  const selectedTerm = searchParams?.term || "Term 1";

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

  const isTeacher = myProfile?.role === "teacher";
  let allowedSubjectIds = null; // null = unrestricted (admin-like roles)

  if (isTeacher) {
    const { data: assignedRows } = await supabase
      .from("teacher_classrooms")
      .select("classroom_id")
      .eq("teacher_id", user.id);
    const assignedIds = new Set((assignedRows || []).map((r) => r.classroom_id));
    classrooms = classrooms.filter((c) => assignedIds.has(c.id));

    if (selectedClassroomId) {
      const { data: subjectRows } = await supabase
        .from("teacher_subjects")
        .select("subject_id")
        .eq("teacher_id", user.id)
        .eq("classroom_id", selectedClassroomId);
      allowedSubjectIds = new Set((subjectRows || []).map((r) => r.subject_id));
    }
  }

  const { data: subjects } = await supabase.from("subjects").select("id, name, category").order("name");

  let students = [];
  let existing = {}; // existing[studentId] = { sba1..sba4, exam, dnw }
  let levelCategory = "primary_jhs";

  if (selectedClassroomId) {
    const activeClassroom = classrooms.find((c) => c.id === selectedClassroomId);
    // Creche, Nursery 1-2, KG1-2 are sort_order 1-5 -> preschool; everything else is primary/JHS
    levelCategory = activeClassroom && activeClassroom.academic_levels.sort_order <= 5 ? "preschool" : "primary_jhs";
  }

  let filteredSubjects = (subjects || []).filter((s) => s.category === levelCategory);
  if (allowedSubjectIds) {
    filteredSubjects = filteredSubjects.filter((s) => allowedSubjectIds.has(s.id));
  }
  const selectedSubjectName = filteredSubjects.find((s) => s.id === selectedSubjectId)?.name || "";

  if (selectedClassroomId) {
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("classroom_id", selectedClassroomId)
      .eq("status", "active")
      .order("full_name");
    students = studentsData || [];
  }

  if (selectedClassroomId && selectedSubjectId) {
    const { data: exams } = await supabase
      .from("exams")
      .select("id, exam_type")
      .eq("classroom_id", selectedClassroomId)
      .eq("subject_id", selectedSubjectId)
      .eq("term", selectedTerm)
      .in("exam_type", ALL_TYPES);

    const examIdByType = {};
    (exams || []).forEach((e) => (examIdByType[e.exam_type] = e.id));
    const examIds = Object.values(examIdByType);

    if (examIds.length > 0) {
      const { data: results } = await supabase
        .from("results")
        .select("student_id, score, did_not_write, exams(exam_type)")
        .in("exam_id", examIds);

      (results || []).forEach((r) => {
        const key = TYPE_TO_KEY[r.exams.exam_type];
        if (!key) return;
        if (!existing[r.student_id]) existing[r.student_id] = {};
        // A "did not write" box shows empty; the tick below carries the 0
        existing[r.student_id][key] = r.did_not_write ? "" : r.score;
        if (r.did_not_write) existing[r.student_id].dnw = true;
      });
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Grades</h1>
        <p className="text-stone-500 text-sm mb-6">
          Pick a class and subject, then enter the four SBA marks (out of {SBA_MAX_EACH} each, {SBA_MAX_TOTAL} in total)
          and the Exam mark (out of {EXAM_MAX}) together. Marks are not rounded.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {classrooms.map((c) => (
            <Link
              key={c.id}
              href={`/grades?classroomId=${c.id}`}
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
          <>
            {isTeacher && filteredSubjects.length === 0 && (
              <p className="text-sm text-stone-400 bg-stone-50 border border-stone-200 rounded-lg p-3 mb-4">
                You haven't been assigned any subjects for this class yet — ask an admin to set that up under
                Staff & parents → Teacher class assignments.
              </p>
            )}
            <form method="GET" className="flex flex-wrap gap-3 mb-4">
              <input type="hidden" name="classroomId" value={selectedClassroomId} />
              <AutoSubmitSelect
                name="subject"
                defaultValue={selectedSubjectId || ""}
                className="flex-1 min-w-[180px] rounded-lg border border-stone-300 px-3 py-2 text-sm"
                options={[
                  { value: "", label: "Select a subject", disabled: true },
                  ...filteredSubjects.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <AutoSubmitSelect
                name="term"
                defaultValue={selectedTerm}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
                options={[
                  { value: "Term 1", label: "Term 1" },
                  { value: "Term 2", label: "Term 2" },
                  { value: "Term 3", label: "Term 3" },
                ]}
              />
            </form>

            <details className="mb-6">
              <summary className="text-xs text-stone-400 cursor-pointer">+ Add a subject not listed</summary>
              <form action={addSubject} className="flex gap-2 mt-2">
                <input type="hidden" name="category" value={levelCategory} />
                <input
                  name="name"
                  required
                  placeholder="e.g. Music"
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="text-xs font-medium bg-stone-700 text-white px-3 py-2 rounded-lg"
                >
                  Add
                </button>
              </form>
            </details>

            {selectedSubjectId && (
              <form action={saveAllMarks} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <input type="hidden" name="classroomId" value={selectedClassroomId} />
                <input type="hidden" name="subjectId" value={selectedSubjectId} />
                <input type="hidden" name="term" value={selectedTerm} />
                <div className="p-4 border-b border-stone-100">
                  <p className="text-sm font-medium text-ink">
                    {selectedSubjectName} — {selectedTerm}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Student</th>
                        {COLUMNS.map((c) => (
                          <th key={c.key} className="text-center px-2 py-2 font-medium whitespace-nowrap">
                            {c.label} <span className="text-stone-400 normal-case">({c.max})</span>
                          </th>
                        ))}
                        <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Did not write</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id} className="border-t border-stone-100">
                          <td className="px-4 py-2 text-ink">{s.full_name}</td>
                          {COLUMNS.map((c) => (
                            <td key={c.key} className="px-2 py-2">
                              <input
                                type="number"
                                name={`${c.key}__${s.id}`}
                                min="0"
                                max={c.max}
                                step="any"
                                defaultValue={existing[s.id]?.[c.key] ?? ""}
                                className="w-16 mx-auto block rounded-lg border border-stone-300 px-2 py-1 text-sm text-center"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              name={`dnw__${s.id}`}
                              defaultChecked={!!existing[s.id]?.dnw}
                              aria-label={`${s.full_name} did not write`}
                              className="h-4 w-4 accent-pine"
                            />
                          </td>
                        </tr>
                      ))}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={COLUMNS.length + 2} className="px-4 py-6 text-center text-stone-400">
                            No students in this class.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 pb-1 text-xs text-stone-400">
                  Leave a box empty if the mark isn't in yet. Tick "Did not write" and any empty box is saved as 0 and
                  labelled "Did not write" on the report card.
                </p>
                <div className="p-4">
                  <button
                    type="submit"
                    className="bg-pine text-paper text-sm font-medium px-4 py-2 rounded-lg hover:bg-pine/90"
                  >
                    Save marks
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
