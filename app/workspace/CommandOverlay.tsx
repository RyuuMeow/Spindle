"use client";
import { useRef, type ComponentProps } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings2, X } from "lucide-react";
import { ChromeButton } from "@/components/ChromeButton";
import CommandManager from "../CommandManager";
import "./overlays.css";

export function CommandOverlay({
  open,
  onClose,
  restoreFocus,
  ...props
}: ComponentProps<typeof CommandManager> & {
  open: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const composing = useRef(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        className="command-overlay"
        showCloseButton={false}
        data-workspace-overlay="commands"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onEscapeKeyDown={(event) => {
          if (composing.current || event.isComposing || event.keyCode === 229)
            event.preventDefault();
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="command-overlay-heading">
          <Settings2 size={19} aria-hidden="true" />
          <div>
            <DialogTitle ref={title} tabIndex={-1}>
              自訂指令
            </DialogTitle>
            <DialogDescription>{props.projectName}</DialogDescription>
          </div>
          <ChromeButton title="關閉自訂指令" onClick={onClose}>
            <X size={18} />
          </ChromeButton>
        </div>
        <CommandManager {...props} />
      </DialogContent>
    </Dialog>
  );
}
