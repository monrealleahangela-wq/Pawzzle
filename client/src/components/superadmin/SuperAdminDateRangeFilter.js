import React from 'react';
import { Calendar } from 'lucide-react';
import SuperAdminSelectFilter from './SuperAdminSelectFilter';

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
  return (
    <SuperAdminSelectFilter
      ariaLabel={ariaLabel}
      value={value}
      onChange={value => onChange({ target: { value } })}
      options={DATE_RANGE_OPTIONS}
      Icon={Calendar}
      className={className}
      iconClassName={iconClassName}
      focusClassName={focusClassName}
    />
  );
};

export default SuperAdminDateRangeFilter;
