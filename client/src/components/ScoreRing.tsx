import { useEffect, useState } from 'react';
import { scoreColor } from '@/lib/score.ts';

const SIZE = 132;
const STROKE = 11;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Circular gauge from 0 to 100 that fills up when it appears. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(frame);
  }, [score]);

  // One solid color for the ring and the number, depending on the grade.
  const color = scoreColor(score);

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" role="img" aria-label={`${label}: ${score}/100`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - shown / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out print:transition-none"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-4xl font-semibold tracking-tight tabular-nums" style={{ color }}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
