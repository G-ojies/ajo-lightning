// Ajo (rotating savings circle) rules: who pays when, who collects each round, and late penalties.
// Pure functions over plain data so every member can recompute the circle's state from the public record.

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export interface Member {
  /** Nostr public key (hex) that signs this member's actions. */
  pubkey: string;
  name: string;
  /** Lightning address that receives this member's payout. */
  lightningAddress: string;
}

export interface CircleConfig {
  id: string;
  name: string;
  /** Contribution per member per round, in sats. */
  contributionSats: number;
  /** ISO time the first round's contributions are due. */
  startsAt: string;
  roundLengthDays: number;
  /** Hours after the due time before a payment counts as late. */
  graceHours: number;
  /** Flat penalty in sats for a late contribution, paid into the same round's pot. */
  latePenaltySats: number;
  members: Member[];
  /** Payout order as member pubkeys; build it with drawOrder() for a verifiable random draw. */
  order: string[];
}

export interface Contribution {
  round: number;
  pubkey: string;
  amountSats: number;
  /** Lightning payment hash that proves the payment. */
  paymentHash: string;
  paidAt: string;
}

export interface Payout {
  round: number;
  pubkey: string;
  amountSats: number;
  paymentHash: string;
  paidAt: string;
}

export type RoundState = 'collecting' | 'ready-to-pay' | 'paid';

export interface RoundStatus {
  round: number;
  dueAt: string;
  recipient: string;
  state: RoundState;
  paid: string[];
  unpaid: string[];
  late: string[];
  /** Sats each member still owes this round, including any late penalty. */
  owed: Record<string, number>;
  potSats: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function validateCircle(c: CircleConfig): void {
  if (c.members.length < 2) throw new Error('A circle needs at least 2 members');
  if (!Number.isInteger(c.contributionSats) || c.contributionSats <= 0) throw new Error('Contribution must be a positive whole number of sats');
  if (!(c.roundLengthDays > 0)) throw new Error('Round length must be positive');
  const keys = c.members.map(m => m.pubkey);
  if (new Set(keys).size !== keys.length) throw new Error('Each member can join only once');
  const sorted = (xs: string[]) => [...xs].sort().join();
  if (c.order.length !== keys.length || sorted(c.order) !== sorted(keys)) {
    throw new Error('Payout order must list every member exactly once');
  }
}

/**
 * Verifiable random payout order: members are ranked by sha256(seed + pubkey). Use a seed nobody controls in
 * advance, such as the id of the Nostr event that closed sign-ups, so anyone can recompute the draw.
 */
export function drawOrder(pubkeys: string[], seed: string): string[] {
  const rank = (k: string) => bytesToHex(sha256(utf8ToBytes(`${seed}:${k}`)));
  return [...pubkeys].sort((a, b) => rank(a).localeCompare(rank(b)));
}

export const roundCount = (c: CircleConfig) => c.members.length;
export const dueAt = (c: CircleConfig, round: number) =>
  new Date(Date.parse(c.startsAt) + (round - 1) * c.roundLengthDays * DAY).toISOString();
export const recipientOf = (c: CircleConfig, round: number) => c.order[round - 1];

function isLate(c: CircleConfig, round: number, paidAt: string): boolean {
  return Date.parse(paidAt) > Date.parse(dueAt(c, round)) + c.graceHours * HOUR;
}

/** What a member owes for a round if they pay at `at` (contribution plus penalty once past the grace period). */
export function amountDue(c: CircleConfig, round: number, at: string): number {
  return c.contributionSats + (isLate(c, round, at) ? c.latePenaltySats : 0);
}

export function roundStatus(
  c: CircleConfig, round: number, contributions: Contribution[], payouts: Payout[], now: string,
): RoundStatus {
  if (round < 1 || round > roundCount(c)) throw new Error(`Round ${round} is outside 1..${roundCount(c)}`);
  const mine = contributions.filter(x => x.round === round);
  const paid: string[] = [];
  const late: string[] = [];
  const owed: Record<string, number> = {};
  let potSats = 0;
  for (const m of c.members) {
    const got = mine.filter(x => x.pubkey === m.pubkey).reduce((s, x) => s + x.amountSats, 0);
    const lastPay = mine.filter(x => x.pubkey === m.pubkey).map(x => x.paidAt).sort().at(-1);
    const required = amountDue(c, round, lastPay ?? now);
    potSats += got;
    if (got >= required) paid.push(m.pubkey);
    else owed[m.pubkey] = required - got;
    if ((lastPay && isLate(c, round, lastPay)) || (!lastPay && isLate(c, round, now))) late.push(m.pubkey);
  }
  const unpaid = c.members.map(m => m.pubkey).filter(k => !paid.includes(k));
  const done = payouts.some(p => p.round === round);
  return {
    round,
    dueAt: dueAt(c, round),
    recipient: recipientOf(c, round),
    state: done ? 'paid' : unpaid.length === 0 ? 'ready-to-pay' : 'collecting',
    paid, unpaid, late, owed, potSats,
  };
}

/** The payout to send for a round, or null while anyone still owes. The recipient's own contribution is included. */
export function payoutFor(
  c: CircleConfig, round: number, contributions: Contribution[], payouts: Payout[], now: string,
): { pubkey: string; lightningAddress: string; amountSats: number } | null {
  const s = roundStatus(c, round, contributions, payouts, now);
  if (s.state !== 'ready-to-pay') return null;
  const m = c.members.find(x => x.pubkey === s.recipient)!;
  return { pubkey: m.pubkey, lightningAddress: m.lightningAddress, amountSats: s.potSats };
}

/** The earliest round that has not been paid out yet, or null when the circle is finished. */
export function currentRound(c: CircleConfig, payouts: Payout[]): number | null {
  for (let r = 1; r <= roundCount(c); r++) if (!payouts.some(p => p.round === r)) return r;
  return null;
}
