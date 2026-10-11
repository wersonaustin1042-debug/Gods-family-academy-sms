import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import { linkParentToChild, assignTeacherToClassrooms, unassignTeacherFromClassroom, setClassTeacher, assignTeacherSubjects } from "./actions";
import CreateUserForm from "./CreateUserForm";
import ResetPasswordButton from "./ResetPasswordButton";
import { TOP_ROLES } from "@/lib/passwords";

export const dynamic = "force-dynamic";

const ROLE_LABELS = {
  admin: "Admin",
  director: "Director",
  headmaster: "Headmaster",
  assistant_headmaster: "Assistant Headmaster",
  teacher: "Teacher",
  accountant: "Accountant",
  parent: "Parent",
};

export default async function UsersPage() {
  const supabase = createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role")
    .order("full_name");

  const { data: classroomsRaw } = await supabase
    .from("classrooms")
    .select("id, section, class_teacher_id, academic_levels(name, sort_order)");
  const classrooms = (classroomsRaw || []).sort(
    (a, b) =>
      a.academic_levels.sort_order - b.academic_levels.sort_order ||
      a.section.localeCompare(b.section)
  );
  const homeroomTeacherIds = new Set(classrooms.map((c) => c.class_teacher_id).filter(Boolean));

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");

  const { data: teacherAssignments } = await supabase
    .from("teacher_classrooms")
    .select("teacher_id, classroom_id, classrooms(section, academic_levels(name, sort_order))");

  const { data: allSubjects } = await supabase.from("subjects").select("id, name, category").order("name");
  const { data: teacherSubjectRows } = await supabase.from("teacher_subjects").select("teacher_id, classroom_id, subject_id");
  const subjectIdsByTeacherClassroom = {};
  (teacherSubjectRows || []).forEach((r) => {
    const key = `${r.teacher_id}:${r.classroom_id}`;
    if (!subjectIdsByTeacherClassroom[key]) subjectIdsByTeacherClassroom[key] = new Set();
    subjectIdsByTeacherClassroom[key].add(r.subject_id);
  });

  const assignmentsByTeacher = {};
  (teacherAssignments || []).forEach((a) => {
    if (!assignmentsByTeacher[a.teacher_id]) assignmentsByTeacher[a.teacher_id] = [];
    const category = (a.classrooms?.academic_levels?.sort_order ?? 99) <= 5 ? "preschool" : "primary_jhs";
    assignmentsByTeacher[a.teacher_id].push({
      classroomId: a.classroom_id,
      label: `${a.classrooms?.academic_levels?.name} ${a.classrooms?.section}`,
      subjectOptions: (allSubjects || []).filter((s) => s.category === category),
    });
  });

  const teachers = (profiles || []).filter((p) => p.role === "teacher");
  const parents = (profiles || []).filter((p) => p.role === "parent");

  // Who can reset whose password: nobody resets their own here (they use "Change password"),
  // and only an Admin or Director may reset an Admin or Director.
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  const myRole = (profiles || []).find((p) => p.id === me?.id)?.role;
  const canReset = (p) => p.id !== me?.id && (!TOP_ROLES.includes(p.role) || TOP_ROLES.includes(myRole));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Staff & parents</h1>
        <p className="text-stone-500 text-sm mb-6">
          Create logins for staff and parents, and assign teachers to classes.
        </p>

        <CreateUserForm classrooms={classrooms} students={students || []} />

        <details className="mb-6">
          <summary className="text-xs text-stone-400 cursor-pointer">Link an existing parent to another child</summary>
          <form action={linkParentToChild} className="flex flex-wrap gap-2 mt-2">
            <select name="parentId" required className="rounded-lg border border-stone-300 px-3 py-2 text-sm">
              <option value="">Select parent</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <select name="studentId" required className="rounded-lg border border-stone-300 px-3 py-2 text-sm">
              <option value="">Select child</option>
              {(students || []).map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
            <button type="submit" className="text-xs font-medium bg-stone-700 text-white px-3 py-2 rounded-lg">
              Link
            </button>
          </form>
        </details>

        {/* Homeroom / class teacher assignment — one teacher per classroom, used to scope Attendance and Report Cards */}
        <details className="mb-6" open>
          <summary className="text-sm font-medium text-ink cursor-pointer">Homeroom teacher</summary>
          <p className="text-xs text-stone-400 mt-1 mb-3">
            Set which teacher is the homeroom (class) teacher for each classroom. This is separate from the
            class assignments below — homeroom teachers get access to Attendance and Report Cards for their own class. Fees are managed by admin/accountant only.
          </p>
          <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
            {classrooms.map((c) => (
              <form
                key={c.id}
                action={setClassTeacher}
                className="flex items-center justify-between gap-2 p-3"
              >
                <input type="hidden" name="classroomId" value={c.id} />
                <p className="text-sm text-ink">
                  {c.academic_levels.name} {c.section}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    name="teacherId"
                    defaultValue={c.class_teacher_id || ""}
                    className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                  >
                    <option value="">No homeroom teacher</option>
                    {teachers
                      .filter((t) => t.id === c.class_teacher_id || !homeroomTeacherIds.has(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>{t.full_name}</option>
                      ))}
                  </select>
                  <button
                    type="submit"
                    className="text-xs font-medium bg-stone-700 text-white px-3 py-1.5 rounded-lg"
                  >
                    Save
                  </button>
                </div>
              </form>
            ))}
            {classrooms.length === 0 && (
              <p className="p-4 text-sm text-stone-400 text-center">No classrooms yet.</p>
            )}
          </div>
        </details>

        {/* Assign more classes to an existing teacher */}
        <details className="mb-6" open>
          <summary className="text-sm font-medium text-ink cursor-pointer">Teacher class assignments</summary>
          <div className="mt-3 space-y-4">
            <form action={assignTeacherToClassrooms} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
              <p className="text-xs font-medium text-stone-500">Assign classes to a teacher</p>
              <select name="teacherId" required className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm">
                <option value="">Select teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                {classrooms.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 cursor-pointer">
                    <input type="checkbox" name="classroomIds" value={c.id} className="accent-pine" />
                    {c.academic_levels.name} {c.section}
                  </label>
                ))}
              </div>
              <button type="submit" className="text-xs font-medium bg-pine text-paper px-3 py-2 rounded-lg hover:bg-pine/90">
                Assign selected classes
              </button>
            </form>

            {/* Current assignments per teacher, with remove option and per-class subject picker */}
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
              {teachers.map((t) => (
                <div key={t.id} className="p-3">
                  <p className="text-xs font-medium text-ink mb-1.5">{t.full_name}</p>
                  <div className="space-y-2">
                    {(assignmentsByTeacher[t.id] || []).map((a) => {
                      const checkedIds = subjectIdsByTeacherClassroom[`${t.id}:${a.classroomId}`] || new Set();
                      return (
                        <div key={a.classroomId} className="border border-stone-100 rounded-lg p-2">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-xs text-stone-600 font-medium">{a.label}</span>
                            <form action={unassignTeacherFromClassroom}>
                              <input type="hidden" name="teacherId" value={t.id} />
                              <input type="hidden" name="classroomId" value={a.classroomId} />
                              <button
                                type="submit"
                                className="text-[11px] bg-stone-100 hover:bg-clay/10 hover:text-clay text-stone-600 px-2 py-1 rounded-full"
                                title="Tap to remove this class"
                              >
                                Remove class ×
                              </button>
                            </form>
                          </div>
                          <form action={assignTeacherSubjects} className="flex flex-wrap items-center gap-1.5">
                            <input type="hidden" name="teacherId" value={t.id} />
                            <input type="hidden" name="classroomId" value={a.classroomId} />
                            {a.subjectOptions.map((s) => (
                              <label
                                key={s.id}
                                className="flex items-center gap-1 text-[11px] bg-stone-50 border border-stone-200 rounded-full px-2 py-1 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  name="subjectIds"
                                  value={s.id}
                                  defaultChecked={checkedIds.has(s.id)}
                                  className="accent-pine"
                                />
                                {s.name}
                              </label>
                            ))}
                            {a.subjectOptions.length === 0 && (
                              <span className="text-[11px] text-stone-400">No subjects set up for this level yet.</span>
                            )}
                            <button
                              type="submit"
                              className="text-[11px] font-medium bg-pine text-paper px-2.5 py-1 rounded-full"
                            >
                              Save subjects
                            </button>
                          </form>
                        </div>
                      );
                    })}
                    {(!assignmentsByTeacher[t.id] || assignmentsByTeacher[t.id].length === 0) && (
                      <span className="text-xs text-stone-400">No classes assigned yet.</span>
                    )}
                  </div>
                </div>
              ))}
              {teachers.length === 0 && (
                <p className="p-4 text-sm text-stone-400 text-center">No teacher accounts yet.</p>
              )}
            </div>
          </div>
        </details>

        {/* Existing users list */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Phone</th>
                <th className="text-left px-4 py-2 font-medium">Password</th>
              </tr>
            </thead>
            <tbody>
              {(profiles || []).map((p) => (
                <tr key={p.id} className="border-t border-stone-100 align-top">
                  <td className="px-4 py-2 text-ink">{p.full_name}</td>
                  <td className="px-4 py-2 text-stone-500">{ROLE_LABELS[p.role] || p.role}</td>
                  <td className="px-4 py-2 text-stone-500">{p.phone || "—"}</td>
                  <td className="px-4 py-2">
                    {canReset(p) ? <ResetPasswordButton userId={p.id} name={p.full_name} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
