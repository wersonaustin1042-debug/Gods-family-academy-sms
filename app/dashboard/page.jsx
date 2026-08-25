import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: students } = await supabase.from("students").select("id").eq("status", "active");
  const { data: levels } = await supabase
    .from("academic_levels")
    .select("id, name, sort_order")
    .order("sort_order");
  const { data: enrollmentByLevel } = await supabase
    .from("students")
    .select("classroom_id, classrooms(level_id, academic_levels(name))");
  const counts = {};
  (enrollmentByLevel || []).forEach((s) => {
    const name = s.classrooms?.academic_levels?.name;
    if (name) counts[name] = (counts[name] || 0) + 1;
  });

  const totalEnrolled = students?.length ?? 0;

  // Today's attendance, school-wide
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: todayAttendance } = await supabase
    .from("attendance")
    .select("status")
    .eq("date", todayIso);

  const presentToday = (todayAttendance || []).filter((a) => a.status === "present").length;
  const absentToday = (todayAttendance || []).filter((a) => a.status === "absent").length;
  const notMarkedToday = Math.max(0, totalEnrolled - presentToday - absentToday);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 pb-24 sm:pb-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Dashboard</h1>
        <p className="text-stone-500 text-sm mb-6">Barima Dua Memorial School, overview.</p>
        <div className="flex flex-wrap gap-3 mb-8">
          <div className="bg-white rounded-xl border border-stone-200 p-4 flex-1 min-w-[160px]">
            <p className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-1">
              Enrolled students
            </p>
            <p className="text-2xl font-display font-semibold text-ink">{totalEnrolled}</p>
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-4 flex-1 min-w-[160px]">
            <p className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-1">
              Present today
            </p>
            <p className="text-2xl font-display font-semibold text-pine">{presentToday}</p>
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-4 flex-1 min-w-[160px]">
            <p className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-1">
              Absent today
            </p>
            <p className="text-2xl font-display font-semibold text-clay">{absentToday}</p>
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-4 flex-1 min-w-[160px]">
            <p className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-1">
              Not yet marked
            </p>
            <p className="text-2xl font-display font-semibold text-stone-400">{notMarkedToday}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-sm font-medium text-ink mb-3">Enrollment by level</p>
          <div className="space-y-2">
            {(levels || []).map((lvl) => (
              <div key={lvl.id} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-stone-500 shrink-0">{lvl.name}</span>
                <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pine rounded-full"
                    style={{
                      width: `${Math.min(100, (counts[lvl.name] || 0) * 12)}%`,
                    }}
                  />
                </div>
                <span className="w-6 text-right text-stone-400 font-mono text-xs">
                  {counts[lvl.name] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
