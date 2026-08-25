import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import PromotionForm from "./PromotionForm";

export const dynamic = "force-dynamic";

export default async function PromotionPage() {
  const supabase = createClient();

  // No page-level role check here — matching the pattern used on
  // /fees-overview. Access is controlled by (1) only showing this page's
  // sidebar link to admin/director roles, and (2) promote_students()
  // itself calling is_admin_like() and rejecting anyone else at the DB
  // level, so even a direct URL visit can't actually run a promotion.

  // --- Data --------------------------------------------------------
  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, section, level_id, academic_levels(id, name, sort_order)")
    .order("level_id", { ascending: true })
    .order("section", { ascending: true });

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, classroom_id")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  const { data: currentYear } = await supabase
    .from("academic_years")
    .select("label, start_date, end_date")
    .eq("is_current", true)
    .maybeSingle();

  // --- Build classroom lookup + suggested targets -------------------
  const classroomList = (classrooms || []).map((c) => ({
    id: c.id,
    section: c.section,
    levelId: c.level_id,
    levelName: c.academic_levels?.name || "",
    sortOrder: c.academic_levels?.sort_order ?? 0,
  }));

  const maxSortOrder = classroomList.reduce(
    (max, c) => Math.max(max, c.sortOrder),
    0
  );

  function suggestedTarget(classroom) {
    if (classroom.sortOrder >= maxSortOrder) {
      return { status: "graduated", targetClassroomId: null };
    }
    const match = classroomList.find(
      (c) =>
        c.sortOrder === classroom.sortOrder + 1 &&
        c.section === classroom.section
    );
    if (match) {
      return { status: "promoted", targetClassroomId: match.id };
    }
    // No same-section match at the next level — needs manual pick.
    return { status: "needs_review", targetClassroomId: null };
  }

  const classroomsWithStudents = classroomList
    .map((c) => ({
      ...c,
      suggestion: suggestedTarget(c),
      students: (students || []).filter((s) => s.classroom_id === c.id),
    }))
    .filter((c) => c.students.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.section.localeCompare(b.section));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-4xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">
          End-of-year promotion
        </h1>
        <p className="text-stone-500 text-sm mb-6">
          Move students up to the next class, mark repeaters, and graduate
          final-year students. This runs once, for the whole school, and
          starts a new academic year.
        </p>

        {currentYear && (
          <p className="text-xs text-stone-400 mb-6">
            Current academic year: <strong>{currentYear.label}</strong> (
            {currentYear.start_date} to {currentYear.end_date})
          </p>
        )}

        <PromotionForm
          classroomsWithStudents={classroomsWithStudents}
          allClassrooms={classroomList}
        />
      </main>
    </div>
  );
}
