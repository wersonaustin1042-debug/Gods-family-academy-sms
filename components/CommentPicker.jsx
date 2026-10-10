"use client";

import { useState } from "react";

// A drop-down of ready-made report card comments. Choosing one fills the text box,
// and the teacher can still edit it or type something completely different.
export default function CommentPicker({ name, defaultValue = "", placeholder, comments = [], className = "" }) {
  const [value, setValue] = useState(defaultValue);

  const groups = [];
  comments.forEach((c) => {
    let g = groups.find((x) => x.category === c.category);
    if (!g) {
      g = { category: c.category, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  });

  return (
    <div className={`space-y-1 ${className}`}>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) setValue(e.target.value);
        }}
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm bg-white"
        aria-label={`${placeholder} — choose from the list`}
      >
        <option value="">{placeholder} — choose from the list…</option>
        {groups.map((g) => (
          <optgroup key={g.category} label={g.category}>
            {g.items.map((c) => (
              <option key={c.id} value={c.comment}>
                {c.comment}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="…or type your own remark"
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
