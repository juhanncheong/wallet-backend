import * as React from "react";
import { createPortal } from "react-dom";

const DialogContext = React.createContext(null);

function useDialog() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("Dialog components must be used inside <Dialog />");
  return ctx;
}

export function Dialog({ open, onOpenChange, children }) {
  const value = React.useMemo(
    () => ({
      open: !!open,
      onOpenChange: typeof onOpenChange === "function" ? onOpenChange : () => {},
    }),
    [open, onOpenChange]
  );

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export const DialogContent = React.forwardRef(function DialogContent(
  { className = "", children, ...props },
  ref
) {
  const { open, onOpenChange } = useDialog();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onMouseDown={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        ref={ref}
        data-state={open ? "open" : "closed"}
        className={
          "relative z-50 w-full bg-white shadow-2xl outline-none " +
          "max-h-[85vh] overflow-hidden rounded-3xl border border-slate-200 " +
          className
        }
        onMouseDown={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  );
});

export function DialogHeader({ className = "", ...props }) {
  return <div className={"flex flex-col gap-1 " + className} {...props} />;
}

export function DialogTitle({ className = "", children = "Dialog", ...props }) {
  return (
    <h2 className={"text-lg font-semibold leading-none " + className} {...props}>
      {children}
    </h2>
  );
}

export function DialogDescription({ className = "", ...props }) {
  return <p className={"text-sm text-slate-600 " + className} {...props} />;
}

export function DialogClose({ asChild = false, children, ...props }) {
  const { onOpenChange } = useDialog();

  const handleClick = (e) => {
    props.onClick?.(e);
    onOpenChange(false);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      onClick: handleClick,
    });
  }

  return (
    <button type="button" {...props} onClick={handleClick}>
      {children || "Close"}
    </button>
  );
}
