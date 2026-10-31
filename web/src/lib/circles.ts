// Circle operations. State is always rebuilt from the signed events with replay(), so the app shows exactly
// what any member can verify from the public record.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import {
  amountDue, currentRound, drawOrder, payoutFor, roundCount, roundStatus, validateCircle,
  type CircleConfig, type RoundStatus,
} from '@ajo/core';
import { circleEvent, receiptEvent, replay } from '@ajo/core/receipts';
import { countToday } from './kv';
import { createInvoice, createWallet, payInvoice, paymentStatus, topUp } from './lightning';
import { loadCircle, saveCircle, withCircle, type CircleRecord } from './store';

export interface NewCircle {
  name: string;
  contributionSats: number;
  roundLengthDays: number;
  graceHours: number;
  latePenaltySats: number;
  memberNames: string[];
}

export interface CircleView {
  config: CircleConfig;
  coordinatorPubkey: string;
  round: number | null;
  rounds: number;
  status: RoundStatus | null;
  /** Payout recipient name per round, with the paid amount once paid out. */
  schedule: Array<{ round: number; name: string; dueAt: string; paidOutSats: number | null }>;
  receipts: Array<{ id: string; action: string; round: number; name: string; amountSats: number; paidAt: string }>;
  rejected: number;
}

const DAY = 86_400_000;
const MAX_NEW_CIRCLES_PER_DAY = 40;
const nowIso = () => new Date().toISOString();

function checkInput(n: NewCircle): string[] {
  const names = n.memberNames.map(s => s.trim()).filter(Boolean);
  const errors: string[] = [];
  if (!n.name?.trim() || n.name.length > 60) errors.push('Give the circle a name (up to 60 characters).');
  if (names.length < 2 || names.length > 12) errors.push('A circle needs 2 to 12 members.');
  if (new Set(names.map(s => s.toLowerCase())).size !== names.length) errors.push('Member names must be different.');
  if (!Number.isInteger(n.contributionSats) || n.contributionSats < 100 || n.contributionSats > 1_000_000) errors.push('Contribution must be 100 to 1,000,000 sats.');
  if (!Number.isInteger(n.roundLengthDays) || n.roundLengthDays < 1 || n.roundLengthDays > 31) errors.push('Round length must be 1 to 31 days.');
  if (!Number.isInteger(n.graceHours) || n.graceHours < 0 || n.graceHours > 168) errors.push('Grace period must be 0 to 168 hours.');
  if (!Number.isInteger(n.latePenaltySats) || n.latePenaltySats < 0 || n.latePenaltySats > n.contributionSats) errors.push('Late penalty must be 0 up to one contribution.');
  return errors;
}

export async function createCircle(input: NewCircle): Promise<{ id: string } | { errors: string[] }> {
  const errors = checkInput(input);
  if (errors.length) return { errors };
  if ((await countToday('circles')) > MAX_NEW_CIRCLES_PER_DAY) return { errors: ['The demo has reached its limit of new circles for today. Please try tomorrow.'] };
  const id = randomUUID().slice(0, 8);
  const sk = generateSecretKey();
  const names = input.memberNames.map(s => s.trim()).filter(Boolean);
  // Demo members: each gets a Nostr key and a funded LNbits test wallet.
  const members = await Promise.all(names.map(async name => {
    const wallet = await createWallet(`ajo-${id}-${name}`);
    await topUp(wallet.id, (input.contributionSats + input.latePenaltySats) * names.length + 1_000);
    return { name, pubkey: getPublicKey(generateSecretKey()), wallet };
  }));
  const pot = await createWallet(`ajo-${id}-pot`);
  const config: CircleConfig = {
    id, name: input.name.trim(), contributionSats: input.contributionSats,
    startsAt: new Date(Date.now() + DAY).toISOString(),
    roundLengthDays: input.roundLengthDays, graceHours: input.graceHours, latePenaltySats: input.latePenaltySats,
    members: members.map(m => ({ pubkey: m.pubkey, name: m.name, lightningAddress: `${m.name.toLowerCase()}@ajo.demo` })),
    // Payout order drawn from the circle id, so anyone can recompute it.
    order: drawOrder(members.map(m => m.pubkey), id),
  };
  validateCircle(config);
  const rec: CircleRecord = {
    id, coordinatorSecretKey: bytesToHex(sk), coordinatorPubkey: getPublicKey(sk), pot,
    memberWallets: Object.fromEntries(members.map(m => [m.pubkey, m.wallet])), pending: {},
    events: [circleEvent(config, sk)],
  };
  await saveCircle(rec);
  return { id };
}

function rebuild(rec: CircleRecord) {
  return replay(rec.events, rec.id, rec.coordinatorPubkey);
}

