import React from 'react';
import { cn } from '../../utils';

const Input = React.forwardRef(({ 
  className, 
  type = 'text', 
  error = false, 
  label, 
  helperText, 
  required = false,
  ...props 
}, ref) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-error-500 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-neutral-300 bg-white/80 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 hover:border-neutral-400",
          error && "border-error-500 focus-visible:ring-error-500 hover:border-error-600",
          className
        )}
        ref={ref}
        {...props}
      />
      {helperText && (
        <p className={cn(
          "text-xs",
          error ? "text-error-600" : "text-neutral-500"
        )}>
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = "Input";

const Textarea = React.forwardRef(({ 
  className, 
  error = false, 
  label, 
  helperText, 
  required = false,
  ...props 
}, ref) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-error-500 ml-1">*</span>}
        </label>
      )}
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-neutral-300 bg-white/80 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 hover:border-neutral-400 resize-none",
          error && "border-error-500 focus-visible:ring-error-500 hover:border-error-600",
          className
        )}
        ref={ref}
        {...props}
      />
      {helperText && (
        <p className={cn(
          "text-xs",
          error ? "text-error-600" : "text-neutral-500"
        )}>
          {helperText}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = "Textarea";

const Select = React.forwardRef(({ 
  className, 
  error = false, 
  label, 
  helperText, 
  required = false,
  children,
  ...props 
}, ref) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-error-500 ml-1">*</span>}
        </label>
      )}
      <select
        className={cn(
          "flex h-10 w-full rounded-xl border border-neutral-300 bg-white/80 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 hover:border-neutral-400 cursor-pointer",
          error && "border-error-500 focus-visible:ring-error-500 hover:border-error-600",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      {helperText && (
        <p className={cn(
          "text-xs",
          error ? "text-error-600" : "text-neutral-500"
        )}>
          {helperText}
        </p>
      )}
    </div>
  );
});

Select.displayName = "Select";

const Checkbox = React.forwardRef(({ 
  className, 
  error = false, 
  label, 
  helperText, 
  required = false,
  ...props 
}, ref) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          className={cn(
            "h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 transition-all duration-200",
            error && "border-error-500 focus:ring-error-500",
            className
          )}
          ref={ref}
          {...props}
        />
        {label && (
          <label className="text-sm font-medium text-neutral-700 cursor-pointer">
            {label}
            {required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
      </div>
      {helperText && (
        <p className={cn(
          "text-xs ml-6",
          error ? "text-error-600" : "text-neutral-500"
        )}>
          {helperText}
        </p>
      )}
    </div>
  );
});

Checkbox.displayName = "Checkbox";

const FormField = ({ children, error, className }) => (
  <div className={cn("space-y-2", className)}>
    {children}
    {error && (
      <p className="text-xs text-error-600 flex items-center gap-1">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {error}
      </p>
    )}
  </div>
);

export { Input, Textarea, Select, Checkbox, FormField };
