// Embedded test Lightning: a small ledger that behaves like an LNbits wallet (hold-free invoices, preimages,
// balances) without a node. Only test sats exist here. Real BOLT11 strings are issued for the signet network,
// and the preimage stays secret until the invoice is paid, so receipts carry the same proof as real Lightning.
import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { encodeBolt11 } from '@ajo/core/bolt11';
import type { Invoice } from '@ajo/core/lnbits';
import { getJson, setJson, withLock } from './kv';
import type { StoredWallet } from './lnbits-admin';

interface LedgerInvoice { walletId: string; amountSats: number; preimage: string; paid: boolean; expiresAt: number }

// A public, valueless key: it only signs test invoices.
const NODE_KEY = createHash('sha256').update('ajo-embedded-test-node').digest();
const EXPIRY_SECONDS = 3600;
const walletKey = (id: string) => `ln-wallet-${id}`;
const invoiceKey = (hash: string) => `ln-invoice-${hash}`;
const balance = async (id: string) => (await getJson<number>(walletKey(id))) ?? 0;

export async function createWallet(): Promise<StoredWallet> {
  const id = randomUUID();
  await setJson(walletKey(id), 0);
  return { id, baseUrl: 'embedded', inkey: id, adminkey: id };
}

export async function topUp(walletId: string, sats: number): Promise<void> {
  await withLock('ln', async () => setJson(walletKey(walletId), (await balance(walletId)) + sats));
}

export async function createInvoice(w: StoredWallet, amountSats: number, memo: string): Promise<Invoice> {
  if (!Number.isInteger(amountSats) || amountSats <= 0) throw new Error('Invoice amount must be a positive whole number of sats');
  const preimage = randomBytes(32);
  const paymentHash = createHash('sha256').update(preimage).digest('hex');
  await setJson(invoiceKey(paymentHash), {
    walletId: w.id, amountSats, preimage: preimage.toString('hex'), paid: false, expiresAt: Date.now() + EXPIRY_SECONDS * 1000,
  } satisfies LedgerInvoice);
  const bolt11 = encodeBolt11({ paymentHash, amountSats, description: memo, nodeSecretKey: NODE_KEY, expirySeconds: EXPIRY_SECONDS });
  return { paymentHash, bolt11, amountSats };
}

export function payInvoice(w: StoredWallet, paymentHash: string): Promise<{ paymentHash: string; preimage: string }> {
  return withLock('ln', async () => {
    const inv = await getJson<LedgerInvoice>(invoiceKey(paymentHash));
    if (!inv) throw new Error('Unknown invoice');
    if (inv.paid) throw new Error('Invoice already paid');
    if (Date.now() > inv.expiresAt) throw new Error('Invoice expired');
    const from = await balance(w.id);
    if (from < inv.amountSats) throw new Error('Not enough test sats in this wallet');
    await setJson(walletKey(w.id), from - inv.amountSats);
    await setJson(walletKey(inv.walletId), (await balance(inv.walletId)) + inv.amountSats);
    await setJson(invoiceKey(paymentHash), { ...inv, paid: true });
    return { paymentHash, preimage: inv.preimage };
  });
}

export async function paymentStatus(w: StoredWallet, paymentHash: string): Promise<{ paid: boolean; preimage: string | null }> {
  const inv = await getJson<LedgerInvoice>(invoiceKey(paymentHash));
  if (!inv || inv.walletId !== w.id || !inv.paid) return { paid: false, preimage: null };
  return { paid: true, preimage: inv.preimage };
}
