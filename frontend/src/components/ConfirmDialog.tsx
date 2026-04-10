import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
          <motion.div
            className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-10"
            initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className="p-6">
              <div className={`w-12 h-12 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center mx-auto mb-4`}>
                <AlertTriangle className={`w-6 h-6 ${colors.icon}`} />
              </div>
              <h3 className="text-base font-bold text-center mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">{message}</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" className="flex-1" onClick={onCancel}>{cancelLabel}</Button>
              <button
                onClick={onConfirm}
                className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-all ${colors.btn}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
