import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

// Built on Radix's own AlertDialog (not a hand-rolled overlay div) so it
// correctly stacks when opened from inside another open Dialog — Radix
// tracks its own nested dismissible layers, which a plain fixed-position
// div can't participate in. That mismatch was what made the confirm
// dialog visually appear but not be clickable until the underlying
// Dialog's overlay was interacted with first.
export function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel",
  variant = "danger", onConfirm, onCancel,
}: ConfirmDialogProps) {
  const colors = {
    danger:  { icon: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", btn: "bg-destructive hover:bg-destructive/90 text-white" },
    warning: { icon: "text-yellow-500",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20",  btn: "bg-yellow-500 hover:bg-yellow-600 text-white" },
    info:    { icon: "text-secondary",   bg: "bg-secondary/10",   border: "border-secondary/20",   btn: "bg-secondary hover:bg-secondary/90 text-secondary-foreground" },
  }[variant];

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className={`w-12 h-12 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center mx-auto mb-2`}>
            <AlertTriangle className={`w-6 h-6 ${colors.icon}`} />
          </div>
          <AlertDialogTitle className="text-center">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-center leading-relaxed">{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center gap-3">
          <AlertDialogCancel onClick={onCancel} className="flex-1">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={`flex-1 ${colors.btn}`}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Hook for imperative usage — useConfirm().ask("Delete?", "...") returns Promise<boolean>
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean; title: string; message: string;
    confirmLabel: string; variant: "danger" | "warning" | "info";
    resolve: (v: boolean) => void;
  }>({ open: false, title: "", message: "", confirmLabel: "Confirm", variant: "danger", resolve: () => {} });

  const ask = (
    title: string,
    message: string,
    confirmLabel = "Delete",
    variant: "danger" | "warning" | "info" = "danger"
  ): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ open: true, title, message, confirmLabel, variant, resolve });
    });
  };

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      variant={state.variant}
      onConfirm={() => { setState(s => ({ ...s, open: false })); state.resolve(true); }}
      onCancel={() => { setState(s => ({ ...s, open: false })); state.resolve(false); }}
    />
  );

  return { ask, dialog };
}
