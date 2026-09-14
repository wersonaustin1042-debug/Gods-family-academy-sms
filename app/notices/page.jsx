import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import { createNotice, deleteNotice } from "./actions";

export const dynamic = "force-dynamic";

const ADMIN_LIKE = ["admin", "director", "headmaster", "assistant_headmaster"];

export default async function NoticesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();
  const canManage = ADMIN_LIKE.includes(myProfile?.role);

  const { data: notices } = await supabase
    .from("notices")
    .select("id, title, body, created_by, created_at")
    .order("created_at", { ascending: false });

  // notices.created_by points at auth.users, not profiles, so it can't be
  // embedded via a single select — look names up separately.
  const creatorIds = [...new Set((notices || []).map((n) => n.created_by).filter(Boolean))];
  const { data: creators } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] };
  const nameById = Object.fromEntries((creators || []).map((c) => [c.id, c.full_name]));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-2xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Notice board</h1>
        <p className="text-stone-500 text-sm mb-6">School-wide announcements.</p>

        {canManage && (
          <form action={createNotice} className="bg-white rounded-xl border border-stone-200 p-4 mb-6 space-y-3">
            <input
              name="title"
              required
              placeholder="Title"
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              name="body"
              required
              placeholder="Write the announcement..."
              rows={3}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-pine text-paper text-sm font-medium px-4 py-2 rounded-lg">
              Post notice
            </button>
          </form>
        )}

        <div className="space-y-3">
          {(notices || []).map((n) => (
            <div key={n.id} className="bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium text-ink">{n.title}</h2>
                {canManage && (
                  <form action={deleteNotice.bind(null, n.id)}>
                    <button type="submit" className="text-xs text-stone-400 hover:text-clay shrink-0">
                      Delete
                    </button>
                  </form>
                )}
              </div>
              <p className="text-sm text-stone-600 mt-1 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-stone-400 mt-2">
                {nameById[n.created_by] || "Staff"} ·{" "}
                {new Date(n.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
          {(!notices || notices.length === 0) && <p className="text-stone-400 text-sm">No notices yet.</p>}
        </div>
      </main>
    </div>
  );
}
