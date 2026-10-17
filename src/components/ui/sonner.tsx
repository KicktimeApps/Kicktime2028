import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      duration={2800}
      gap={8}
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "group toast pointer-events-auto !bg-card/95 !text-foreground !border !border-border/60 !backdrop-blur-md !shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] !rounded-xl !px-4 !py-3 !text-[13px] !font-medium",
          title: "!text-[13px] !font-medium !tracking-tight",
          description: "!text-[11px] !text-muted-foreground !font-normal",
          success:
            "!border-l-4 !border-l-primary",
          error:
            "!border-l-4 !border-l-destructive",
          warning:
            "!border-l-4 !border-l-destructive",
          info:
            "!border-l-4 !border-l-accent",
          icon: "!text-primary",
          actionButton: "!bg-primary !text-primary-foreground !text-[11px]",
          cancelButton: "!bg-muted !text-muted-foreground !text-[11px]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
