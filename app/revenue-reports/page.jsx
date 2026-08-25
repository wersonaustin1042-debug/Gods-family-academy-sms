import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function getRange(period, dateStr) {
  const selected = new Date(dateStr + "T00:00:00");
  const today = new Date();

  if (period === "week") {
    const day = selected.getDay(); // 0 = Sun ... 6 = Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(selected);
    monday.setDate(selected.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const end = sunday > today ? today : sunday;
    return { start: monday, end, label: `${formatDate(monday)} to ${formatDate(end)}` };
  }

  if (period === "month") {
    const firstOfMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const lastOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    const end = lastOfMonth > today ? today : lastOfMonth;
    return { start: firstOfMonth, end, label: `${formatDate(firstOfMonth)} to ${formatDate(end)}` };
  }

  // day
  return { start: selected, end: selected, label: formatDate(selected) };
}

export default async function RevenueReportsPage({ searchParams }) {
  const supabase = createClient();

  const period = ["day", "week", "month"].includes(searchParams?.period) ? searchParams.period : "day";
  const dateParam = searchParams?.date || formatDate(new Date());

  const { start, end, label } = getRange(period, dateParam);

  const { data: rows } = await supabase.rpc("get_revenue_report", {
    start_date: formatDate(start),
    end_date: formatDate(end),
  });

  const breakdown = rows || [];
  const combinedTotal = breakdown.reduce((sum, r) => sum + Number(r.total), 0);

  const tabs = [
    { key: "day", label: "Day" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
  ];

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-5 sm:p-8 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Revenue reports</h1>
        <p className="text-stone-500 text-sm mb-6">
          Fees collected across Tuition, Canteen, and Transport.
        </p>

        <div className="flex gap-2 mb-4">
          {tabs.map((t) => (
            <a
              key={t.key}
              href={`/revenue-reports?period=${t.key}&date=${dateParam}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                period === t.key
                  ? "bg-ink text-white border-ink"
                  : "bg-white text-stone-500 border-stone-200"
              }`}
            >
              {t.label}
            </a>
          ))}
        </div>

        <form method="get" className="flex items-end gap-2 mb-6">
          <input type="hidden" name="period" value={period} />
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              {period === "day"
                ? "Date"
                : period === "week"
                ? "Any date in the week"
                : "Any date in the month"}
            </label>
            <input
              type="date"
              name="date"
              defaultValue={dateParam}
              className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 text-ink border border-stone-200"
          >
            Go
          </button>
        </form>

        <p className="text-xs text-stone-400 mb-2">{label}</p>

        <div className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
          <p className="text-xs text-stone-400">Total revenue</p>
          <p className="font-display text-2xl font-semibold text-clay">Gh₵ {combinedTotal.toFixed(2)}</p>
        </div>

        <p className="text-sm font-medium text-ink mb-2">By fee type</p>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Fee type</th>
                <th className="text-right px-4 py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => (
                <tr key={r.fee_type} className="border-t border-stone-100">
                  <td className="px-4 py-2 text-ink">{r.fee_type}</td>
                  <td className="px-4 py-2 text-right font-medium text-clay">
                    Gh₵ {Number(r.total).toFixed(2)}
                  </td>
                </tr>
              ))}
              {breakdown.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-stone-400">
                    No revenue recorded for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
