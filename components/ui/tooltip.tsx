"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

const restoredFocus = new WeakSet<HTMLElement>();

/** Returning from a menu is focus restoration, not a new tooltip request. */
function restoreControlFocus(element: HTMLElement | null | undefined) {
  if (!element) return;
  restoredFocus.add(element);
  try {
    element.focus({ preventScroll: true });
  } finally {
    restoredFocus.delete(element);
  }
}

function TooltipProvider({
  delayDuration = 400,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-[60] w-fit max-w-72 origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-balance text-popover-foreground shadow-md fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

function ControlTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          asChild
          onFocus={(event) => {
            // Menus restore focus to their trigger after a pointer selection.
            // That is not a new request for a persistent keyboard tooltip.
            if (
              restoredFocus.has(event.currentTarget) ||
              !event.currentTarget.matches(":focus-visible")
            )
              event.preventDefault();
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          collisionPadding={{ top: 48, right: 8, bottom: 8, left: 8 }}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ControlTooltip,
  restoreControlFocus,
};
