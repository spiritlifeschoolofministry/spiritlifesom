import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
        warning: "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))]",
        gold: "border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]",
        info: "border-[hsl(var(--info)/0.3)] bg-[hsl(var(--info)/0.12)] text-[hsl(var(--info))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
