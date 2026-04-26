import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { playButtonSfx } from "@/lib/sfx";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-xl border border-cyan-200/35 text-primary-foreground font-semibold btn-cta active:scale-[0.98] active:opacity-90",
        destructive: "rounded-lg bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "rounded-lg border-2 border-blue-500/30 dark:border-blue-400/35 light:border-blue-300/35 bg-card/10 backdrop-blur-sm text-foreground shadow-sm hover:border-blue-400/45 hover:bg-blue-500/12 light:hover:border-blue-500/40 light:hover:bg-blue-500/10",
        secondary:
          "rounded-lg border border-blue-500/30 dark:border-blue-400/30 light:border-blue-200/30 bg-secondary text-secondary-foreground shadow-sm hover:bg-blue-500/12 light:hover:bg-blue-100/20",
        ghost: "rounded-lg hover:bg-accent/15 hover:text-accent-foreground",
        link: "text-blue-400 light:text-blue-800 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      if (!props.disabled && !e.defaultPrevented && props["data-sfx"] !== "off") {
        playButtonSfx();
      }
      onClick?.(e);
    };
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} onClick={handleClick} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
