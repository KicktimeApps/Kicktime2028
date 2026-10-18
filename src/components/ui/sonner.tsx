import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster group"
    // Unten statt oben: oben liegen auf dem iPhone Statusleiste und Notch.
    // Auf dem Handy über der Navigationsleiste.
    position="bottom-center"
    duration={3200}
    gap={8}
    offset={{ bottom: 24 }}
    mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)", left: 16, right: 16 }}
    toastOptions={{
      classNames: {
        toast:
          "group toast pointer-events-auto !bg-elevated !text-foreground !border !border-border !shadow-xl !rounded-2xl !px-4 !py-3 !text-[15px] !font-medium",
        title: "!text-[15px] !font-semibold",
        description: "!text-[13.5px] !text-muted-foreground",
        success: "[&_[data-icon]]:!text-primary",
        error: "[&_[data-icon]]:!text-destructive",
        actionButton: "!bg-primary !text-primary-foreground",
        cancelButton: "!bg-muted !text-muted-foreground",
      },
    }}
    {...props}
  />
);

export { Toaster };
