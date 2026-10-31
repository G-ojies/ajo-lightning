# Ajo on Lightning: pitch and Devpost text

Live: https://ajo-lightning.vercel.app
Demo circle: https://ajo-lightning.vercel.app/c/40cb54ca
Repo: https://github.com/G-ojies/ajo-lightning

## Tagline
Rotating savings circles paid over Lightning, with a signed record every member can check.

## Inspiration
Ajo in Yoruba, esusu, adashe, susu, tontine: across Africa, people save by forming a circle. Each round everyone pays
in a fixed amount and one person takes the whole pot, until everyone has had a turn. It gives traders and workers a
lump sum that banks often will not.

It runs on one person's notebook and reputation. When it fails, it fails the same ways: the organiser disappears with
the pot, members argue about who paid, and late payments have no record. Everybody involved has a memory of a circle
that went wrong.

## What it does
- **Create a circle:** name, members, amount in sats with the naira value shown, round length, grace period and late fee.
- **Pay over Lightning:** each contribution is an invoice with a QR code, settled in seconds, and small amounts work.
- **Fair order:** the payout order is drawn with sha256 from the circle id, so anyone can recompute the draw.
- **Automatic pot:** the moment everyone has paid, the pot can go to that round's member. Late fees join the same pot.
- **Signed record:** every contribution and payout is a signed Nostr event carrying the Lightning preimage.
- **Verify it yourself:** the verify page downloads only those events and rebuilds the circle in your browser. It checks
  every signature, every preimage against its payment hash, the draw, and that each payout equals what was paid in.

## How we built it
- `core/`: TypeScript circle rules, receipts and replay, with 30 tests. The same code runs on the server and in the
  browser, which is why the verify page does not depend on the server's view.
- `web/`: Next.js, mobile first, with naira values from a live BTC rate.
- Lightning: an LNbits client tested against a local LNbits instance with a fake funding source, and a small embedded
  test ledger for the hosted demo. It issues valid signed BOLT11 invoices for signet, checked with a strict decoder.
- Nostr: receipts are signed Nostr events using nostr-tools (kind 4041). The demo circle's 10 events are live on
  nos.lol and relay.primal.net, so its record does not depend on this app staying online.

## Security by design
What it protects against:
- **"I paid" and "no you didn't":** the payer holds the invoice and preimage as their own proof.
- **Rewriting history:** the log is signed, and replay rejects duplicate, forged or outsider records.
- **False "paid" entries:** a receipt with no money behind it leaves the pot short at payout, in front of the recipient.
- **A rigged order:** the draw can be recomputed by anyone.
- **Secrets:** wallet keys and the signing key stay on the server. Only signed events are public.

What it does not solve yet, stated plainly:
- The demo is custodial: the coordinator holds the pot between the last contribution and the payout, and the time
  that money waits is kept as short as the rules allow.
- The coordinator issues invoices, so it knows preimages. A receipt shows a payment was recorded, not that money moved.
- The demo circle's receipts were published to nos.lol and relay.primal.net with a script. Automatic publishing for
  every circle is not built yet.
- Members get server-generated keys in the demo.

## Challenges
Real Lightning test infrastructure was the hardest part. Public demo instances turned out to be mainnet, and hosted
test nodes were not open to sign up. That is why the app separates the circle logic from the Lightning backend, so it
runs on LNbits locally and on a test ledger when hosted.

## What we learned
A receipt is not proof when the same party issues the invoice and signs the receipt. Writing the honest version of the
security model changed the roadmap below.

## What's next
1. Publish every circle's receipts to Nostr relays automatically.
2. Members hold their own keys and countersign what they received, so a payout cannot be claimed without the recipient.
3. Hold invoices, so contributions lock only when the full round has arrived and the organiser never holds a pot.
4. A pilot with one real market circle, plus Yoruba, Hausa, Igbo and Pidgin labels.

## Built with
TypeScript, Next.js, Lightning, BOLT11, LNbits, Nostr, nostr-tools, Upstash Redis, Vercel.

## Optional 60-second video
1. Home page, 8s: "When an ajo fails, it's because everything lives in one person's notebook."
2. Demo circle, 15s: show the ring, 3 of 5 paid. Click Pay with test wallet for Bisi and Musa. The ring fills.
3. Payout, 10s: click Send. "When everyone has paid, the pot goes straight to this round's member."
4. Verify page, 15s: "My phone just rebuilt the circle from signed receipts. It didn't take the server's word."
5. Close, 12s: "Test sats today. Real Lightning wallets and a real market circle next."
