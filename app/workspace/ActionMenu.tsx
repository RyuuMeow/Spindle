"use client";
import { t as tr } from "../i18n/index.ts";

import type { ReactNode } from "react";
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
  return (
    <DropdownMenu
      open={!!menu}
      modal={menu?.parent !== "project"}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger
        tabIndex={-1}
        aria-label={tr("maceafaa89e66")}
        className="context-menu-anchor"
        style={{ left: menu?.x || 0, top: menu?.y || 0 }}
      />
      <DropdownMenuContent
        className="desktop-menu"
        side="bottom"
        align="start"
        onFocusOutside={(event) => {
          if (menu?.parent === "project") event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          menu?.origin?.focus();
        }}
      >
        {menu?.actions.map((action, index) =>
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
