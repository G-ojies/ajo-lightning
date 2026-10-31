# Ajo on Lightning

Rotating savings circles (ajo, esusu, adashe, susu) paid over Lightning, with a public record on Nostr so nobody has
to take the organiser's word for who paid.

- Each contribution is a Lightning invoice paid into the circle's pot.
- Every contribution and payout is published as a Nostr event signed by the circle's key, carrying the Lightning
  preimage, so anyone can check sha256(preimage) against the payment hash.
- The verify page downloads only those events and rebuilds the whole circle in the browser.
- The pot pays out to the round's member as soon as everyone has paid. Late fees go into the same round's pot.
- The payout order is drawn with sha256 from the circle id, so anyone can recheck the draw.

## Layout

- `core/`: the circle rules (`index.ts`), Nostr receipts and replay (`receipts.ts`), and a small LNbits client
  (`lnbits.ts`), plus a BOLT11 invoice encoder (`bolt11.ts`). Pure TypeScript, runs in Node and the browser. `npm test` runs 29 tests.
- `web/`: Next.js app (create circle, round dashboard with QR invoices, payout, verify page).

## Run it locally

The demo uses LNbits with its FakeWallet funding source: the sats are not real.

1. Start LNbits: `./run-lnbits.sh` (127.0.0.1:5001; needs the Python 3.12 venv at `~/.local/lnbits-venv`).
2. `web/.env.local` needs `LNBITS_URL`, `LNBITS_ADMIN_USER`, `LNBITS_ADMIN_PASSWORD` and `AJO_DATA_DIR`.
3. `cd web && npm install && npm run build && npx next start -p 3040`, then open http://127.0.0.1:3040.

`core/scripts/round-e2e.ts` plays a full round against LNbits and checks that replaying the receipts gives the same
result as the live round.

## Hosted mode

The hosted demo needs no LNbits or disk. `AJO_LIGHTNING=embedded` swaps in a small test ledger
(`web/src/lib/test-lightning.ts`) that issues signed BOLT11 invoices for signet and keeps each preimage secret until
the invoice is paid. No real sats move and real wallets cannot pay these invoices. `KV_REST_API_URL` and
`KV_REST_API_TOKEN` move storage and locks to Upstash Redis.

## Limits of the demo

- Each member gets a funded test wallet and a server-generated Nostr key so a whole circle can be played from one
  screen. In real use members pay from their own Lightning wallets and hold their own keys.
- The coordinator key signs receipts; it can refuse to record a payment, but it cannot forge one, because every
  receipt must carry a preimage that matches a real Lightning payment hash.
- Receipts are served by the app at `/api/circles/<id>/events`; publishing them to public Nostr relays is the next step.
