"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ALL_TYPES, MAX_BY_TYPE } from "@/lib/grading";

// Form field prefix -> exam type
const PREFIX_TO_TYPE = {
  sba1: "SBA 1",
  sba2: "SBA 2",
  sba3: "SBA 3",
  sba4: "SBA 4",
  exam: "Exam",
};

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

// Saves the four SBA allocations (15 each) and the Exam mark (100) for every pupil in one go.
// A blank box means "no mark yet". Ticking "Did not write" for a pupil saves 0 for every blank box
// and flags it, so the report card can carry on instead of showing the subject as incomplete.
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

  // Ensure the five exam rows exist for this subject/term/classroom, and get their ids
  const examIds = {};
  for (const examType of ALL_TYPES) {
    const { data: examRow, error: examError } = await supabase
      .from("exams")
      .upsert(
        {
          classroom_id: classroomId,
          subject_id: subjectId,
          term,
          exam_type: examType,
          total_marks: MAX_BY_TYPE[examType],
        },
        { onConflict: "classroom_id,subject_id,term,exam_type" }
      )
      .select("id")
      .single();

    if (examError) {
      console.error(`saveAllMarks: failed to upsert exam row for ${examType}:`, examError);
      throw new Error(`Could not save marks (exam setup failed): ${examError.message}`);
    }
    examIds[examType] = examRow.id;
  }

  // Work out, per pupil, what to save and what to clear
  const studentIds = new Set();
  for (const key of formData.keys()) {
    const [prefix, studentId] = key.split("__");
    if ((PREFIX_TO_TYPE[prefix] || prefix === "dnw") && studentId) studentIds.add(studentId);
  }

  const rows = [];
  const toClear = {}; // examType -> [studentId]

  for (const studentId of studentIds) {
    const didNotWrite = formData.get(`dnw__${studentId}`) === "on";

    for (const [prefix, examType] of Object.entries(PREFIX_TO_TYPE)) {
      const raw = formData.get(`${prefix}__${studentId}`);
      const hasValue = raw !== null && String(raw).trim() !== "";

      if (hasValue) {
        const score = Number(raw);
        const max = MAX_BY_TYPE[examType];
        if (!Number.isFinite(score) || score < 0 || score > max) {
          throw new Error(`${examType} must be a number from 0 to ${max} (got "${raw}").`);
        }
        rows.push({
          exam_id: examIds[examType],
          student_id: studentId,
          score,
          did_not_write: false,
          recorded_by: user?.id,
        });
      } else if (didNotWrite) {
        rows.push({
          exam_id: examIds[examType],
          student_id: studentId,
          score: 0,
          did_not_write: true,
          recorded_by: user?.id,
        });
      } else {
        (toClear[examType] ||= []).push(studentId);
      }
    }
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

  // A box that was emptied (and isn't covered by "Did not write") removes its old mark
  for (const [examType, ids] of Object.entries(toClear)) {
    if (ids.length === 0) continue;
    const { error: clearError } = await supabase
      .from("results")
      .delete()
      .eq("exam_id", examIds[examType])
      .in("student_id", ids);
    if (clearError) {
      console.error("saveAllMarks: failed to clear results:", clearError);
      throw new Error(`Could not clear emptied marks: ${clearError.message}`);
    }
  }

  revalidatePath("/grades");
  revalidatePath("/report-card");
  revalidatePath("/parent/report-card");
}
