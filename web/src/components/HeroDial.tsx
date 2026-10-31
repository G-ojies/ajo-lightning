'use client';

// A small looped story for the home page: members pay in, the pot fills, one person collects, the turn moves on.
import { useEffect, useState } from 'react';
import CircleDial from './CircleDial';

const NAMES = ['Sade', 'Tunde', 'Amaka', 'Bisi', 'Musa'];
const EACH = 10_000;

export default function HeroDial() {
  const [tick, setTick] = useState(3);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setTick(n => (n + 1) % (NAMES.length * (NAMES.length + 2))), 1300);
    return () => clearInterval(t);
  }, []);

  const cycle = NAMES.length + 2;
  const round = Math.floor(tick / cycle) % NAMES.length;
  const paid = Math.min(tick % cycle, NAMES.length);
  const seats = NAMES.map((name, i) => ({
    key: name, name, state: (i < paid ? 'paid' : 'owed') as 'paid' | 'owed', collects: i === round,
  }));

  return (
    <CircleDial seats={seats} tone="indigo" label={`A savings circle of five. ${paid} have paid this round, and ${NAMES[round]} collects the pot.`}>
      <div className="dial-kicker">{NAMES[round]} collects</div>
      <div className="dial-amount">{(paid * EACH).toLocaleString('en-NG')}</div>
      <div className="dial-kicker">sats in the pot</div>
    </CircleDial>
  );
}
