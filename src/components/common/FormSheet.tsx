import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fenster für Eingaben (Namen, Code …) – oben verankert statt als Blatt
 * von unten. Auf dem iPhone schiebt die Tastatur ein unteres Blatt sonst
 * aus dem Bild; ein oberes Fenster bleibt einfach stehen.
 */
export const FormSheet = DialogPrimitive.Root;

export function FormSheetContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 top-0 z-50 mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-b-3xl border-b border-border bg-background px-4 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)] shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top md:top-6 md:rounded-3xl md:border",
          className,
        )}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Schließen"
          className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:top-3"
        >
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const FormSheetTitle = (p: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title {...p} />
);
export const FormSheetDescription = (
  p: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>,
) => <DialogPrimitive.Description {...p} />;
