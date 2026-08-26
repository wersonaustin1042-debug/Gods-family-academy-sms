"use client";

import { useState, useMemo } from "react";
import { runPromotion } from "./actions";

const STATUS_LABELS = {
  promoted: "Promote",
  repeated: "Repeat this class",
  graduated: "Graduate",
  needs_review: "Needs review — pick a class",
};

export default function PromotionForm({ classroomsWithStudents, allClassrooms }) {
  const today = new Date();
  const defaultLabel = `${today.getFullYear()}/${today.getFullYear() + 1}`;

  const [label, setLabel] = useState(defaultLabel);
  const [startDate, setStartDate] = useState(
    `${today.getFullYear()}-09-01`
  );
  const [endDate, setEndDate] = useState(`${today.getFullYear() + 1}-07-31`);

  // decisions[studentId] = { status, targetClassroomId }
  const initialDecisions = useMemo(() => {
    const map = {};
    for (const c of classroomsWithStudents) {
      for (const s of c.students) {
        map[s.id] = {
          status:
            c.suggestion.status === "needs_review"
              ? "promoted"
              : c.suggestion.status,
          targetClassroomId: c.suggestion.targetClassroomId,
        };
      }
    }
    return map;
  }, [classroomsWithStudents]);

  const [decisions, setDecisions] = useState(initialDecisions);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  function updateDecision(studentId, patch) {
    setDecisions((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], ...patch },
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const promotions = Object.entries(decisions).map(([studentId, d]) => ({
      student_id: studentId,
      status: d.status,
      target_classroom_id:
        d.status === "promoted" ? d.targetClassroomId : null,
    }));

    const missingTarget = promotions.find(
      (p) => p.status === "promoted" && !p.target_classroom_id
    );
    if (missingTarget) {
      setResult({
        success: false,
        error:
          "One or more students marked 'Promote' don't have a destination class selected.",
      });
      setSubmitting(false);
      return;
    }

    const res = await runPromotion({ label, startDate, endDate, promotions });
    setResult(res);
    setSubmitting(false);
  }

  const totalStudents = classroomsWithStudents.reduce(
    (sum, c) => sum + c.students.length,
    0
  );

  if (result?.success) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <p className="font-display text-lg font-semibold text-ink mb-1">
          Promotion complete
        </p>
        <p className="text-sm text-stone-500">
          {totalStudents} students updated. Academic year{" "}
          <strong>{label}</strong> is now current.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
        <p className="text-sm font-medium text-ink mb-3">New academic year</p>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              End date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {result?.success === false && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-4">
          {result.error}
        </div>
      )}

      <div className="space-y-6 mb-6">
        {classroomsWithStudents.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-xl border border-stone-200 overflow-hidden"
          >
            <div className="bg-stone-50 px-4 py-2 border-b border-stone-100 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">
                {c.levelName} {c.section}{" "}
                <span className="text-stone-400 font-normal">
                  ({c.students.length} students)
                </span>
              </p>
              {c.suggestion.status === "needs_review" && (
                <span className="text-xs text-amber-600 font-medium">
                  No matching next class found — review each student
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {c.students.map((s) => {
                  const d = decisions[s.id];
                  return (
                    <tr key={s.id} className="border-t border-stone-100">
                      <td className="px-4 py-2 text-ink">{s.full_name}</td>
                      <td className="px-4 py-2 text-right">
                        <select
                          value={d.status}
                          onChange={(e) =>
                            updateDecision(s.id, {
                              status: e.target.value,
                              targetClassroomId:
                                e.target.value === "promoted"
                                  ? c.suggestion.targetClassroomId
                                  : null,
                            })
                          }
                          className="border border-stone-200 rounded-lg px-2 py-1 text-xs mr-2"
                        >
                          <option value="promoted">Promote</option>
                          <option value="repeated">Repeat this class</option>
                          <option value="graduated">Graduate</option>
                        </select>
                        {d.status === "promoted" && (
                          <select
                            value={d.targetClassroomId || ""}
                            onChange={(e) =>
                              updateDecision(s.id, {
                                targetClassroomId: e.target.value,
                              })
                            }
                            className="border border-stone-200 rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="">Select class…</option>
                            {allClassrooms
                              .filter((ac) => ac.id !== c.id)
                              .map((ac) => (
                                <option key={ac.id} value={ac.id}>
                                  {ac.levelName} {ac.section}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-ink text-white disabled:opacity-50"
      >
        {submitting ? "Running promotion…" : `Run promotion for ${totalStudents} students`}
      </button>
    </form>
  );
}
