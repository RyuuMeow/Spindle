"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./compact-select.css";

export function CompactSelect({
  value,
  onChange,
  label,
  options,
  id,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={label}
        className="compact-select"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className="compact-select-menu"
        position="popper"
        align="start"
        sideOffset={3}
      >
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
