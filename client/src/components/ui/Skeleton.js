import React from 'react';
import { cn } from '../../utils/cn';

const Skeleton = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("animate-pulse rounded-md bg-neutral-100", className)}
    {...props}
  />
));

Skeleton.displayName = "Skeleton";

const SkeletonCard = () => (
  <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-neutral-200/50 shadow-soft p-6 space-y-4">
    <Skeleton className="h-6 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-20 w-full" />
    <div className="flex space-x-2">
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
    </div>
  </div>
);

const SkeletonTable = ({ rows = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex space-x-4 p-4 bg-white/50 rounded-xl">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
);

export { Skeleton, SkeletonCard, SkeletonTable };
