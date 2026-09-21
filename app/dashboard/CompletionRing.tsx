'use client';

import { useDailyTasks } from './TaskList';

// Reads the percentage from the shared tasks state, so it moves as soon as a task is
// checked or unchecked. Same look as before (it used to be a fixed 0%), plus a short
// animation when the value changes.
export function CompletionRing() {
  const { percent } = useDailyTasks();

  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${percent}% del día completado`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-brass/20" />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="stroke-brass transition-[stroke-dashoffset] duration-500"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-3xl font-semibold text-brass">{percent}%</span>
        <span className="mt-1 font-mono text-[10px] tracking-[0.25em] text-mist">HOY</span>
      </div>
    </div>
  );
}
