import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-[380px] p-0",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  [
    "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden",
    "rounded-2xl border p-4 shadow-2xl",
    "transition-all duration-300",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full",
    "data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
    "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
  ].join(" "),
  {
    variants: {
      variant: {
        default:     "bg-card border-border text-foreground",
        destructive: "bg-card border-destructive/30 text-foreground",
        success:     "bg-card border-secondary/30 text-foreground",
        warning:     "bg-card border-yellow-500/30 text-foreground",
        info:        "bg-card border-blue-500/30 text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

// Icon map per variant
const toastIcons: Record<string, React.ReactNode> = {
  default:     <Info       className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />,
  destructive: <AlertCircle   className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />,
  success:     <CheckCircle2  className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" />,
  warning:     <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />,
  info:        <Info          className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />,
};

// Accent bar per variant
const toastAccent: Record<string, string> = {
  default:     "bg-muted-foreground/40",
  destructive: "bg-destructive",
  success:     "bg-secondary",
  warning:     "bg-yellow-500",
  info:        "bg-blue-500",
};

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants> & { showIcon?: boolean }
>(({ className, variant = "default", showIcon = true, children, ...props }, ref) => {
  const v = variant || "default";
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl", toastAccent[v])} />

      {/* Icon */}
      {showIcon && (
        <div className="ml-2 flex-shrink-0">
          {toastIcons[v]}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </ToastPrimitives.Root>
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-7 shrink-0 items-center justify-center rounded-lg border bg-transparent px-3 text-xs font-medium",
      "transition-colors hover:bg-secondary/10 hover:text-secondary hover:border-secondary/30",
      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-lg p-1",
      "text-muted-foreground/50 hover:text-foreground",
      "opacity-0 group-hover:opacity-100 transition-opacity",
      "focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold leading-tight", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-xs text-muted-foreground mt-0.5 leading-relaxed", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
  toastIcons,
  toastAccent,
};
