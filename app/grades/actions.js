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

  const { error } = await supabase.from("subjects").insert({ name, category }).select().single();
  if (error) {
    console.error("addSubject failed:", error);
    throw new Error(`Could not add subject: ${error.message}`);
  }

  revalidatePath("/grades");
}

// Saves Class Exercise/Assignment, Mid-term, and End-of-term marks for every student in one go
export async function saveAllMarks(formData) {
  const supabase = createClient();
  const classroomId = formData.get("classroomId");
  const subjectId = formData.get("subjectId");
  const term = formData.get("term");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();
  if (myProfile?.role === "teacher") {
    const { data: allowed } = await supabase
      .from("teacher_subjects")
      .select("subject_id")
      .eq("teacher_id", user.id)
      .eq("classroom_id", classroomId)
      .eq("subject_id", subjectId)
      .maybeSingle();
    if (!allowed) {
      throw new Error("You're not assigned to teach this subject for this class.");
    }
  }

  // Ensure the three exam rows exist for this subject/term/classroom, and get their ids
  const examIds = {};
  for (const [examType, totalMarks] of Object.entries(TOTALS)) {
    const { data: examRow, error: examError } = await supabase
      .from("exams")
      .upsert(
        { classroom_id: classroomId, subject_id: subjectId, term, exam_type: examType, total_marks: totalMarks },
        { onConflict: "classroom_id,subject_id,term,exam_type" }
      )
      .select("id")
      .single();

    if (examError) {
      console.error(`saveAllMarks: failed to upsert exam row for ${examType}:`, examError);
      throw new Error(`Could not save marks (exam setup failed): ${examError.message}`);
    }

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
    const { error: resultsError } = await supabase
      .from("results")
      .upsert(rows, { onConflict: "exam_id,student_id" });

    if (resultsError) {
      console.error("saveAllMarks: failed to upsert results:", resultsError);
      throw new Error(`Could not save marks: ${resultsError.message}`);
    }
  }

  revalidatePath("/grades");
  revalidatePath("/report-card");
}
