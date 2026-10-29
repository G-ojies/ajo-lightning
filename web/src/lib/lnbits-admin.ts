// Admin-side LNbits calls used only by the demo: create wallets and top them up with FakeWallet sats.
// Real members would pay from their own Lightning wallets; the demo gives each one a funded test wallet instead.
import 'server-only';
import type { LnbitsWallet } from '@ajo/core/lnbits';

const BASE = process.env.LNBITS_URL ?? 'http://127.0.0.1:5001';

export interface StoredWallet extends LnbitsWallet {
  id: string;
}

let session: { cookie: string; at: number } | null = null;

async function adminCookie(): Promise<string> {
  if (session && Date.now() - session.at < 30 * 60_000) return session.cookie;
  const res = await fetch(`${BASE}/api/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.LNBITS_ADMIN_USER, password: process.env.LNBITS_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`LNbits admin login failed (${res.status})`);
  const cookie = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  session = { cookie, at: Date.now() };
  return cookie;
}

export async function createWallet(name: string): Promise<StoredWallet> {
  const res = await fetch(`${BASE}/api/v1/account`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`LNbits could not create a wallet (${res.status})`);
  const w = (await res.json()) as { id: string; inkey: string; adminkey: string };
  return { id: w.id, baseUrl: BASE, inkey: w.inkey, adminkey: w.adminkey };
}

export async function topUp(walletId: string, sats: number): Promise<void> {
  const res = await fetch(`${BASE}/users/api/v1/balance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie: await adminCookie() },
    body: JSON.stringify({ id: walletId, amount: sats }),
  });
  if (!res.ok) throw new Error(`LNbits top-up failed (${res.status})`);
}
