import React from 'react';
import { ChevronDown } from 'lucide-react';

const SuperAdminSelectFilter = ({
  ariaLabel,
  value = '',
  onChange,
  options = [],
  Icon,
  className = '',
  iconClassName = 'text-primary-500',
  focusClassName = 'focus-within:ring-primary-500/50'
}) => {
  const selectedOption = options.find(option => option.value === value) || options[0];

  return (
    <div className={`relative h-12 min-w-0 overflow-hidden rounded-2xl bg-slate-800 transition-all focus-within:ring-2 ${focusClassName} ${className}`}>
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={`pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${iconClassName}`}
        />
      ) : null}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-14 right-10 flex min-w-0 items-center overflow-hidden whitespace-nowrap font-sans text-xs font-extrabold uppercase leading-normal tracking-[0.1em] text-white"
      >
        {selectedOption?.label || ''}
      </span>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="absolute inset-0 z-10 h-full min-h-0 max-h-none w-full cursor-pointer appearance-none border-0 bg-transparent opacity-0"
      >
        {options.map(option => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SuperAdminSelectFilter;
