'use client';

import React from 'react';

interface IconTooltipProps {
  tip: string;
  position?: 'top' | 'bottom';
  align?: 'center' | 'left' | 'right';
  children: React.ReactNode;
}

export function IconTooltip({
  tip,
  position = 'top',
  align = 'center',
  children,
}: IconTooltipProps) {
  const posClass =
    position === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5';
  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${posClass} ${alignClass} z-50 px-2 py-1 rounded-md bg-[#090B0F] border border-white/15 text-[10px] font-medium text-zinc-100 whitespace-nowrap shadow-xl opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 group-focus-within/tip:opacity-100 group-focus-within/tip:scale-100 transition-all duration-150 select-none`}
      >
        {tip}
      </span>
    </span>
  );
}
