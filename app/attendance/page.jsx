import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { cycleAttendance } from "./actions";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function weekdaysInMonth(year, month) {
  // month is 1-12
  const days = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) {
      days.push({
        iso: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        label: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][dow],
      });
    }
  }
  return days;
}

export default async function AttendancePage({ searchParams }) {
  const supabase = createClient();
  const selectedClassroomId = searchParams?.classroomId;

  const now = new Date();
  const selectedYear = Number(searchParams?.year) || now.getFullYear();
  const selectedMonth = Number(searchParams?.month) || now.getMonth() + 1;

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
  const days = weekdaysInMonth(selectedYear, selectedMonth);

  let students = [];
  let attendanceMap = {}; // attendanceMap[studentId][dateIso] = 'present' | 'absent'

  if (selectedClassroomId) {
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("classroom_id", selectedClassroomId)
      .eq("status", "active")
      .order("full_name");
    students = studentsData || [];

    const monthStart = days[0]?.iso;
    const monthEnd = days[days.length - 1]?.iso;

    if (monthStart && monthEnd) {
      const { data: attendanceData } = await supabase
        .from("attendance")
        .select("student_id, date, status")
        .eq("classroom_id", selectedClassroomId)
        .gte("date", monthStart)
        .lte("date", monthEnd);

      (attendanceData || []).forEach((a) => {
        if (!attendanceMap[a.student_id]) attendanceMap[a.student_id] = {};
        attendanceMap[a.student_id][a.date] = a.status;
      });
    }
  }

  const monthOptions = MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }));
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({
    value: String(y),
    label: String(y),
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-4xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Attendance register</h1>
        <p className="text-stone-500 text-sm mb-6">
          Pick a class, choose the month, then tap a cell to cycle: blank → Present → Absent → blank.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {classrooms.map((c) => (
            <Link
              key={c.id}
              href={`/attendance?classroomId=${c.id}&year=${selectedYear}&month=${selectedMonth}`}
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
            <form method="GET" className="flex gap-3 mb-4">
              <input type="hidden" name="classroomId" value={selectedClassroomId} />
              <AutoSubmitSelect
                name="month"
                defaultValue={String(selectedMonth)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
                options={monthOptions}
              />
              <AutoSubmitSelect
                name="year"
                defaultValue={String(selectedYear)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
                options={yearOptions}
              />
            </form>

            <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-stone-50 text-left px-3 py-2 text-xs font-medium text-stone-500 border-b border-stone-200 min-w-[140px]">
                      Student
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.iso}
                        className="px-1.5 py-2 text-center text-[10px] font-medium text-stone-400 border-b border-stone-200 min-w-[34px]"
                      >
                        <div>{d.label}</div>
                        <div className="text-stone-600">{d.day}</div>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center text-[10px] font-medium text-stone-500 border-b border-stone-200 min-w-[50px]">
                      Present
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const record = attendanceMap[s.id] || {};
                    const presentCount = Object.values(record).filter((v) => v === "present").length;
                    return (
                      <tr key={s.id} className="border-t border-stone-100">
                        <td className="sticky left-0 bg-white px-3 py-1.5 text-ink whitespace-nowrap">
                          {s.full_name}
                        </td>
                        {days.map((d) => {
                          const status = record[d.iso] || "";
                          return (
                            <td key={d.iso} className="px-1 py-1 text-center">
                              <form action={cycleAttendance}>
                                <input type="hidden" name="studentId" value={s.id} />
                                <input type="hidden" name="classroomId" value={selectedClassroomId} />
                                <input type="hidden" name="date" value={d.iso} />
                                <input type="hidden" name="currentStatus" value={status} />
                                <button
                                  type="submit"
                                  className={`w-7 h-7 rounded-md text-[11px] font-mono font-bold border
                                    ${
                                      status === "present"
                                        ? "bg-pine/10 text-pine border-pine/40"
                                        : status === "absent"
                                        ? "bg-clay/10 text-clay border-clay/40"
                                        : "border-dashed border-stone-200 text-stone-300"
                                    }`}
                                >
                                  {status === "present" ? "P" : status === "absent" ? "A" : ""}
                                </button>
                              </form>
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-center text-xs font-medium text-stone-500">
                          {presentCount}/{days.length}
                        </td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={days.length + 2} className="px-4 py-6 text-center text-stone-400">
                        No students in this class.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
