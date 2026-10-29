// BTC to naira rate for showing sats in naira. Display only; the circle always settles in sats.
import 'server-only';

let cached: { ngnPerBtc: number; at: number } | null = null;

export async function ngnPerSat(): Promise<number | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.ngnPerBtc / 1e8;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ngn', {
      signal: AbortSignal.timeout(5000),
    });
    const d = (await res.json()) as { bitcoin?: { ngn?: number } };
    if (!d.bitcoin?.ngn) return cached ? cached.ngnPerBtc / 1e8 : null;
    cached = { ngnPerBtc: d.bitcoin.ngn, at: Date.now() };
    return cached.ngnPerBtc / 1e8;
  } catch {
    return cached ? cached.ngnPerBtc / 1e8 : null;
  }
}
