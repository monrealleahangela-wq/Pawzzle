import React from 'react';
import { cn } from '../../utils';

const Button = React.forwardRef(({ 
  className, 
  variant = "primary", 
  size = "default", 
  loading = false,
  children, 
  ...props 
}, ref) => {
  const baseClasses = "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  
  const variants = {
    primary: "bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 shadow-soft hover:shadow-medium hover:-translate-y-0.5",
    secondary: "bg-secondary-600 text-white hover:bg-secondary-700 focus-visible:ring-secondary-500 shadow-soft hover:shadow-medium hover:-translate-y-0.5",
    accent: "bg-accent-600 text-white hover:bg-accent-700 focus-visible:ring-accent-500 shadow-soft hover:shadow-medium hover:-translate-y-0.5",
    outline: "border border-neutral-300 bg-white hover:bg-neutral-50 focus-visible:ring-neutral-500 hover:border-neutral-400",
    ghost: "hover:bg-neutral-100 focus-visible:ring-neutral-500",
    destructive: "bg-error text-white hover:bg-error-700 focus-visible:ring-error shadow-soft hover:shadow-medium hover:-translate-y-0.5",
    gradient: "bg-hero-gradient text-white hover:shadow-glow focus-visible:ring-primary-500 shadow-medium hover:shadow-strong hover:-translate-y-0.5",
  };
  
  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-lg px-3 text-sm",
    lg: "h-12 px-8 text-lg",
    xl: "h-14 px-10 text-xl",
    icon: "h-10 w-10",
  };

  return (
    <button
      className={cn(
        baseClasses,
        variants[variant],
        sizes[size],
        loading && "cursor-not-allowed",
        className
      )}
      ref={ref}
      disabled={loading}
      {...props}
    >
      {loading && (
        <svg 
          className="animate-spin -ml-1 mr-3 h-4 w-4" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
});

Button.displayName = "Button";

export { Button };
