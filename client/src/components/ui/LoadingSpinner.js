import React from 'react';

export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  return (
    <div className={`animate-spin ${sizes[size]} ${className}`}>
      <svg
        className="h-full w-full"
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
    </div>
  );
};

export const PageLoader = ({ message = 'Loading...' }) => (
  <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-primary-50/30 flex items-center justify-center">
    <div className="text-center space-y-6">
      <div className="relative">
        <div className="w-20 h-20 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-2xl animate-pulse-slow shadow-glow">
          <div className="w-full h-full flex items-center justify-center">
            <LoadingSpinner size="lg" className="text-white" />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-2xl animate-ping opacity-20"></div>
      </div>
      <div className="space-y-2">
        <p className="text-lg font-medium text-neutral-700 animate-fade-in">{message}</p>
        <div className="flex justify-center space-x-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-primary-500 rounded-full animate-bounce-soft"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const CardLoader = () => (
  <div className="animate-fade-in">
    <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-soft border border-neutral-200/50">
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-r from-primary-400 to-secondary-400 rounded-xl animate-pulse-slow shadow-soft"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-neutral-200 rounded-lg animate-pulse"></div>
            <div className="h-3 bg-neutral-200 rounded-lg w-3/4 animate-pulse"></div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-neutral-200 rounded-lg animate-pulse"></div>
          <div className="h-3 bg-neutral-200 rounded-lg w-5/6 animate-pulse"></div>
        </div>
      </div>
    </div>
  </div>
);

export const TableLoader = ({ rows = 5 }) => (
  <div className="space-y-3 animate-fade-in">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center space-x-4 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-neutral-200/50">
        <div className="w-10 h-10 bg-gradient-to-r from-primary-400 to-secondary-400 rounded-full animate-pulse-slow"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-neutral-200 rounded-lg animate-pulse"></div>
          <div className="h-3 bg-neutral-200 rounded-lg w-2/3 animate-pulse"></div>
        </div>
        <div className="h-8 w-20 bg-neutral-200 rounded-lg animate-pulse"></div>
      </div>
    ))}
  </div>
);

export const ButtonLoader = () => (
  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);
