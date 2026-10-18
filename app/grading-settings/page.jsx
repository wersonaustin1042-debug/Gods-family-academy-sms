import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import { ADMIN_LIKE_ROLES } from "@/lib/grading";
import {
  saveClassBands,
  saveGradeScale,
  addComment,
  updateComment,
  deleteComment,
  addOption,
  updateOption,
  deleteOption,
} from "./actions";

export const dynamic = "force-dynamic";

const inputCls = "rounded-lg border border-stone-300 px-2 py-1.5 text-sm";

function ScaleForm({ scale, title, subtitle, rows }) {
  return (
    <form action={saveGradeScale} className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
      <input type="hidden" name="scale" value={scale} />
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="text-xs text-stone-400 mb-3">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-stone-500 text-xs uppercase">
            <tr>
              <th className="text-left px-1 py-1 font-medium">From (mark)</th>
              <th className="text-left px-1 py-1 font-medium">Grade</th>
              <th className="text-left px-1 py-1 font-medium">No.</th>
              <th className="text-left px-1 py-1 font-medium">Remark</th>
              <th className="text-center px-1 py-1 font-medium">Remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-1 py-1">
                  <input type="number" step="any" name={`min__${r.id}`} defaultValue={r.min_mark} className={`${inputCls} w-20`} />
                </td>
                <td className="px-1 py-1">
                  <input name={`grade__${r.id}`} defaultValue={r.grade} className={`${inputCls} w-16`} />
                </td>
                <td className="px-1 py-1">
                  <input type="number" name={`value__${r.id}`} defaultValue={r.grade_value} className={`${inputCls} w-16`} />
                </td>
                <td className="px-1 py-1">
                  <input name={`remark__${r.id}`} defaultValue={r.remark} className={`${inputCls} w-36`} />
                </td>
                <td className="px-1 py-1 text-center">
                  <input type="checkbox" name={`remove__${r.id}`} className="h-4 w-4 accent-clay" aria-label="Remove this grade" />
                </td>
              </tr>
            ))}
            <tr className="border-t border-stone-100">
              <td className="px-1 py-1">
                <input type="number" step="any" name="new_min" placeholder="From" className={`${inputCls} w-20`} />
              </td>
              <td className="px-1 py-1">
                <input name="new_grade" placeholder="Grade" className={`${inputCls} w-16`} />
              </td>
              <td className="px-1 py-1">
                <input type="number" name="new_value" placeholder="No." className={`${inputCls} w-16`} />
              </td>
              <td className="px-1 py-1" colSpan={2}>
                <input name="new_remark" placeholder="Add a new grade: remark" className={`${inputCls} w-full`} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button type="submit" className="mt-3 bg-pine text-paper text-xs font-medium px-4 py-2 rounded-lg hover:bg-pine/90">
        Save {title.toLowerCase()}
      </button>
    </form>
  );
}

function OptionList({ kind, title, subtitle, items }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="text-xs text-stone-400 mb-3">{subtitle}</p>
      <div className="space-y-2">
        {items.map((o) => (
          <form key={o.id} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={o.id} />
            <input name="label" defaultValue={o.label} className={`${inputCls} flex-1 min-w-[180px]`} />
            <button formAction={updateOption} className="bg-pine text-paper text-xs font-medium px-3 py-1.5 rounded-lg">
              Save
            </button>
            <button formAction={deleteOption} className="text-xs font-medium text-clay border border-clay/40 px-3 py-1.5 rounded-lg">
              Delete
            </button>
          </form>
        ))}
        {items.length === 0 && <p className="text-xs text-stone-400">No options yet.</p>}
      </div>
      <form action={addOption} className="flex flex-wrap items-center gap-2 border-t border-stone-100 mt-3 pt-3">
        <input type="hidden" name="kind" value={kind} />
        <input name="label" required placeholder="Add a new option" className={`${inputCls} flex-1 min-w-[180px]`} />
        <button type="submit" className="bg-stone-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
          Add
        </button>
      </form>
    </div>
  );
}

