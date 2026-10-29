export const sats = (n: number) => `${n.toLocaleString('en-NG')} sats`;

export function naira(satsAmount: number, ngnPerSat: number | null): string | null {
  if (!ngnPerSat) return null;
  return `₦${Math.round(satsAmount * ngnPerSat).toLocaleString('en-NG')}`;
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}
