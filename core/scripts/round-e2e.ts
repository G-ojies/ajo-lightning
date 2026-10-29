// End-to-end check of one ajo round against a local LNbits (FakeWallet):
// 4 members pay the circle's pot invoice by invoice, the round turns ready-to-pay, and the pot pays the recipient.
// Needs LNBITS_URL and an admin session cookie file in LNBITS_COOKIES to top up the test members.
//   LNBITS_URL=http://127.0.0.1:5001 LNBITS_COOKIES=/path/cookies npx tsx scripts/round-e2e.ts

import { readFileSync } from 'node:fs';
import { balanceSats, createInvoice, isPaid, payInvoice, type LnbitsWallet } from '../src/lnbits';
import { generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import { payoutFor, roundStatus, type CircleConfig, type Contribution } from '../src/index';
import { circleEvent, receiptEvent, replay } from '../src/receipts';

const BASE = process.env.LNBITS_URL ?? 'http://127.0.0.1:5001';
const cookie = readFileSync(process.env.LNBITS_COOKIES!, 'utf8')
  .split('\n').filter(l => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_')))
  .map(l => l.split('\t')).filter(f => f.length >= 7).map(f => `${f[5]}=${f[6]}`).join('; ');

async function newWallet(name: string, topUpSats = 0): Promise<LnbitsWallet> {
  const r = await fetch(`${BASE}/api/v1/account`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  }).then(x => x.json()) as { id: string; inkey: string; adminkey: string };
  if (topUpSats) {
    const t = await fetch(`${BASE}/users/api/v1/balance`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ id: r.id, amount: topUpSats }),
    });
    if (!t.ok) throw new Error(`top-up failed ${t.status}`);
  }
  return { baseUrl: BASE, inkey: r.inkey, adminkey: r.adminkey };
}

const names = ['ada', 'bayo', 'chika', 'dupe'];
const now = new Date().toISOString();
const circle: CircleConfig = {
  id: 'e2e', name: 'E2E ajo', contributionSats: 10_000, startsAt: now, roundLengthDays: 7, graceHours: 24,
  latePenaltySats: 500,
  members: names.map(n => ({ pubkey: `pk-${n}`, name: n, lightningAddress: `${n}@local` })),
  order: names.map(n => `pk-${n}`),
};

const coordinatorKey = generateSecretKey();
const record: Event[] = [circleEvent(circle, coordinatorKey)];
const pot = await newWallet('e2e-pot');
const wallets = Object.fromEntries(await Promise.all(names.map(async n => [n, await newWallet(`e2e-${n}`, 20_000)] as const)));
const contributions: Contribution[] = [];

for (const n of names) {
  const inv = await createInvoice(pot, circle.contributionSats, `ajo round 1: ${n}`);
  const { preimage } = await payInvoice(wallets[n], inv.bolt11);
  if (!(await isPaid(pot, inv.paymentHash))) throw new Error(`${n}'s payment not settled`);
  const c = { round: 1, pubkey: `pk-${n}`, amountSats: inv.amountSats, paymentHash: inv.paymentHash, paidAt: new Date().toISOString() };
  contributions.push(c);
  record.push(receiptEvent(circle.id, 'contribution', { ...c, preimage }, coordinatorKey));
  console.log(`${n} paid ${inv.amountSats} sats (${inv.paymentHash.slice(0, 12)}...)`);
}

const status = roundStatus(circle, 1, contributions, [], new Date().toISOString());
console.log('round 1:', status.state, 'pot', status.potSats, 'pot wallet balance', await balanceSats(pot));
const due = payoutFor(circle, 1, contributions, [], new Date().toISOString());
if (!due) throw new Error('payout not ready');

const recipient = names[circle.order.indexOf(due.pubkey)];
const before = await balanceSats(wallets[recipient]);
const payoutInv = await createInvoice(wallets[recipient], due.amountSats, 'ajo round 1 payout');
const paid = await payInvoice(pot, payoutInv.bolt11);
const after = await balanceSats(wallets[recipient]);
console.log(`payout to ${recipient}: ${due.amountSats} sats; balance ${before} -> ${after}; pot now ${await balanceSats(pot)}`);
if (after - before !== due.amountSats) throw new Error('recipient balance did not rise by the pot');
record.push(receiptEvent(circle.id, 'payout', {
  round: 1, pubkey: due.pubkey, amountSats: due.amountSats, paymentHash: payoutInv.paymentHash, preimage: paid.preimage,
  paidAt: new Date().toISOString(),
}, coordinatorKey));

// Anyone holding only the public events can rebuild the round and reach the same result.
const rebuilt = replay(JSON.parse(JSON.stringify(record)), circle.id, getPublicKey(coordinatorKey));
const s = roundStatus(rebuilt.config, 1, rebuilt.contributions, rebuilt.payouts, new Date().toISOString());
console.log(`replayed ${record.length} Nostr events: round 1 ${s.state}, pot ${s.potSats}, rejected ${rebuilt.rejected.length}`);
if (s.state !== 'paid' || s.potSats !== 40_000 || rebuilt.rejected.length) throw new Error('replay disagrees with the live round');
console.log('E2E OK');
