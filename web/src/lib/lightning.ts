// Picks the Lightning backend: a real LNbits instance by default, the embedded test ledger for the hosted demo.
import 'server-only';
import * as lnbits from '@ajo/core/lnbits';
import * as admin from './lnbits-admin';
import type { StoredWallet } from './lnbits-admin';
import * as embedded from './test-lightning';

export const isEmbedded = process.env.AJO_LIGHTNING === 'embedded';

export const createWallet = (name: string) => (isEmbedded ? embedded.createWallet() : admin.createWallet(name));
export const topUp = (id: string, sats: number) => (isEmbedded ? embedded.topUp(id, sats) : admin.topUp(id, sats));
export const createInvoice = (w: StoredWallet, sats: number, memo: string) =>
  (isEmbedded ? embedded.createInvoice(w, sats, memo) : lnbits.createInvoice(w, sats, memo));
export const paymentStatus = (w: StoredWallet, hash: string) =>
  (isEmbedded ? embedded.paymentStatus(w, hash) : lnbits.paymentStatus(w, hash));
export const payInvoice = (w: StoredWallet, inv: { bolt11: string; paymentHash: string }) =>
  (isEmbedded ? embedded.payInvoice(w, inv.paymentHash) : lnbits.payInvoice(w, inv.bolt11));
