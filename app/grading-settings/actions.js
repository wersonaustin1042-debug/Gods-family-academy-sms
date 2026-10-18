"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ADMIN_LIKE_ROLES } from "@/lib/grading";

async function requireAdminLike() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();
  if (!profile || !ADMIN_LIKE_ROLES.includes(profile.role)) {
    throw new Error("Only school administrators can change grading settings.");
  }
  return supabase;
}

function refresh() {
  revalidatePath("/grading-settings");
  revalidatePath("/report-card");
  revalidatePath("/parent/report-card");
  revalidatePath("/parent");
}

// ---- Class bands (1st class, 2nd upper, ...) ----
export async function saveClassBands(formData) {
  const supabase = await requireAdminLike();

  const updates = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("band__")) continue;
    const id = Number(key.slice(6));
    const minAverage = Number(value);
    const label = String(formData.get(`label__${id}`) || "").trim();
    if (!Number.isFinite(minAverage) || minAverage < 0 || minAverage > 100) {
      throw new Error("Each class cut-off must be a number from 0 to 100.");
    }
    if (!label) throw new Error("Each class needs a name.");
    updates.push({ id, min_average: minAverage, label });
  }

  if (updates.length === 0) return;
  if (!updates.some((u) => u.min_average === 0)) {
    throw new Error("The lowest class (e.g. Pass) must start at 0 so every pupil gets a class.");
  }
  if (new Set(updates.map((u) => u.min_average)).size !== updates.length) {
    throw new Error("Two classes can't have the same cut-off.");
  }

  // Two-step write avoids clashing with the unique constraints while values swap around
  for (const u of updates) {
    const { error } = await supabase
      .from("class_bands")
      .update({ min_average: -1 * (u.id + 1000), label: `__tmp_${u.id}` })
      .eq("id", u.id);
    if (error) throw new Error(error.message);
  }
  for (const u of updates) {
    const { error } = await supabase
      .from("class_bands")
      .update({ min_average: u.min_average, label: u.label })
      .eq("id", u.id);
    if (error) throw new Error(error.message);
  }

  refresh();
}

// ---- Grade scales ----
// One form per scale ('primary' or 'jhs'). Existing rows are edited in place (or removed if ticked),
// and an optional new row can be added.
export async function saveGradeScale(formData) {
  const supabase = await requireAdminLike();
  const scale = formData.get("scale");
  if (scale !== "primary" && scale !== "jhs") throw new Error("Unknown grade scale.");

  const ids = new Set();
  for (const key of formData.keys()) {
    if (key.startsWith("min__")) ids.add(Number(key.slice(5)));
  }

  const keep = [];
  const remove = [];
  for (const id of ids) {
    if (formData.get(`remove__${id}`) === "on") {
      remove.push(id);
      continue;
    }
    const minMark = Number(formData.get(`min__${id}`));
    const gradeValue = Number(formData.get(`value__${id}`));
    const grade = String(formData.get(`grade__${id}`) || "").trim();
    const remark = String(formData.get(`remark__${id}`) || "").trim();
    if (!Number.isFinite(minMark) || minMark < 0 || minMark > 100) {
      throw new Error("Each lower limit must be a number from 0 to 100.");
    }
    if (!grade || !remark || !Number.isFinite(gradeValue)) {
      throw new Error("Each grade needs a letter, a grade number and a remark.");
    }
    keep.push({ id, min_mark: minMark, grade_value: gradeValue, grade, remark });
  }

  // Optional new row
  const newMinRaw = formData.get("new_min");
  if (newMinRaw !== null && String(newMinRaw).trim() !== "") {
    const minMark = Number(newMinRaw);
    const gradeValue = Number(formData.get("new_value"));
    const grade = String(formData.get("new_grade") || "").trim();
    const remark = String(formData.get("new_remark") || "").trim();
    if (!Number.isFinite(minMark) || minMark < 0 || minMark > 100 || !grade || !remark || !Number.isFinite(gradeValue)) {
      throw new Error("To add a grade, fill in the lower limit, letter, grade number and remark.");
    }
    keep.push({ id: null, min_mark: minMark, grade_value: gradeValue, grade, remark });
  }

  if (!keep.some((k) => k.min_mark === 0)) {
    throw new Error("The lowest grade must start at 0 so every mark gets a grade.");
  }
  if (new Set(keep.map((k) => k.min_mark)).size !== keep.length) {
    throw new Error("Two grades can't have the same lower limit.");
  }

  // Remove first, park the survivors on temporary limits, then write the final values
  if (remove.length > 0) {
    const { error } = await supabase.from("grade_scales").delete().eq("scale", scale).in("id", remove);
    if (error) throw new Error(error.message);
  }
  const existing = keep.filter((k) => k.id !== null);
  for (const k of existing) {
    const { error } = await supabase
      .from("grade_scales")
      .update({ min_mark: -1 * (k.id + 1000) })
      .eq("id", k.id)
      .eq("scale", scale);
    if (error) throw new Error(error.message);
  }
  for (const k of existing) {
    const { error } = await supabase
      .from("grade_scales")
      .update({ min_mark: k.min_mark, grade: k.grade, grade_value: k.grade_value, remark: k.remark })
      .eq("id", k.id)
      .eq("scale", scale);
    if (error) throw new Error(error.message);
  }
  for (const k of keep.filter((x) => x.id === null)) {
    const { error } = await supabase
      .from("grade_scales")
      .insert({ scale, min_mark: k.min_mark, grade: k.grade, grade_value: k.grade_value, remark: k.remark });
    if (error) throw new Error(error.message);
  }

  refresh();
}

