"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildUsername, usernameToAuthEmail, authEmailToLoginName } from "@/lib/username";
import { normalizePhone } from "@/lib/phone";
import { generateTempPassword, ADMIN_LIKE_ROLES, TOP_ROLES } from "@/lib/passwords";
import { revalidatePath } from "next/cache";

// Who is calling, and what role they hold (null if not signed in)
async function getCaller() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return null;
  return { id: user.id, role: profile.role };
}

// Creates a login with a random temporary password. The admin never chooses the password:
// it is shown to them once, and the person must set their own at first sign-in.
export async function createStaffUser(prevState, formData) {
  const caller = await getCaller();
  if (!caller || !ADMIN_LIKE_ROLES.includes(caller.role)) {
    return { error: "Only school administrators can create logins." };
  }

  const supabase = createClient();
  const admin = createAdminClient();
  const fullName = formData.get("fullName")?.trim();
  const rawIdentifier = formData.get("phone")?.trim();
  const role = formData.get("role");
  const studentId = formData.get("studentId") || null;
  if (!fullName || !rawIdentifier || !role) {
    return { error: "Please fill in name, phone number, and role." };
  }
  if (TOP_ROLES.includes(role) && !TOP_ROLES.includes(caller.role)) {
    return { error: "Only an Admin or Director can create an Admin or Director login." };
  }
  const username = buildUsername(rawIdentifier); // "GFA" + digits, e.g. GFA0245117679
  if (username.length < 6) {
    return { error: "Enter a valid phone number." };
  }
  const phone = normalizePhone(username.slice(3)); // real phone, stored for contact/display
  const authEmail = usernameToAuthEmail(username);
  const tempPassword = generateTempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password: tempPassword,
    email_confirm: true,
    // app_metadata can only be written with the service key, so users can't clear this flag themselves
    app_metadata: { must_change_password: true },
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
    // Don't leave a login behind that has no profile
    await admin.auth.admin.deleteUser(newUserId);
    return { error: `Could not create the login: ${profileError.message}` };
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
  return {
    success: `Created login for ${fullName}.`,
    loginName: username,
    tempPassword,
  };
}

// Gives someone a new random temporary password (for a forgotten password). Their old password
// stops working, and they must choose their own again at next sign-in.
export async function resetUserPassword(prevState, formData) {
  const caller = await getCaller();
  if (!caller || !ADMIN_LIKE_ROLES.includes(caller.role)) {
    return { error: "Only school administrators can reset passwords." };
  }

  const userId = formData.get("userId");
  if (!userId) return { error: "No account selected." };
  if (userId === caller.id) {
    return { error: 'Use "Change password" in the menu to change your own password.' };
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("full_name, role").eq("id", userId).single();
  if (!target) return { error: "That account wasn't found." };
  if (TOP_ROLES.includes(target.role) && !TOP_ROLES.includes(caller.role)) {
    return { error: "Only an Admin or Director can reset an Admin or Director password." };
  }

  const tempPassword = generateTempPassword();
  const { data: updated, error } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
    app_metadata: { must_change_password: true },
  });
  if (error) return { error: error.message };

  revalidatePath("/users");
  return {
    success: `New temporary password for ${target.full_name}:`,
    loginName: authEmailToLoginName(updated?.user?.email),
    tempPassword,
  };
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