export async function viewCircle(id: string): Promise<CircleView | null> {
  const rec = await loadCircle(id);
  if (!rec) return null;
  const r = rebuild(rec);
  const round = currentRound(r.config, r.payouts);
  const nameOf = (pk: string) => r.config.members.find(m => m.pubkey === pk)?.name ?? pk.slice(0, 8);
  return {
    config: r.config,
    coordinatorPubkey: rec.coordinatorPubkey,
    round,
    rounds: roundCount(r.config),
    status: round ? roundStatus(r.config, round, r.contributions, r.payouts, nowIso()) : null,
    schedule: r.config.order.map((pk, i) => ({
      round: i + 1, name: nameOf(pk),
      dueAt: new Date(Date.parse(r.config.startsAt) + i * r.config.roundLengthDays * DAY).toISOString(),
      paidOutSats: r.payouts.find(p => p.round === i + 1)?.amountSats ?? null,
    })),
    receipts: rec.events.filter(e => e.tags.some(t => t[0] === 'action' && t[1] !== 'circle')).map(e => {
      const tag = (k: string) => e.tags.find(t => t[0] === k)?.[1] ?? '';
      return { id: e.id, action: tag('action'), round: Number(tag('round')), name: nameOf(tag('p')), amountSats: Number(tag('amount')), paidAt: tag('paid_at') };
    }).reverse(),
    rejected: r.rejected.length,
  };
}

export async function publicEvents(id: string): Promise<{ coordinatorPubkey: string; events: Event[] } | null> {
  const rec = await loadCircle(id);
  return rec ? { coordinatorPubkey: rec.coordinatorPubkey, events: rec.events } : null;
}

/** Create the invoice a member pays for the current round (contribution plus any late penalty still owed). */
export function requestInvoice(id: string, pubkey: string) {
  return withCircle(id, async () => {
    const rec = await loadCircle(id);
    if (!rec) throw new Error('Circle not found');
    const r = rebuild(rec);
    const round = currentRound(r.config, r.payouts);
    if (!round) throw new Error('This circle has finished');
    const s = roundStatus(r.config, round, r.contributions, r.payouts, nowIso());
    if (!(pubkey in s.owed)) throw new Error('This member has already paid this round');
    const member = r.config.members.find(m => m.pubkey === pubkey)!;
    const amount = s.owed[pubkey] ?? amountDue(r.config, round, nowIso());
    const inv = await createInvoice(rec.pot, amount, `${r.config.name}: round ${round}, ${member.name}`);
    rec.pending[inv.paymentHash] = { round, pubkey, amountSats: amount, bolt11: inv.bolt11, createdAt: nowIso() };
    await saveCircle(rec);
    return { paymentHash: inv.paymentHash, bolt11: inv.bolt11, amountSats: amount, round };
  });
}

/** Record a contribution once its invoice has settled; publishes the signed receipt. */
export function settle(id: string, paymentHash: string) {
  return withCircle(id, async () => {
    const rec = await loadCircle(id);
    if (!rec) throw new Error('Circle not found');
    const p = rec.pending[paymentHash];
    if (!p) {
      const already = rec.events.some(e => e.tags.some(t => t[0] === 'payment_hash' && t[1] === paymentHash));
      return { paid: already };
    }
    const st = await paymentStatus(rec.pot, paymentHash);
    if (!st.paid || !st.preimage) return { paid: false };
    rec.events.push(receiptEvent(rec.id, 'contribution', {
      round: p.round, pubkey: p.pubkey, amountSats: p.amountSats, paymentHash, preimage: st.preimage, paidAt: nowIso(),
    }, hexToBytes(rec.coordinatorSecretKey)));
    delete rec.pending[paymentHash];
    await saveCircle(rec);
    return { paid: true };
  });
}

/** Demo only: pay a member's invoice from that member's funded test wallet. */
export async function demoPay(id: string, pubkey: string) {
  const inv = await requestInvoice(id, pubkey);
  const rec = await loadCircle(id);
  const wallet = rec?.memberWallets[pubkey];
  if (!wallet) throw new Error('No demo wallet for this member');
  await payInvoice(wallet, inv);
  return settle(id, inv.paymentHash);
}

/** Pay the whole pot to this round's recipient once everyone has paid; publishes the payout receipt. */
export function payout(id: string) {
  return withCircle(id, async () => {
    const rec = await loadCircle(id);
    if (!rec) throw new Error('Circle not found');
    const r = rebuild(rec);
    const round = currentRound(r.config, r.payouts);
    if (!round) throw new Error('This circle has finished');
    const due = payoutFor(r.config, round, r.contributions, r.payouts, nowIso());
    if (!due) throw new Error('Not everyone has paid this round yet');
    const wallet = rec.memberWallets[due.pubkey];
    const inv = await createInvoice(wallet, due.amountSats, `${r.config.name}: round ${round} payout`);
    const paid = await payInvoice(rec.pot, inv);
    rec.events.push(receiptEvent(rec.id, 'payout', {
      round, pubkey: due.pubkey, amountSats: due.amountSats, paymentHash: inv.paymentHash, preimage: paid.preimage, paidAt: nowIso(),
    }, hexToBytes(rec.coordinatorSecretKey)));
    await saveCircle(rec);
    return { round, amountSats: due.amountSats, recipient: r.config.members.find(m => m.pubkey === due.pubkey)!.name };
  });
}
