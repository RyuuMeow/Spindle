"use client";
import { t as tr } from "../i18n/index.ts";

import { useState, type ReactNode } from "react";
import { restoreControlFocus } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
export type MenuAction = {
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
} | null;
export type MenuState = {
  x: number;
  y: number;
  actions: MenuAction[];
  origin?: HTMLElement;
  parent?: "project";
};
export default function ActionMenu({
  menu,
  onClose,
}: {
  menu: MenuState | null;
  onClose: () => void;
}) {
  // Radix retains the closing content for its exit animation. Preserve its
  // anchor, items and focus origin until a new menu replaces them.
  const [retained, setRetained] = useState(menu);
  if (menu && menu !== retained) setRetained(menu);
  const displayed = menu ?? retained;
  return (
    <DropdownMenu
      open={!!menu}
      modal={displayed?.parent !== "project"}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger
        tabIndex={-1}
        aria-label={tr("maceafaa89e66")}
        className="context-menu-anchor"
        style={{ left: displayed?.x || 0, top: displayed?.y || 0 }}
      />
      <DropdownMenuContent
        className="desktop-menu"
        side="bottom"
        align="start"
        onFocusOutside={(event) => {
          if (displayed?.parent === "project") event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreControlFocus(displayed?.origin);
        }}
      >
        {displayed?.actions.map((action, index) =>
          action ? (
            <DropdownMenuItem
              key={index}
              disabled={action.disabled}
              className={action.danger ? "menu-danger" : ""}
              onSelect={action.run}
            >
              <span className="action-menu-icon" aria-hidden="true">
                {action.icon}
              </span>
              {action.label}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSeparator key={index} />
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
