import React from 'react';
import { cn } from '../../utils';

const ChartContainer = ({ className, ...props }) => (
  <div className={cn("relative", className)} {...props} />
);

const ChartTooltip = ({ active, payload, label, className }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className={cn(
      "bg-white/95 backdrop-blur-sm border border-neutral-200/50 rounded-lg p-3 shadow-medium",
      className
    )}>
      <p className="text-sm font-medium text-neutral-900 mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-neutral-600">{entry.name}:</span>
          <span className="font-medium text-neutral-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// Simple Bar Chart Component
const BarChart = ({ data, className, height = 300 }) => {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(item => item.value));
  const barWidth = 100 / data.length;

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <div className="relative h-full flex items-end justify-between gap-2">
        {data.map((item, index) => (
          <div
            key={index}
            className="flex-1 flex flex-col items-center justify-end"
            style={{ height: '100%' }}
          >
            <div className="relative w-full flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-primary-500 to-primary-400 rounded-t-lg hover:from-primary-600 hover:to-primary-500 transition-all duration-200 group cursor-pointer"
                style={{
                  height: `${(item.value / maxValue) * 100}%`,
                  minHeight: '4px'
                }}
              >
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-neutral-900 text-white text-xs rounded px-2 py-1 absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                  {item.value}
                </div>
              </div>
              <div className="text-xs text-neutral-600 mt-2 text-center truncate w-full">
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple Line Chart Component
const LineChart = ({ data, className, height = 300 }) => {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(item => item.value));
  const points = data.map((item, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - (item.value / maxValue) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((value) => (
          <line
            key={value}
            x1="0"
            y1={value}
            x2="100"
            y2={value}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-neutral-200"
          />
        ))}

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="url(#gradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Area under line */}
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="url(#gradient)"
          opacity="0.1"
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8B4513" />
            <stop offset="100%" stopColor="#BFA6A0" />
          </linearGradient>
        </defs>

        {/* Data points */}
        {data.map((item, index) => {
          const x = (index / (data.length - 1)) * 100;
          const y = 100 - (item.value / maxValue) * 100;
          return (
            <g key={index}>
              <circle
                cx={x}
                cy={y}
                r="3"
                fill="white"
                stroke="#8B4513"
                strokeWidth="2"
                className="hover:r-4 transition-all duration-200 cursor-pointer"
              />
              <text
                x={x}
                y={y - 5}
                textAnchor="middle"
                className="text-xs fill-neutral-600"
                fontSize="3"
              >
                {item.value}
              </text>
              <text
                x={x}
                y={105}
                textAnchor="middle"
                className="text-xs fill-neutral-600"
                fontSize="3"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// Simple Pie Chart Component
const PieChart = ({ data, className, size = 200 }) => {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;

  const colors = [
    '#8B4513', '#BFA6A0', '#2E2D2D', '#797878', '#454545', '#8B4513'
  ];

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg className="w-full h-full" viewBox="0 0 100 100">
        {data.map((item, index) => {
          const percentage = item.value / total;
          const angle = percentage * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;

          const startRad = (startAngle * Math.PI) / 180;
          const endRad = (endAngle * Math.PI) / 180;

          const x1 = 50 + 40 * Math.cos(startRad);
          const y1 = 50 + 40 * Math.sin(startRad);
          const x2 = 50 + 40 * Math.cos(endRad);
          const y2 = 50 + 40 * Math.sin(endRad);

          const largeArcFlag = angle > 180 ? 1 : 0;

          const pathData = [
            `M 50 50`,
            `L ${x1} ${y1}`,
            `A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');

          currentAngle += angle;

          return (
            <g key={index}>
              <path
                d={pathData}
                fill={colors[index % colors.length]}
                stroke="white"
                strokeWidth="1"
                className="hover:opacity-80 transition-opacity cursor-pointer"
              />
              <text
                x={50 + 25 * Math.cos((startRad + endRad) / 2)}
                y={50 + 25 * Math.sin((startRad + endRad) / 2)}
                textAnchor="middle"
                className="text-xs fill-white font-medium"
                fontSize="4"
              >
                {`${Math.round(percentage * 100)}%`}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute -bottom-6 left-0 right-0 flex flex-wrap justify-center gap-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-1 text-xs">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="text-neutral-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export { ChartContainer, ChartTooltip, BarChart, LineChart, PieChart };
