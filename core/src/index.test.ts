import { describe, expect, it } from 'vitest';
import {
  amountDue, currentRound, drawOrder, dueAt, payoutFor, roundStatus, validateCircle,
  type CircleConfig, type Contribution, type Payout,
} from './index';

const members = ['ada', 'bayo', 'chika', 'dupe'].map(n => ({ pubkey: `pk-${n}`, name: n, lightningAddress: `${n}@example.com` }));
const circle: CircleConfig = {
  id: 'c1', name: 'Market women ajo', contributionSats: 10_000,
  startsAt: '2026-11-02T09:00:00.000Z', roundLengthDays: 7, graceHours: 24, latePenaltySats: 500,
  members, order: members.map(m => m.pubkey),
};
const pay = (round: number, who: string, paidAt: string, amountSats = 10_000): Contribution =>
  ({ round, pubkey: `pk-${who}`, amountSats, paymentHash: `h-${round}-${who}-${amountSats}`, paidAt });
const ON_TIME = '2026-11-02T08:00:00.000Z';

describe('validateCircle', () => {
  it('accepts a well-formed circle', () => expect(() => validateCircle(circle)).not.toThrow());
  it('rejects a payout order that skips or repeats a member', () => {
    expect(() => validateCircle({ ...circle, order: ['pk-ada', 'pk-ada', 'pk-bayo', 'pk-chika'] })).toThrow(/order/);
  });
  it('rejects duplicate members', () => {
    expect(() => validateCircle({ ...circle, members: [members[0], members[0]], order: ['pk-ada', 'pk-ada'] })).toThrow(/once/);
  });
  it('rejects a fractional or zero contribution', () => {
    expect(() => validateCircle({ ...circle, contributionSats: 0 })).toThrow(/sats/);
    expect(() => validateCircle({ ...circle, contributionSats: 10.5 })).toThrow(/sats/);
  });
});

describe('drawOrder', () => {
  const keys = members.map(m => m.pubkey);
  it('is a permutation of the members', () => expect([...drawOrder(keys, 'seed')].sort()).toEqual([...keys].sort()));
  it('is reproducible from the seed and independent of input order', () => {
    expect(drawOrder([...keys].reverse(), 'event-abc')).toEqual(drawOrder(keys, 'event-abc'));
  });
  it('changes with the seed', () => {
    const orders = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(s => drawOrder(keys, s).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('rounds', () => {
  it('schedules rounds a week apart', () => {
    expect(dueAt(circle, 1)).toBe('2026-11-02T09:00:00.000Z');
    expect(dueAt(circle, 3)).toBe('2026-11-16T09:00:00.000Z');
  });

  it('collects until everyone has paid, then is ready to pay the round recipient the whole pot', () => {
    const some = [pay(1, 'ada', ON_TIME), pay(1, 'bayo', ON_TIME), pay(1, 'chika', ON_TIME)];
    const s = roundStatus(circle, 1, some, [], ON_TIME);
    expect(s).toMatchObject({ state: 'collecting', unpaid: ['pk-dupe'], potSats: 30_000, recipient: 'pk-ada' });
    expect(payoutFor(circle, 1, some, [], ON_TIME)).toBeNull();
    const all = [...some, pay(1, 'dupe', ON_TIME)];
    expect(roundStatus(circle, 1, all, [], ON_TIME).state).toBe('ready-to-pay');
    expect(payoutFor(circle, 1, all, [], ON_TIME)).toEqual({ pubkey: 'pk-ada', lightningAddress: 'ada@example.com', amountSats: 40_000 });
  });

  it('ignores contributions made for other rounds', () => {
    expect(roundStatus(circle, 2, [pay(1, 'ada', ON_TIME)], [], ON_TIME).paid).toEqual([]);
  });

  it('marks a round paid once its payout is recorded and moves to the next round', () => {
    const all = ['ada', 'bayo', 'chika', 'dupe'].map(w => pay(1, w, ON_TIME));
    const payouts: Payout[] = [{ round: 1, pubkey: 'pk-ada', amountSats: 40_000, paymentHash: 'p1', paidAt: ON_TIME }];
    expect(roundStatus(circle, 1, all, payouts, ON_TIME).state).toBe('paid');
    expect(currentRound(circle, payouts)).toBe(2);
  });

  it('reports the circle finished after the last payout', () => {
    const payouts = [1, 2, 3, 4].map(r => ({ round: r, pubkey: circle.order[r - 1], amountSats: 40_000, paymentHash: `p${r}`, paidAt: ON_TIME }));
    expect(currentRound(circle, payouts)).toBeNull();
  });

  it('rejects a round number outside the circle', () => {
    expect(() => roundStatus(circle, 5, [], [], ON_TIME)).toThrow(/outside/);
  });
});

describe('late payments', () => {
  const AFTER_GRACE = '2026-11-03T09:30:00.000Z';
  const WITHIN_GRACE = '2026-11-03T08:59:00.000Z';

  it('charges the penalty only after the grace period', () => {
    expect(amountDue(circle, 1, WITHIN_GRACE)).toBe(10_000);
    expect(amountDue(circle, 1, AFTER_GRACE)).toBe(10_500);
  });

  it('treats a late payment without the penalty as still owing the penalty', () => {
    const s = roundStatus(circle, 1, [pay(1, 'dupe', AFTER_GRACE)], [], AFTER_GRACE);
    expect(s.paid).not.toContain('pk-dupe');
    expect(s.owed['pk-dupe']).toBe(500);
    expect(s.late).toContain('pk-dupe');
  });

  it('counts a late payment that includes the penalty as paid, and adds the penalty to the pot', () => {
    const others = ['ada', 'bayo', 'chika'].map(w => pay(1, w, ON_TIME));
    const all = [...others, pay(1, 'dupe', AFTER_GRACE, 10_500)];
    const s = roundStatus(circle, 1, all, [], AFTER_GRACE);
    expect(s.state).toBe('ready-to-pay');
    expect(s.potSats).toBe(40_500);
  });

  it('lists members who have not paid by the end of the grace period as late', () => {
    expect(roundStatus(circle, 1, [], [], AFTER_GRACE).late).toHaveLength(4);
    expect(roundStatus(circle, 1, [], [], WITHIN_GRACE).late).toHaveLength(0);
  });
});