export default async function GradingSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();

  if (!profile || !ADMIN_LIKE_ROLES.includes(profile.role)) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-5 sm:p-8 max-w-3xl">
          <p className="text-sm text-stone-400">Only school administrators can change grading settings.</p>
        </main>
      </div>
    );
  }

  const [{ data: scaleRows }, { data: bands }, { data: comments }, { data: optionRows }] = await Promise.all([
    supabase.from("grade_scales").select("*").order("min_mark", { ascending: false }),
    supabase.from("class_bands").select("*").order("min_average", { ascending: false }),
    supabase.from("report_comments").select("*").order("sort_order"),
    supabase.from("report_options").select("*").order("sort_order"),
  ]);
  const interestOptions = (optionRows || []).filter((o) => o.kind === "interest");
  const attitudeOptions = (optionRows || []).filter((o) => o.kind === "attitude");

  const primary = (scaleRows || []).filter((r) => r.scale === "primary");
  const jhs = (scaleRows || []).filter((r) => r.scale === "jhs");

  const categories = [];
  (comments || []).forEach((c) => {
    let g = categories.find((x) => x.category === c.category);
    if (!g) {
      g = { category: c.category, items: [] };
      categories.push(g);
    }
    g.items.push(c);
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Grading settings</h1>
        <p className="text-stone-500 text-sm mb-6">
          Change the grade ranges, the class cut-offs and the ready-made report card comments. Changes apply to every
          report card straight away.
        </p>

        {/* Class bands */}
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Class (1st class, 2nd class …)</h2>
          <form action={saveClassBands} className="bg-white rounded-xl border border-stone-200 p-4">
            <p className="text-xs text-stone-400 mb-3">
              A pupil's class comes from their average mark across all subjects. Each class starts at the "from" average
              below. The lowest class must start at 0.
            </p>
            <div className="space-y-2">
              {(bands || []).map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  <input name={`label__${b.id}`} defaultValue={b.label} className={`${inputCls} w-44`} />
                  <span className="text-xs text-stone-400">from average</span>
                  <input type="number" step="any" name={`band__${b.id}`} defaultValue={b.min_average} className={`${inputCls} w-20`} />
                </div>
              ))}
            </div>
            <button type="submit" className="mt-3 bg-pine text-paper text-xs font-medium px-4 py-2 rounded-lg hover:bg-pine/90">
              Save classes
            </button>
          </form>
        </section>

        {/* Grade scales */}
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Grade scales</h2>
          <ScaleForm
            scale="primary"
            title="Pre-school & primary scale"
            subtitle="A mark gets the highest grade whose 'From' mark it reaches. Keep one row starting at 0."
            rows={primary}
          />
          <ScaleForm
            scale="jhs"
            title="JHS (BECE) scale"
            subtitle="Used for JHS 1 to JHS 3. Keep one row starting at 0."
            rows={jhs}
          />
        </section>

        {/* Interest / hobby and attitude / conduct options */}
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold text-ink mb-1">Interest / hobby &amp; attitude / conduct</h2>
          <p className="text-xs text-stone-400 mb-3">
            These fill the two drop-downs on the report card. Teachers can pick more than one, or type their own.
          </p>
          <OptionList
            kind="attitude"
            title="Attitude / conduct"
            subtitle="Shown next to ATTITUDE on the report card."
            items={attitudeOptions}
          />
          <OptionList
            kind="interest"
            title="Interest / hobby"
            subtitle="Shown next to INTEREST / HOBBY on the report card."
            items={interestOptions}
          />
        </section>

        {/* Comments */}
        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-1">Report card comments</h2>
          <p className="text-xs text-stone-400 mb-3">
            These fill the drop-down for the class teacher's and head teacher's remarks. The focus-area tag is kept for
            reference and isn't printed on the report card.
          </p>

          <form action={addComment} className="bg-white rounded-xl border border-stone-200 p-4 mb-4 space-y-2">
            <p className="text-sm font-medium text-ink">Add a comment</p>
            <textarea name="comment" rows={2} required placeholder="Comment" className={`${inputCls} w-full`} />
            <div className="flex flex-wrap gap-2">
              <input name="category" list="category-options" placeholder="Category" className={`${inputCls} flex-1 min-w-[200px]`} />
              <input name="tag" placeholder="Focus area / tag (optional)" className={`${inputCls} flex-1 min-w-[160px]`} />
            </div>
            <datalist id="category-options">
              {categories.map((g) => (
                <option key={g.category} value={g.category} />
              ))}
            </datalist>
            <button type="submit" className="bg-stone-700 text-white text-xs font-medium px-4 py-2 rounded-lg">
              Add comment
            </button>
          </form>

          {categories.map((g) => (
            <details key={g.category} className="bg-white rounded-xl border border-stone-200 mb-2">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">
                {g.category} <span className="text-stone-400 font-normal">({g.items.length})</span>
              </summary>
              <div className="px-4 pb-4 space-y-3">
                {g.items.map((c) => (
                  <form key={c.id} className="border-t border-stone-100 pt-3 space-y-2">
                    <input type="hidden" name="id" value={c.id} />
                    <textarea name="comment" rows={2} defaultValue={c.comment} className={`${inputCls} w-full`} />
                    <div className="flex flex-wrap gap-2">
                      <input name="category" defaultValue={c.category} className={`${inputCls} flex-1 min-w-[200px]`} />
                      <input name="tag" defaultValue={c.tag || ""} placeholder="Tag" className={`${inputCls} flex-1 min-w-[140px]`} />
                    </div>
                    <div className="flex gap-2">
                      <button formAction={updateComment} className="bg-pine text-paper text-xs font-medium px-3 py-1.5 rounded-lg">
                        Save
                      </button>
                      <button formAction={deleteComment} className="text-xs font-medium text-clay border border-clay/40 px-3 py-1.5 rounded-lg">
                        Delete
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}
