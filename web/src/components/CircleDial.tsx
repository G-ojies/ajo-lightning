// The signature of the app: every member is a place on the ring, and the ring fills as they pay.
export type SeatState = 'paid' | 'owed' | 'late';
export interface Seat { key: string; name: string; state: SeatState; collects: boolean }

const C = 200;
const R = 132;
const point = (angle: number, r: number) => [C + r * Math.cos(angle), C + r * Math.sin(angle)];

function arc(from: number, to: number) {
  const [x1, y1] = point(from, R);
  const [x2, y2] = point(to, R);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function CircleDial({ seats, label, children, tone }: {
  seats: Seat[];
  label: string;
  children: React.ReactNode;
  tone?: 'indigo';
}) {
  const step = (2 * Math.PI) / seats.length;
  const gap = Math.min(0.09, step / 6);
  return (
    <div className={`dial${tone ? ` dial-${tone}` : ''}`}>
      <svg viewBox="-34 0 468 400" role="img" aria-label={label}>
        {seats.map((s, i) => {
          const mid = -Math.PI / 2 + i * step;
          const [x, y] = point(mid, R);
          const [lx, ly] = point(mid, R + 40);
          const anchor = Math.abs(lx - C) < 12 ? 'middle' : lx > C ? 'start' : 'end';
          return (
            <g key={s.key} className={`seat ${s.state}${s.collects ? ' collects' : ''}`}>
              <path className="seg" d={arc(mid - step / 2 + gap, mid + step / 2 - gap)} />
              <circle className="node" cx={x} cy={y} r={seats.length > 8 ? 15 : 20} />
              <text className="initial" x={x} y={y} dy="0.36em" textAnchor="middle">{s.name.slice(0, 1).toUpperCase()}</text>
              <text className="name" x={lx} y={ly} dy="0.36em" textAnchor={anchor}>{s.name.length > 11 ? `${s.name.slice(0, 10)}…` : s.name}</text>
            </g>
          );
        })}
      </svg>
      <div className="dial-center">{children}</div>
    </div>
  );
}
