import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' }
];

const SuperAdminDateRangeFilter = ({
  ariaLabel,
  value = '',
  onChange,
  className = '',
  iconClassName = 'text-blue-500',
  focusClassName = 'focus-within:ring-primary-500/50'
}) => {
  const selectedLabel = DATE_RANGE_OPTIONS.find(option => option.value === value)?.label || 'All time';

  return (
    <div className={`relative h-12 rounded-2xl bg-slate-800 transition-all focus-within:ring-2 ${focusClassName} ${className}`}>
      <Calendar
        aria-hidden="true"
        className={`pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${iconClassName}`}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-14 right-10 flex items-center whitespace-nowrap text-xs font-extrabold uppercase leading-none tracking-[0.14em] text-white"
      >
        {selectedLabel}
      </span>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-2xl border-0 opacity-0"
      >
        {DATE_RANGE_OPTIONS.map(option => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SuperAdminDateRangeFilter;
