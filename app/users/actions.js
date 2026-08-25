"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function createStaffUser(prevState, formData) {
  const supabase = createClient();
  const admin = createAdminClient();

  const fullName = formData.get("fullName")?.trim();
  const email = formData.get("email")?.trim();
  const password = formData.get("password");
  const role = formData.get("role");
  const phone = formData.get("phone")?.trim() || null;
  const studentId = formData.get("studentId") || null;

  if (!fullName || !email || !password || !role) {
    return { error: "Please fill in name, email, password, and role." };
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !created?.user) {
    return { error: error?.message || "Could not create the login." };
  }

  const newUserId = created.user.id;

  const { error: profileError } = await supabase.from("profiles").insert({
    id: newUserId,
    full_name: fullName,
    phone,
    role,
  });

  if (profileError) {
    return { error: `Login created but profile failed: ${profileError.message}` };
  }

  if (role === "teacher") {
    const classroomIds = formData.getAll("classroomIds").filter(Boolean);
    if (classroomIds.length > 0) {
      await supabase
        .from("teacher_classrooms")
        .insert(classroomIds.map((id) => ({ teacher_id: newUserId, classroom_id: id })));
    }
  }

  if (role === "parent" && studentId) {
    await supabase.from("student_guardians").insert({ student_id: studentId, parent_id: newUserId });
  }

  revalidatePath("/users");
  return { success: `Created login for ${fullName}.` };
}

// Links an existing parent account to another child (for parents with more than one kid at the school)
export async function linkParentToChild(formData) {
  const supabase = createClient();
  const parentId = formData.get("parentId");
  const studentId = formData.get("studentId");
  if (!parentId || !studentId) return;

  await supabase.from("student_guardians").insert({ student_id: studentId, parent_id: parentId });
  revalidatePath("/users");
}

export async function assignTeacherToClassrooms(formData) {
  const supabase = createClient();
  const teacherId = formData.get("teacherId");
  const classroomIds = formData.getAll("classroomIds").filter(Boolean);
  if (!teacherId || classroomIds.length === 0) return;

  await supabase
    .from("teacher_classrooms")
    .insert(classroomIds.map((id) => ({ teacher_id: teacherId, classroom_id: id })));
  revalidatePath("/users");
}

export async function unassignTeacherFromClassroom(formData) {
  const supabase = createClient();
  const teacherId = formData.get("teacherId");
  const classroomId = formData.get("classroomId");
  if (!teacherId || !classroomId) return;

  await supabase
    .from("teacher_classrooms")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("classroom_id", classroomId);
  revalidatePath("/users");
}
export async function setClassTeacher(formData) { const supabase = createClient(); const classroomId = formData.get("classroomId"); const teacherId = formData.get("teacherId") || null; if (!classroomId) return; await supabase.from("classrooms").update({ class_teacher_id: teacherId }).eq("id", classroomId); revalidatePath("/users"); }
