"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildUsername, usernameToAuthEmail } from "@/lib/username";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export async function createStaffUser(prevState, formData) {
  const supabase = createClient();
  const admin = createAdminClient();
  const fullName = formData.get("fullName")?.trim();
  const rawIdentifier = formData.get("phone")?.trim();
  const password = formData.get("password");
  const role = formData.get("role");
  const studentId = formData.get("studentId") || null;
  if (!fullName || !rawIdentifier || !password || !role) {
    return { error: "Please fill in name, phone number, password, and role." };
  }
  if (password.trim().length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  const username = buildUsername(rawIdentifier); // "GFA" + digits, e.g. GFA0245117679
  const phone = normalizePhone(username.slice(3)); // real phone, stored for contact/display
  const authEmail = usernameToAuthEmail(username);
  const { data: created, error } = await admin.auth.admin.createUser({
    email: authEmail,
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

export async function setClassTeacher(formData) {
  const supabase = createClient();
  const classroomId = formData.get("classroomId");
  const teacherId = formData.get("teacherId") || null;
  if (!classroomId) return;

  if (teacherId) {
    const { data: existing } = await supabase
      .from("classrooms")
      .select("id")
      .eq("class_teacher_id", teacherId)
      .neq("id", classroomId)
      .maybeSingle();
    if (existing) {
      // Teacher is already homeroom teacher of another classroom — reject.
      // The dropdown already hides this option in normal use; this just guards against stale page state.
      return;
    }
  }

  await supabase.from("classrooms").update({ class_teacher_id: teacherId }).eq("id", classroomId);
  revalidatePath("/users");
}

// Sets exactly which subjects a teacher is allowed to grade for one
// classroom they're assigned to — full replace of that (teacher, classroom)
// pair each time this is submitted.
export async function assignTeacherSubjects(formData) {
  const supabase = createClient();
  const teacherId = formData.get("teacherId");
  const classroomId = formData.get("classroomId");
  const subjectIds = formData.getAll("subjectIds").filter(Boolean);
  if (!teacherId || !classroomId) return;

  await supabase
    .from("teacher_subjects")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("classroom_id", classroomId);

  if (subjectIds.length > 0) {
    await supabase
      .from("teacher_subjects")
      .insert(subjectIds.map((subjectId) => ({ teacher_id: teacherId, classroom_id: classroomId, subject_id: subjectId })));
  }
  revalidatePath("/users");
}
