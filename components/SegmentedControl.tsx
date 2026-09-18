"use client";
import type { ReactNode } from "react";

/** A single value, with one keyboard stop and arrow-key selection. */
export function SegmentedControl({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="segmented-control" role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
              ? 1
              : ["ArrowLeft", "ArrowUp"].includes(event.key)
                ? -1
                : 0;
            if (!delta && !["Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index + delta + options.length) % options.length;
            onChange(options[next].value);
            (
              event.currentTarget.parentElement?.children[
                next
              ] as HTMLButtonElement
            )?.focus();
          }}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
