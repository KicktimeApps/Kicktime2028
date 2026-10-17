import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster group"
    position="top-center"
    duration={2600}
    gap={8}
    offset={16}
    toastOptions={{
      classNames: {
        toast:
          "group toast pointer-events-auto !bg-elevated !text-foreground !border !border-border !shadow-xl !rounded-2xl !px-4 !py-3 !text-[13.5px] !font-medium",
        title: "!text-[13.5px] !font-semibold",
        description: "!text-[12.5px] !text-muted-foreground",
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
