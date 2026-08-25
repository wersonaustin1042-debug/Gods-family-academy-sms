"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveTermInfo(formData) {
  const supabase = createClient();
  const term = formData.get("term");
  const startDate = formData.get("startDate") || null;
  const endDate = formData.get("endDate") || null;
  const reopeningDate = formData.get("reopeningDate") || null;

  await supabase
    .from("term_info")
    .update({ start_date: startDate, end_date: endDate, reopening_date: reopeningDate })
    .eq("term", term);

  revalidatePath("/report-card");
}

export async function saveRemarks(formData) {
  const supabase = createClient();
  const studentId = formData.get("studentId");
  const term = formData.get("term");

  await supabase.from("term_remarks").upsert(
    {
      student_id: studentId,
      term,
      attitude: formData.get("attitude") || null,
      teacher_remarks: formData.get("teacherRemarks") || null,
      interests: formData.get("interests") || null,
      headteacher_remarks: formData.get("headteacherRemarks") || null,
      next_term_bill: formData.get("nextTermBill") ? Number(formData.get("nextTermBill")) : null,
    },
    { onConflict: "student_id,term" }
  );

  revalidatePath("/report-card");
}
