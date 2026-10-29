// File-backed store for the demo. The public record is `events`; everything else is private server state
// (the coordinator's signing key and the LNbits wallet keys) and never leaves the server.
import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Event } from 'nostr-tools/pure';
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

const DIR = process.env.AJO_DATA_DIR ?? path.join(process.cwd(), '.data');
const file = (id: string) => path.join(DIR, `${id.replace(/[^a-z0-9-]/gi, '')}.json`);

export async function loadCircle(id: string): Promise<CircleRecord | null> {
  try {
    return JSON.parse(await readFile(file(id), 'utf8')) as CircleRecord;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveCircle(c: CircleRecord): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(c.id)}.tmp`;
  await writeFile(tmp, JSON.stringify(c, null, 1));
  await rename(tmp, file(c.id));
}

// One write at a time per circle, so two payments settling together cannot overwrite each other.
const locks = new Map<string, Promise<unknown>>();
export function withCircle<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(id, next.catch(() => undefined));
  return next;
}