// ---- Comments ----
export async function addComment(formData) {
  const supabase = await requireAdminLike();
  const comment = String(formData.get("comment") || "").trim();
  const category = String(formData.get("category") || "").trim() || "Other";
  const tag = String(formData.get("tag") || "").trim() || null;
  if (!comment) throw new Error("Type the comment first.");

  const { data: last } = await supabase
    .from("report_comments")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("report_comments")
    .insert({ comment, category, tag, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateComment(formData) {
  const supabase = await requireAdminLike();
  const id = Number(formData.get("id"));
  const comment = String(formData.get("comment") || "").trim();
  const category = String(formData.get("category") || "").trim() || "Other";
  const tag = String(formData.get("tag") || "").trim() || null;
  if (!comment) throw new Error("A comment can't be empty. Use Delete to remove it.");

  const { error } = await supabase.from("report_comments").update({ comment, category, tag }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteComment(formData) {
  const supabase = await requireAdminLike();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("report_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

// ---- Interest / hobby and attitude / conduct options ----
const OPTION_KINDS = ["interest", "attitude"];

export async function addOption(formData) {
  const supabase = await requireAdminLike();
  const kind = String(formData.get("kind") || "");
  const label = String(formData.get("label") || "").trim();
  if (!OPTION_KINDS.includes(kind)) throw new Error("Unknown option type.");
  if (!label) throw new Error("Type the option first.");

  const { data: last } = await supabase
    .from("report_options")
    .select("sort_order")
    .eq("kind", kind)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("report_options")
    .insert({ kind, label, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) {
    if (error.code === "23505") throw new Error("That option is already in the list.");
    throw new Error(error.message);
  }
  refresh();
}

export async function updateOption(formData) {
  const supabase = await requireAdminLike();
  const id = Number(formData.get("id"));
  const label = String(formData.get("label") || "").trim();
  if (!label) throw new Error("An option can't be empty. Use Delete to remove it.");

  const { error } = await supabase.from("report_options").update({ label }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("That option is already in the list.");
    throw new Error(error.message);
  }
  refresh();
}

export async function deleteOption(formData) {
  const supabase = await requireAdminLike();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("report_options").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
