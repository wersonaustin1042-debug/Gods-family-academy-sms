"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function cycleAttendance(formData) {
  const supabase = createClient();
  const studentId = formData.get("studentId");
  const classroomId = formData.get("classroomId");
  const date = formData.get("date");
  const currentStatus = formData.get("currentStatus") || "";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // blank -> present -> absent -> blank
  let nextStatus = null;
  if (currentStatus === "") nextStatus = "present";
  else if (currentStatus === "present") nextStatus = "absent";
  else nextStatus = null;

  if (nextStatus === null) {
    await supabase.from("attendance").delete().eq("student_id", studentId).eq("date", date);
  } else {
    await supabase.from("attendance").upsert(
      { student_id: studentId, classroom_id: classroomId, date, status: nextStatus, recorded_by: user?.id },
      { onConflict: "student_id,date" }
    );
  }

  revalidatePath("/attendance");
}
