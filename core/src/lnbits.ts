// Minimal LNbits REST client: the calls an ajo circle needs (create invoice, pay invoice, check payment, balance).
// Works against any LNbits instance; development uses a local LNbits with the FakeWallet funding source.

export interface LnbitsWallet {
  baseUrl: string;
  /** Invoice/read key: create invoices, read balance and payment status. */
  inkey: string;
  /** Admin key: needed to pay invoices out of this wallet. */
  adminkey?: string;
}

export interface Invoice {
  paymentHash: string;
  bolt11: string;
  amountSats: number;
}

async function call<T>(w: LnbitsWallet, key: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${w.baseUrl}${path}`, {
    method,
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LNbits ${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

export async function createInvoice(w: LnbitsWallet, amountSats: number, memo: string): Promise<Invoice> {
  if (!Number.isInteger(amountSats) || amountSats <= 0) throw new Error('Invoice amount must be a positive whole number of sats');
  const r = await call<{ payment_hash: string; bolt11?: string; payment_request?: string }>(
    w, w.inkey, 'POST', '/api/v1/payments', { out: false, amount: amountSats, memo });
  return { paymentHash: r.payment_hash, bolt11: (r.bolt11 ?? r.payment_request)!, amountSats };
}

/** Pay an invoice. The preimage is the proof of payment that goes into the circle's Nostr receipt. */
export async function payInvoice(w: LnbitsWallet, bolt11: string): Promise<{ paymentHash: string; preimage: string }> {
  if (!w.adminkey) throw new Error('Paying needs the wallet admin key');
  const r = await call<{ payment_hash: string; preimage: string }>(w, w.adminkey, 'POST', '/api/v1/payments', { out: true, bolt11 });
  return { paymentHash: r.payment_hash, preimage: r.preimage };
}

export async function isPaid(w: LnbitsWallet, paymentHash: string): Promise<boolean> {
  const r = await call<{ paid: boolean }>(w, w.inkey, 'GET', `/api/v1/payments/${paymentHash}`);
  return r.paid;
}

export async function balanceSats(w: LnbitsWallet): Promise<number> {
  const r = await call<{ balance: number }>(w, w.inkey, 'GET', '/api/v1/wallet');
  return Math.floor(r.balance / 1000);
}
