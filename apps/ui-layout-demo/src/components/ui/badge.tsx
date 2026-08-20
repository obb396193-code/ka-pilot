import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:
          "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted-foreground)]",
        success:
          "border-[color:var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
        warning:
          "border-[color:var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]",
        danger:
          "border-[color:var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]",
        info: "border-[color:var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge };
