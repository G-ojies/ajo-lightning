// Public record of an ajo circle on Nostr.
//
// The circle's coordinator key signs one event describing the circle and one receipt per contribution or payout.
// Each receipt carries the Lightning payment hash and preimage, so anyone can check that sha256(preimage) equals the
// hash (proof the payment settled) and rebuild the circle's state from the events alone with replay().

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { finalizeEvent, verifyEvent, type Event, type EventTemplate } from 'nostr-tools/pure';
import type { CircleConfig, Contribution, Payout } from './index';

/** Regular (non-replaceable) custom kind for ajo records. */
export const AJO_KIND = 4041;

type Action = 'circle' | 'contribution' | 'payout';

export interface PaymentProof {
  round: number;
  pubkey: string;
  amountSats: number;
  paymentHash: string;
  preimage: string;
  paidAt: string;
}

const tag = (e: Event, name: string) => e.tags.find(t => t[0] === name)?.[1];
const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export function circleEvent(c: CircleConfig, secretKey: Uint8Array): Event {
  const t: EventTemplate = {
    kind: AJO_KIND,
    created_at: Math.floor(Date.now() / 1000), // Relays refuse future timestamps, and startsAt is usually ahead.
    tags: [['t', 'ajo'], ['action', 'circle'], ['circle', c.id]],
    content: JSON.stringify(c),
  };
  return finalizeEvent(t, secretKey);
}

export function receiptEvent(circleId: string, action: 'contribution' | 'payout', p: PaymentProof, secretKey: Uint8Array): Event {
  const t: EventTemplate = {
    kind: AJO_KIND,
    created_at: unix(p.paidAt),
    tags: [
      ['t', 'ajo'], ['action', action], ['circle', circleId], ['round', String(p.round)], ['p', p.pubkey],
      ['amount', String(p.amountSats)], ['payment_hash', p.paymentHash], ['preimage', p.preimage], ['paid_at', p.paidAt],
    ],
    content: `${action === 'contribution' ? 'Contribution' : 'Payout'} of ${p.amountSats} sats, round ${p.round}`,
  };
  return finalizeEvent(t, secretKey);
}

/** Why an event cannot be trusted, or null if it is a valid record from this coordinator. */
export function checkEvent(e: Event, coordinator: string): string | null {
  if (e.kind !== AJO_KIND) return 'not an ajo event';
  if (e.pubkey !== coordinator) return 'not signed by the circle coordinator';
  // Verify a plain copy: nostr-tools caches a passed check on the event object, and copies keep that cache.
  const { id, pubkey, created_at, kind, tags, content, sig } = e;
  if (!verifyEvent({ id, pubkey, created_at, kind, tags, content, sig })) return 'bad signature';
  const action = tag(e, 'action') as Action | undefined;
  if (action === 'circle') return null;
  if (action !== 'contribution' && action !== 'payout') return 'unknown action';
  const hash = tag(e, 'payment_hash'), pre = tag(e, 'preimage');
  if (!hash || !pre || !/^[0-9a-f]{64}$/.test(pre)) return 'missing payment proof';
  if (bytesToHex(sha256(hexToBytes(pre))) !== hash) return 'preimage does not match the payment hash';
  const amount = Number(tag(e, 'amount')), round = Number(tag(e, 'round'));
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(round) || round < 1) return 'bad amount or round';
  return null;
}

export interface Replay {
  config: CircleConfig;
  contributions: Contribution[];
  payouts: Payout[];
  rejected: Array<{ id: string; reason: string }>;
}

/** Rebuild a circle from its Nostr events. Invalid or duplicate events are listed in `rejected`, never applied. */
export function replay(events: Event[], circleId: string, coordinator: string): Replay {
  const rejected: Replay['rejected'] = [];
  const mine = events.filter(e => tag(e, 'circle') === circleId);
  const valid = mine.filter(e => {
    const why = checkEvent(e, coordinator);
    if (why) rejected.push({ id: e.id, reason: why });
    return !why;
  });
  const circles = valid.filter(e => tag(e, 'action') === 'circle');
  if (circles.length === 0) throw new Error(`No valid circle event for ${circleId}`);
  const config = JSON.parse(circles.sort((a, b) => a.created_at - b.created_at)[0].content) as CircleConfig;

  const seen = new Set<string>();
  const contributions: Contribution[] = [];
  const payouts: Payout[] = [];
  for (const e of valid.filter(x => tag(x, 'action') !== 'circle').sort((a, b) => a.created_at - b.created_at)) {
    const hash = tag(e, 'payment_hash')!;
    if (seen.has(hash)) { rejected.push({ id: e.id, reason: 'payment already recorded' }); continue; }
    seen.add(hash);
    const rec = { round: Number(tag(e, 'round')), pubkey: tag(e, 'p')!, amountSats: Number(tag(e, 'amount')), paymentHash: hash, paidAt: tag(e, 'paid_at')! };
    if (!config.members.some(m => m.pubkey === rec.pubkey)) { rejected.push({ id: e.id, reason: 'not a member of this circle' }); continue; }
    (tag(e, 'action') === 'contribution' ? contributions : payouts).push(rec);
  }
  return { config, contributions, payouts, rejected };
}
