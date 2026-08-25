import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { saveAllMarks, addSubject } from "./actions";

export const dynamic = "force-dynamic";

export default async function GradesPage({ searchParams }) {
  const supabase = createClient();
  const selectedClassroomId = searchParams?.classroomId;
  const selectedSubject = searchParams?.subject;
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
if (myProfile?.role === "teacher") { const { data: assignedRows } = await supabase .from("teacher_classrooms") .select("classroom_id") .eq("teacher_id", user.id); const assignedIds = new Set((assignedRows || []).map((r) => r.classroom_id)); classrooms = classrooms.filter((c) => assignedIds.has(c.id)); }
  const { data: subjects } = await supabase.from("subjects").select("id, name, category").order("name");

  let students = [];
  let existing = {}; // existing[studentId] = { ca, mid, end }
  let levelCategory = "primary_jhs";

  if (selectedClassroomId) {
    const activeClassroom = classrooms.find((c) => c.id === selectedClassroomId);
    // Creche, Nursery 1-2, KG1-2 are sort_order 1-5 -> preschool; everything else is primary/JHS
    levelCategory = activeClassroom && activeClassroom.academic_levels.sort_order <= 5 ? "preschool" : "primary_jhs";
  }

  const filteredSubjects = (subjects || []).filter((s) => s.category === levelCategory);

  if (selectedClassroomId) {
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("classroom_id", selectedClassroomId)
      .eq("status", "active")
      .order("full_name");
    students = studentsData || [];
  }

  if (selectedClassroomId && selectedSubject) {
    const { data: exams } = await supabase
      .from("exams")
      .select("id, exam_type")
      .eq("classroom_id", selectedClassroomId)
      .eq("subject_name", selectedSubject)
      .eq("term", selectedTerm);

    const examIdByType = {};
    (exams || []).forEach((e) => (examIdByType[e.exam_type] = e.id));
    const examIds = Object.values(examIdByType);

    if (examIds.length > 0) {
      const { data: results } = await supabase
        .from("results")
        .select("student_id, score, exams(exam_type)")
        .in("exam_id", examIds);

      (results || []).forEach((r) => {
        const key = { "Class Exercise/Assignment": "ca", "Mid-term": "mid", "End-of-term": "end" }[
          r.exams.exam_type
        ];
        if (!existing[r.student_id]) existing[r.student_id] = {};
        existing[r.student_id][key] = r.score;
      });
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Grades</h1>
        <p className="text-stone-500 text-sm mb-6">
          Pick a class and subject, then enter Class Exercise/Assignment, Mid-term, and End-of-term marks together.
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
            <form method="GET" className="flex flex-wrap gap-3 mb-4">
              <input type="hidden" name="classroomId" value={selectedClassroomId} />
              <AutoSubmitSelect
                name="subject"
                defaultValue={selectedSubject || ""}
                className="flex-1 min-w-[180px] rounded-lg border border-stone-300 px-3 py-2 text-sm"
                options={[
                  { value: "", label: "Select a subject", disabled: true },
                  ...filteredSubjects.map((s) => ({ value: s.name, label: s.name })),
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

            {selectedSubject && (
              <form action={saveAllMarks} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <input type="hidden" name="classroomId" value={selectedClassroomId} />
                <input type="hidden" name="subjectName" value={selectedSubject} />
                <input type="hidden" name="term" value={selectedTerm} />
                <div className="p-4 border-b border-stone-100">
                  <p className="text-sm font-medium text-ink">
                    {selectedSubject} — {selectedTerm}
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Student</th>
                      <th className="text-center px-3 py-2 font-medium">Class Ex./Assign. (10)</th>
                      <th className="text-center px-3 py-2 font-medium">Mid-term (20)</th>
                      <th className="text-center px-3 py-2 font-medium">End-of-term (70)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.id} className="border-t border-stone-100">
                        <td className="px-4 py-2 text-ink">{s.full_name}</td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            name={`ca__${s.id}`}
                            min="0"
                            max="10"
                            step="0.5"
                            defaultValue={existing[s.id]?.ca ?? ""}
                            className="w-16 mx-auto block rounded-lg border border-stone-300 px-2 py-1 text-sm text-center"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            name={`mid__${s.id}`}
                            min="0"
                            max="20"
                            step="0.5"
                            defaultValue={existing[s.id]?.mid ?? ""}
                            className="w-16 mx-auto block rounded-lg border border-stone-300 px-2 py-1 text-sm text-center"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            name={`end__${s.id}`}
                            min="0"
                            max="70"
                            step="0.5"
                            defaultValue={existing[s.id]?.end ?? ""}
                            className="w-16 mx-auto block rounded-lg border border-stone-300 px-2 py-1 text-sm text-center"
                          />
                        </td>
                      </tr>
                    ))}
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-stone-400">
                          No students in this class.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
