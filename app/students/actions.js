"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function uploadStudentPhoto(supabase, studentId, file) {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${studentId}.${ext}`;
  const { error } = await supabase.storage
    .from("student-photos")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("student-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function enrollStudent(formData) {
  const supabase = createClient();
  const fullName = formData.get("fullName");
  const levelId = formData.get("levelId");
  const section = formData.get("section");
  const dob = formData.get("dob") || null;
  const guardianName = formData.get("guardianName") || null;
  const guardianPhone = formData.get("guardianPhone") || null;
  const guardianRelationship = formData.get("guardianRelationship") || null;
  const remarks = formData.get("remarks") || null;
  const photoFile = formData.get("photo");

  // Find or create the classroom for this level + section
  let { data: classroom } = await supabase
    .from("classrooms")
    .select("id")
    .eq("level_id", levelId)
    .eq("section", section)
    .single();
  if (!classroom) {
    const { data: newClassroom, error: classroomError } = await supabase
      .from("classrooms")
      .insert({ level_id: levelId, section })
      .select("id")
      .single();
    if (classroomError) throw new Error(classroomError.message);
    classroom = newClassroom;
  }

  const { data: student, error } = await supabase
    .from("students")
    .insert({
      full_name: fullName,
      classroom_id: classroom.id,
      date_of_birth: dob,
      guardian_name: guardianName,
      guardian_phone: guardianPhone,
      guardian_relationship: guardianRelationship,
      remarks,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Every student starts with a tuition plan so Fees works immediately
  await supabase.from("tuition_plans").insert({ student_id: student.id });

  if (photoFile && photoFile.size > 0) {
    const photoUrl = await uploadStudentPhoto(supabase, student.id, photoFile);
    if (photoUrl) {
      await supabase.from("students").update({ photo_url: photoUrl }).eq("id", student.id);
    }
  }

  revalidatePath("/students");
  revalidatePath("/dashboard");
}

export async function updateRemarks(formData) {
  const supabase = createClient();
  const studentId = formData.get("studentId");
  const remarks = formData.get("remarks") || null;
  const { error } = await supabase.from("students").update({ remarks }).eq("id", studentId);
  if (error) throw new Error(error.message);
  revalidatePath("/students");
}

export async function uploadPhoto(formData) {
  const supabase = createClient();
  const studentId = formData.get("studentId");
  const photoFile = formData.get("photo");
  if (!photoFile || photoFile.size === 0) return;
  const photoUrl = await uploadStudentPhoto(supabase, studentId, photoFile);
  if (photoUrl) {
    const { error } = await supabase.from("students").update({ photo_url: photoUrl }).eq("id", studentId);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/students");
}
