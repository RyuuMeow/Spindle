"use client";

import type { ComponentPropsWithRef } from "react";
import { ControlTooltip } from "@/components/ui/tooltip";

/** Window and panel tools share the same hover/keyboard description. */
export function ChromeButton({
  title,
  ...props
}: ComponentPropsWithRef<"button"> & { title: string }) {
  return (
    <ControlTooltip label={title}>
      <button
        type="button"
        {...props}
        aria-label={props["aria-label"] || title}
      />
    </ControlTooltip>
  );
}
