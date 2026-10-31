// Circle storage. The public record is `events`; everything else is private server state
// (the coordinator's signing key and the LNbits wallet keys) and never leaves the server.
import 'server-only';
import type { Event } from 'nostr-tools/pure';
import { getJson, setJson, withLock } from './kv';
import type { StoredWallet } from './lnbits-admin';

export interface PendingInvoice {
  round: number;
  pubkey: string;
  amountSats: number;
  bolt11: string;
  createdAt: string;
}

export interface CircleRecord {
  id: string;
  coordinatorSecretKey: string;
  coordinatorPubkey: string;
  pot: StoredWallet;
  /** Demo wallets, one per member pubkey. */
  memberWallets: Record<string, StoredWallet>;
  /** Unpaid contribution invoices by payment hash. */
  pending: Record<string, PendingInvoice>;
  events: Event[];
}

const key = (id: string) => `circle-${id.replace(/[^a-z0-9-]/gi, '')}`;

export const loadCircle = (id: string) => getJson<CircleRecord>(key(id));
export const saveCircle = (c: CircleRecord) => setJson(key(c.id), c);
export const withCircle = <T>(id: string, fn: () => Promise<T>) => withLock(key(id), fn);
