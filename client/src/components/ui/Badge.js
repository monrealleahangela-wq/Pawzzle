import React from 'react';
import { cn } from '../../utils/cn';

const Badge = React.forwardRef(({ className, variant = "default", children, ...props }, ref) => {
  const variants = {
    default: "bg-neutral-100 text-default border-neutral-200",
    primary: "bg-primary-100 text-primary-900 border-primary-200",
    secondary: "bg-neutral-100 text-secondary border-neutral-200",
    accent: "bg-primary-50 text-primary-800 border-primary-200",
    success: "bg-success-50 text-success-700 border-success-200",
    warning: "bg-warning-50 text-warning-700 border-warning-200",
    error: "bg-error-50 text-error-700 border-error-200",
    gradient: "bg-primary-600 text-white border-primary-700",
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
