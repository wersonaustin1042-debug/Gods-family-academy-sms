"use client";

import { useFormState } from "react-dom";
import { createStaffUser } from "./actions";

const initialState = { error: null, success: null };

export default function CreateUserForm({ classrooms, students }) {
  const [state, formAction] = useFormState(createStaffUser, initialState);

  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 mb-6">
      <p className="text-sm font-medium text-ink">Create a new login</p>

      {state?.error && (
        <p className="text-sm text-clay bg-clay/10 border border-clay/30 rounded-lg px-3 py-2">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-pine bg-pine/10 border border-pine/30 rounded-lg px-3 py-2">{state.success}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-stone-500">Full name</label>
          <input name="fullName" required className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-stone-500">Email</label>
          <input name="email" type="email" required className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Password</label>
          <input name="password" type="text" required minLength={6} placeholder="min 6 characters" className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Phone (optional)</label>
          <input name="phone" className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-stone-500">Role</label>
          <select name="role" required className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm">
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
            <option value="accountant">Accountant</option>
            <option value="assistant_headmaster">Assistant Headmaster</option>
            <option value="headmaster">Headmaster</option>
            <option value="director">Director</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-stone-500">If Teacher — assign classes (optional, pick as many as they teach)</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {classrooms.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 cursor-pointer"
              >
                <input type="checkbox" name="classroomIds" value={c.id} className="accent-pine" />
                {c.academic_levels.name} {c.section}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">If Parent — link to child (optional)</label>
          <select name="studentId" className="w-full mt-1 rounded-lg border border-stone-300 px-3 py-2 text-sm">
            <option value="">— none —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" className="bg-pine text-paper text-sm font-medium px-4 py-2 rounded-lg hover:bg-pine/90">
        Create login
      </button>
    </form>
  );
}
