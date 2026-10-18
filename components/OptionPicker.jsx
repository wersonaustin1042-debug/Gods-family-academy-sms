"use client";

import { useState } from "react";

// A drop-down of short ready-made options (interests / hobbies, attitude / conduct).
// Choosing one adds it to the text box; choosing more adds them after a comma (no repeats).
// The teacher can still edit the text or type something completely different.
export default function OptionPicker({ name, defaultValue = "", placeholder, options = [], className = "" }) {
  const [value, setValue] = useState(defaultValue);

  function add(label) {
    if (!label) return;
    const parts = value
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.some((p) => p.toLowerCase() === label.toLowerCase())) return;
    setValue([...parts, label].join(", "));
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex gap-2">
        <select
          value=""
          onChange={(e) => add(e.target.value)}
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm bg-white"
          aria-label={`${placeholder} — choose from the list`}
        >
          <option value="">{placeholder} — choose from the list…</option>
          {options.map((o) => (
            <option key={o.id} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            className="text-xs text-stone-500 border border-stone-300 rounded-lg px-3"
          >
            Clear
          </button>
        )}
      </div>
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="…or type your own"
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
