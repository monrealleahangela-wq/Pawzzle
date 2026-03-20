import React from 'react';
import { cn } from '../../utils/cn';

const Badge = React.forwardRef(({ className, variant = "default", children, ...props }, ref) => {
  const variants = {
    default: "bg-neutral-100 text-neutral-900 border-neutral-200",
    primary: "bg-primary-100 text-primary-900 border-primary-200",
    secondary: "bg-secondary-100 text-secondary-900 border-secondary-200",
    accent: "bg-accent-100 text-accent-900 border-accent-200",
    success: "bg-success text-white border-success-200",
    warning: "bg-warning text-white border-warning-200",
    error: "bg-error text-white border-error-200",
    gradient: "bg-hero-gradient text-white border-transparent",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Badge.displayName = "Badge";

export { Badge };
