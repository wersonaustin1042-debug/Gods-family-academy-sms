"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden text-xs font-medium bg-slateblue text-paper px-3 py-1.5 rounded-lg hover:bg-slateblue/90"
    >
      Print / Save as PDF
    </button>
  );
}
