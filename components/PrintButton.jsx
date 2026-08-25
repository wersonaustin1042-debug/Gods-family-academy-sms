"use client";

export default function PrintButton({ label = "Print" }) {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs font-medium bg-pine text-paper px-3 py-1.5 rounded-lg hover:bg-pine/90 print:hidden"
    >
      {label}
    </button>
  );
}
