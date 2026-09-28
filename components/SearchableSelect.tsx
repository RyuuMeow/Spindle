"use client";
import { useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import "./compact-select.css";
import "./searchable-select.css";

/** Compact select with a focused filter, rather than type-to-jump navigation. */
export function SearchableSelect({
  id,
  value,
  onChange,
  label,
  options,
  disabled,
  searchLabel,
  emptyLabel,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string; description?: string }[];
  disabled?: boolean;
  searchLabel: string;
  emptyLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const selected = options.find((option) => option.value === value);
  return (
    <Popover.Root
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          className="compact-select searchable-select"
          data-slot="select-trigger"
          aria-label={label}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span>{selected?.label ?? (value || placeholder)}</span>
          <ChevronDown aria-hidden="true" size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="compact-select-menu searchable-select-menu"
          data-slot="select-content"
          align="start"
          sideOffset={3}
          aria-label={label}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (composing.current) event.preventDefault();
          }}
        >
          <Command
            label={label}
            loop
            filter={(text, search, keywords) =>
              [text, ...(keywords ?? [])].some((part) =>
                part
                  .toLocaleLowerCase()
                  .includes(search.trim().toLocaleLowerCase()),
              )
                ? 1
                : 0
            }
            onKeyDownCapture={(event) => {
              if (
                composing.current ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229
              ) {
                // An IME confirmation must never select a scene or close the picker.
                event.stopPropagation();
              }
            }}
          >
            <div className="searchable-select-filter">
              <Search size={14} aria-hidden="true" />
              <Command.Input
                ref={input}
                value={query}
                onValueChange={setQuery}
                placeholder={searchLabel}
                aria-label={searchLabel}
                autoComplete="off"
                spellCheck={false}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
              />
            </div>
            <Command.List>
              <Command.Empty>{emptyLabel}</Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, option.description ?? ""]}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="searchable-select-copy">
                    <span>{option.label}</span>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {option.value === value && (
                    <Check size={14} aria-hidden="true" />
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
