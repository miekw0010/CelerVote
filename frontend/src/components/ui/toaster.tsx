import React, { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Toast, ToastClose, ToastDescription,
  ToastProvider, ToastTitle, ToastViewport,
} from "@/components/ui/toast";

// Auto-detect variant from title/description content
function detectVariant(title?: React.ReactNode, description?: React.ReactNode): string {
  const text = `${title || ""} ${description || ""}`.toLowerCase();

  if (
    text.includes("error") || text.includes("failed") || text.includes("invalid") ||
    text.includes("wrong") || text.includes("denied") || text.includes("blocked") ||
    text.includes("already voted") || text.includes("not found")
  ) return "destructive";

  if (
    text.includes("success") || text.includes("welcome") || text.includes("confirmed") ||
    text.includes("verified") || text.includes("sent") || text.includes("recorded") ||
    text.includes("signed in") || text.includes("logged") || text.includes("created") ||
    text.includes("saved") || text.includes("updated") || text.includes("🎉") ||
    text.includes("✓") || text.includes("📧")
  ) return "success";

  if (
    text.includes("warning") || text.includes("caution") || text.includes("expire") ||
    text.includes("limit") || text.includes("reminder")
  ) return "warning";

  if (
    text.includes("info") || text.includes("note") || text.includes("tip")
  ) return "info";

  return "default";
}

// Progress bar that counts down the toast duration
function ToastProgressBar({ duration = 5000, variant }: { duration?: number; variant: string }) {
  const [width, setWidth] = useState(100);
  const startTime = useRef(Date.now());
  const rafRef    = useRef<number>();

  const colorMap: Record<string, string> = {
    default:     "bg-muted-foreground/30",
    destructive: "bg-destructive/60",
    success:     "bg-secondary/60",
    warning:     "bg-yellow-500/60",
    info:        "bg-blue-500/60",
  };

  useEffect(() => {
    const tick = () => {
      const elapsed  = Date.now() - startTime.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setWidth(remaining);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [duration]);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/50 rounded-b-2xl overflow-hidden">
      <div
        className={`h-full transition-none ${colorMap[variant] || colorMap.default}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={5000}>
      {toasts.map(({ id, title, description, action, variant, ...props }) => {
        const resolvedVariant = variant || detectVariant(title, description);

        return (
          <Toast key={id} variant={resolvedVariant as any} {...props}>
            <div className="grid gap-0.5 pr-6">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
            <ToastProgressBar variant={resolvedVariant} duration={5000} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
