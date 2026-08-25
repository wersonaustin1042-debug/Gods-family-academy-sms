"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const TOTALS = {
  "Class Exercise/Assignment": 10,
  "Mid-term": 20,
  "End-of-term": 70,
};

function gradeFor(score, total) {
  const pct = (Number(score) / Number(total)) * 100;
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  if (pct >= 40) return "E";
  return "F";
}

export async function addSubject(formData) {
  const supabase = createClient();
  const name = formData.get("name")?.trim();
  const category = formData.get("category") || "primary_jhs";
  if (!name) return;
  await supabase.from("subjects").insert({ name, category }).select().single();
  revalidatePath("/grades");
}

// Saves Class Exercise/Assignment, Mid-term, and End-of-term marks for every student in one go
export async function saveAllMarks(formData) {
  const supabase = createClient();
  const classroomId = formData.get("classroomId");
  const subjectName = formData.get("subjectName");
  const term = formData.get("term");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ensure the three exam rows exist for this subject/term/classroom, and get their ids
  const examIds = {};
  for (const [examType, totalMarks] of Object.entries(TOTALS)) {
    const { data: examRow } = await supabase
      .from("exams")
      .upsert(
        { classroom_id: classroomId, subject_name: subjectName, term, exam_type: examType, total_marks: totalMarks },
        { onConflict: "classroom_id,subject_name,term,exam_type" }
      )
      .select("id")
      .single();
    if (examRow) examIds[examType] = examRow.id;
  }

  const prefixToType = { ca: "Class Exercise/Assignment", mid: "Mid-term", end: "End-of-term" };
  const rows = [];

  for (const [key, value] of formData.entries()) {
    if (value === "") continue;
    const [prefix, studentId] = key.split("__");
    if (!prefixToType[prefix] || !studentId) continue;

    const examType = prefixToType[prefix];
    const examId = examIds[examType];
    if (!examId) continue;

    const score = Number(value);
    rows.push({
      exam_id: examId,
      student_id: studentId,
      score,
      grade: gradeFor(score, TOTALS[examType]),
      recorded_by: user?.id,
    });
  }

  if (rows.length > 0) {
    await supabase.from("results").upsert(rows, { onConflict: "exam_id,student_id" });
  }

  revalidatePath("/grades");
}
