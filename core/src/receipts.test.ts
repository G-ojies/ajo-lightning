import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import { roundStatus, type CircleConfig } from './index';
import { checkEvent, circleEvent, receiptEvent, replay, type PaymentProof } from './receipts';

const sk = generateSecretKey();
const coordinator = getPublicKey(sk);
const names = ['ada', 'bayo', 'chika'];
const circle: CircleConfig = {
  id: 'c-receipts', name: 'Test ajo', contributionSats: 5_000, startsAt: '2026-11-02T09:00:00.000Z',
  roundLengthDays: 7, graceHours: 24, latePenaltySats: 200,
  members: names.map(n => ({ pubkey: `pk-${n}`, name: n, lightningAddress: `${n}@local` })),
  order: names.map(n => `pk-${n}`),
};

function proof(round: number, who: string, amountSats = 5_000): PaymentProof {
  const preimage = randomBytes(32).toString('hex');
  return {
    round, pubkey: `pk-${who}`, amountSats, preimage,
    paymentHash: createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex'),
    paidAt: '2026-11-02T08:00:00.000Z',
  };
}
const contribution = (who: string, p = proof(1, who)) => receiptEvent(circle.id, 'contribution', p, sk);

describe('checkEvent', () => {
  it('accepts a coordinator-signed receipt with a matching preimage', () => {
    expect(checkEvent(contribution('ada'), coordinator)).toBeNull();
  });

  it('rejects a receipt signed by someone else', () => {
    const other = receiptEvent(circle.id, 'contribution', proof(1, 'ada'), generateSecretKey());
    expect(checkEvent(other, coordinator)).toMatch(/coordinator/);
  });

  it('rejects a receipt whose preimage does not hash to the payment hash', () => {
    const p = proof(1, 'ada');
    const forged = receiptEvent(circle.id, 'contribution', { ...p, preimage: randomBytes(32).toString('hex') }, sk);
    expect(checkEvent(forged, coordinator)).toMatch(/preimage/);
  });

  it('rejects an event edited after signing', () => {
    const e = contribution('ada');
    const edited: Event = { ...e, tags: e.tags.map(t => (t[0] === 'amount' ? ['amount', '50000'] : t)) };
    expect(checkEvent(edited, coordinator)).toMatch(/signature/);
  });
});

describe('replay', () => {
  it('rebuilds the circle so roundStatus matches what the coordinator saw', () => {
    const events = [circleEvent(circle, sk), ...names.map(n => contribution(n))];
    const r = replay(events, circle.id, coordinator);
    expect(r.rejected).toEqual([]);
    expect(r.config).toEqual(circle);
    const s = roundStatus(r.config, 1, r.contributions, r.payouts, '2026-11-02T09:00:00.000Z');
    expect(s).toMatchObject({ state: 'ready-to-pay', potSats: 15_000 });
  });

  it('records payouts separately and marks the round paid', () => {
    const payout = receiptEvent(circle.id, 'payout', proof(1, 'ada', 15_000), sk);
    const r = replay([circleEvent(circle, sk), ...names.map(n => contribution(n)), payout], circle.id, coordinator);
    expect(r.payouts).toHaveLength(1);
    expect(roundStatus(r.config, 1, r.contributions, r.payouts, '2026-11-02T09:00:00.000Z').state).toBe('paid');
  });

  it('counts a payment only once even if its receipt is published twice', () => {
    const p = proof(1, 'ada');
    const r = replay([circleEvent(circle, sk), contribution('ada', p), contribution('ada', { ...p, paidAt: '2026-11-02T08:05:00.000Z' })], circle.id, coordinator);
    expect(r.contributions).toHaveLength(1);
    expect(r.rejected.map(x => x.reason)).toEqual(['payment already recorded']);
  });

  it('ignores forged receipts and receipts for non-members, and says why', () => {
    const outsider = receiptEvent(circle.id, 'contribution', { ...proof(1, 'mallory') }, sk);
    const forged = receiptEvent(circle.id, 'contribution', proof(1, 'bayo'), generateSecretKey());
    const r = replay([circleEvent(circle, sk), outsider, forged], circle.id, coordinator);
    expect(r.contributions).toEqual([]);
    expect(r.rejected.map(x => x.reason).sort()).toEqual(['not a member of this circle', 'not signed by the circle coordinator']);
  });

  it('ignores events from other circles and fails without a circle event', () => {
    expect(() => replay([contribution('ada')], 'another-circle', coordinator)).toThrow(/No valid circle event/);
  });
});
