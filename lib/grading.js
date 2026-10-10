// Shared grading rules for God's Family Academy.
//
// Subject mark (out of 100) = SBA scaled to 50 + Exam scaled to 50
//   SBA  = 4 allocations x 15 marks = 60, scaled:  sba * 50 / 60
//   Exam = out of 100, scaled:                     exam * 50 / 100
// Nothing is rounded for calculation or grading; only display trims decimals.

export const SBA_TYPES = ["SBA 1", "SBA 2", "SBA 3", "SBA 4"];
export const EXAM_TYPE = "Exam";
export const ALL_TYPES = [...SBA_TYPES, EXAM_TYPE];

export const SBA_MAX_EACH = 15;
export const SBA_MAX_TOTAL = SBA_MAX_EACH * SBA_TYPES.length; // 60
export const EXAM_MAX = 100;

export const MAX_BY_TYPE = {
  "SBA 1": SBA_MAX_EACH,
  "SBA 2": SBA_MAX_EACH,
  "SBA 3": SBA_MAX_EACH,
  "SBA 4": SBA_MAX_EACH,
  Exam: EXAM_MAX,
};

// Remove floating-point noise (e.g. 40.00000000000001) without rounding the mark.
function clean(n) {
  return Math.round(n * 1e9) / 1e9;
}

// Pre-school and primary use the A-U scale; JHS (sort_order 12+) uses BECE.
export function scaleKeyForLevel(sortOrder) {
  return Number(sortOrder) >= 12 ? "jhs" : "primary";
}

// results: { [examType]: { score: number, did_not_write: boolean } } for one pupil + subject
export function computeSubject(results) {
  const missing = [];
  let sba = 0;
  let sbaDnw = false;

  for (const type of SBA_TYPES) {
    const r = results?.[type];
    if (!r) {
      missing.push(type);
      continue;
    }
    sba += Number(r.score) || 0;
    if (r.did_not_write) sbaDnw = true;
  }

  const examResult = results?.[EXAM_TYPE];
  let exam = 0;
  let examDnw = false;
  if (!examResult) {
    missing.push(EXAM_TYPE);
  } else {
    exam = Number(examResult.score) || 0;
    examDnw = !!examResult.did_not_write;
  }

  const sbaScaled = clean((sba * 50) / SBA_MAX_TOTAL);
  const examScaled = clean((exam * 50) / EXAM_MAX);
  const complete = missing.length === 0;

  return {
    sba: clean(sba),
    exam: clean(exam),
    sbaScaled,
    examScaled,
    total: complete ? clean(sbaScaled + examScaled) : null,
    missing,
    complete,
    sbaDnw,
    examDnw,
  };
}

// scaleRows: rows from grade_scales for ONE scale. First row whose min_mark the total reaches.
export function gradeFor(total, scaleRows) {
  if (total === null || total === undefined) return null;
  const sorted = [...(scaleRows || [])].sort((a, b) => Number(b.min_mark) - Number(a.min_mark));
  return sorted.find((r) => total >= Number(r.min_mark)) || sorted[sorted.length - 1] || null;
}

// bands: rows from class_bands. Matched by lower limit on the average mark.
export function classFor(average, bands) {
  if (average === null || average === undefined) return null;
  const sorted = [...(bands || [])].sort((a, b) => Number(b.min_average) - Number(a.min_average));
  return sorted.find((b) => average >= Number(b.min_average)) || sorted[sorted.length - 1] || null;
}

export function groupScales(rows) {
  const out = { primary: [], jhs: [] };
  (rows || []).forEach((r) => out[r.scale]?.push(r));
  return out;
}

// Display only: up to 2 decimals, trailing zeros trimmed.
export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return String(Number(Number(n).toFixed(2)));
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function rankMap(entries) {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const map = new Map();
  let rank = 1;
  sorted.forEach((entry, i) => {
    if (i > 0 && entry.value < sorted[i - 1].value) rank = i + 1;
    map.set(entry.id, rank);
  });
  return { map, outOf: sorted.length };
}

export const ADMIN_LIKE_ROLES = ["admin", "director", "headmaster", "assistant_headmaster"];

export async function loadGradingConfig(supabase) {
  const [{ data: scaleRows }, { data: bands }] = await Promise.all([
    supabase.from("grade_scales").select("*").order("min_mark", { ascending: false }),
    supabase.from("class_bands").select("*").order("min_average", { ascending: false }),
  ]);
  return { scales: groupScales(scaleRows), bands: bands || [] };
}

// Pulls every component result for a classroom + term and shapes it as
// totals[studentId][subjectId][examType] = { score, did_not_write }.
export async function loadTermResults(supabase, classroomId, term) {
  const { data: exams } = await supabase
    .from("exams")
    .select("id, subject_id, exam_type, subjects(name)")
    .eq("classroom_id", classroomId)
    .eq("term", term)
    .in("exam_type", ALL_TYPES);

  const examIds = (exams || []).map((e) => e.id);
  const subjectNameById = new Map((exams || []).map((e) => [e.subject_id, e.subjects?.name || "Unknown"]));
  const subjectIds = [...subjectNameById.keys()].sort((a, b) =>
    subjectNameById.get(a).localeCompare(subjectNameById.get(b))
  );

  const totals = {};
  if (examIds.length > 0) {
    const { data: results } = await supabase
      .from("results")
      .select("student_id, score, did_not_write, exams(subject_id, exam_type)")
      .in("exam_id", examIds);
    (results || []).forEach((r) => {
      const sid = r.student_id;
      const subj = r.exams.subject_id;
      if (!totals[sid]) totals[sid] = {};
      if (!totals[sid][subj]) totals[sid][subj] = {};
      totals[sid][subj][r.exams.exam_type] = { score: r.score, did_not_write: r.did_not_write };
    });
  }

  return { totals, subjectIds, subjectNameById };
}

// Everything the report card needs for ONE pupil, plus subject positions among classmates.
export function buildPupilCard({ studentId, classmateIds, totals, subjectIds, subjectNameById, scaleRows, bands }) {
  const subjectRows = subjectIds.map((subjectId) => {
    const computed = computeSubject(totals[studentId]?.[subjectId]);

    // Subject position: only among classmates whose marks for this subject are complete.
    const entries = classmateIds
      .map((id) => ({ id, c: computeSubject(totals[id]?.[subjectId]) }))
      .filter((e) => e.c.complete)
      .map((e) => ({ id: e.id, value: e.c.total }));
    const { map, outOf } = rankMap(entries);

    const grade = gradeFor(computed.total, scaleRows);
    return {
      subject: subjectNameById.get(subjectId),
      ...computed,
      grade: grade?.grade ?? null,
      gradeValue: grade?.grade_value ?? null,
      remark: grade?.remark ?? null,
      position: computed.complete && map.get(studentId) ? ordinal(map.get(studentId)) : null,
      outOf,
    };
  });

  const incomplete = subjectRows.filter((r) => !r.complete);
  const complete = incomplete.length === 0 && subjectRows.length > 0;
  const overallTotal = clean(subjectRows.reduce((sum, r) => sum + (r.total || 0), 0));
  const average = complete ? clean(overallTotal / subjectRows.length) : null;
  const band = complete ? classFor(average, bands) : null;

  return { subjectRows, incomplete, complete, overallTotal, average, classLabel: band?.label ?? null };
}
