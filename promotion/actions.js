"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// promotions: array of { student_id, status: 'promoted'|'repeated'|'graduated', target_classroom_id? }
export async function runPromotion({ label, startDate, endDate, promotions }) {
  const supabase = createClient();

  if (!label || !startDate || !endDate) {
    return { success: false, error: "Missing academic year label or dates." };
  }
  if (!Array.isArray(promotions) || promotions.length === 0) {
    return { success: false, error: "No students to promote." };
  }

  const { data, error } = await supabase.rpc("promote_students", {
    p_label: label,
    p_start_date: startDate,
    p_end_date: endDate,
    p_promotions: promotions,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/promotion");
  revalidatePath("/students");
  revalidatePath("/dashboard");

  return { success: true, academicYearId: data };
}
