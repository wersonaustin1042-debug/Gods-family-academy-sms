import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

export default async function AbsenteesPage({ searchParams }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();
  const role = myProfile?.role;

  const selectedDate = searchParams?.date || formatDate(new Date());

  const { data: classroomsRaw } = await supabase
    .from("classrooms")
    .select("id, section, academic_levels(name, sort_order)");
  let classrooms = (classroomsRaw || []).sort(
    (a, b) => a.academic_levels.sort_order - b.academic_levels.sort_order || a.section.localeCompare(b.section)
  );

  if (role === "teacher") {
    const { data: assignedRows } = await supabase
      .from("teacher_classrooms")
      .select("classroom_id")
      .eq("teacher_id", user.id);
    const assignedIds = new Set((assignedRows || []).map((r) => r.classroom_id));
    classrooms = classrooms.filter((c) => assignedIds.has(c.id));
  }

  const classroomIds = classrooms.map((c) => c.id);
  const classroomById = Object.fromEntries(
    classrooms.map((c) => [c.id, `${c.academic_levels.name} ${c.section}`])
  );

  let rows = [];
  if (classroomIds.length > 0) {
    const { data: absentRecords } = await supabase
      .from("attendance")
      .select("student_id, classroom_id, students(full_name, guardian_name, guardian_phone, guardian_relationship)")
      .eq("date", selectedDate)
      .eq("status", "absent")
      .in("classroom_id", classroomIds);

    rows = (absentRecords || [])
      .map((r) => ({
        id: r.student_id,
        name: r.students?.full_name || "—",
        className: classroomById[r.classroom_id] || "—",
        guardianName: r.students?.guardian_name || "—",
        guardianPhone: r.students?.guardian_phone || "—",
        guardianRelationship: r.students?.guardian_relationship || "—",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const prettyDate = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-1 print:hidden">
          <h1 className="font-display text-2xl font-semibold text-ink">Absentee list</h1>
          <PrintButton />
        </div>
        <p className="text-stone-500 text-sm mb-4 hidden print:block font-display text-xl font-semibold text-ink">
          Absentee list
        </p>

        <form method="GET" className="flex items-end gap-2 mb-2 print:hidden">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Date</label>
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 text-ink border border-stone-200"
          >
            Go
          </button>
        </form>

        <p className="text-stone-500 text-sm mb-6">{prettyDate}</p>

        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Student</th>
                <th className="text-left px-3 py-2 font-medium">Class</th>
                <th className="text-left px-3 py-2 font-medium">Guardian</th>
                <th className="text-left px-3 py-2 font-medium">Phone</th>
                <th className="text-left px-3 py-2 font-medium">Relationship</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <td className="px-4 py-2 text-ink font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-stone-500">{r.className}</td>
                  <td className="px-3 py-2 text-stone-500">{r.guardianName}</td>
                  <td className="px-3 py-2 text-stone-500">{r.guardianPhone}</td>
                  <td className="px-3 py-2 text-stone-500">{r.guardianRelationship}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-stone-400">
                    No absences recorded for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
