# Dakar Bitcoin Hack: Ajo on Lightning

Hackathon: https://dakar-bitcoin-hack-2026.devpost.com (BTrust, registered 2026-10-29, solo, Africa residents only).
Deadline: **20 Nov 2026** (check the exact time on the page before the last week).
Prizes: 500,000 / 250,000 / 100,000 sats.
Needs: a presentation (text or video), a public GitHub repo, an MVP online or a demo video.
Judged on usefulness and social impact, security by design, UX/UI, MVP, a clear pitch.

## The problem
Ajo (Yoruba), esusu, adashe, tontine, susu: rotating savings circles are how millions of Africans save. Each round,
every member pays in a fixed amount and one member takes the whole pot, in an agreed order. They run on trust in the
organiser, and the common failures are: the organiser disappears with the pot, members dispute who paid, and late
or missing payments are argued about with no record.

## The app
A mobile-first web app:
1. **Create a circle:** amount per round (in sats, with the naira value shown), number of members, round length,
   payout order (fixed, random draw, or bid).
2. **Members join** with a Nostr key (generated for them if they have none) and a Lightning address for payouts.
3. **Each round:** every member gets a Lightning invoice; paying it is the contribution. The app shows who has paid.
4. **Payout:** when everyone has paid, the pot goes to that round's member over Lightning.
5. **Public record on Nostr:** every contribution and payout is published as a signed Nostr event (receipt hash,
   amount, round, member), so any member can verify the history without trusting the organiser or the server.
6. **Late payment rules** agreed at creation (grace period, penalty in sats), applied automatically.

Security by design: the server never holds keys for members; the pot sits in the circle's Lightning wallet only
between the last contribution and the payout (shown on screen); the full history is reproducible from Nostr.

## Stack
- Next.js (or plain Node + a small frontend), TypeScript.
- Lightning: **LNbits** REST API (create invoice, check payment, pay invoice), wallet backed by a free **Voltage
  Mutinynet** node or the LNbits demo, so the demo uses test sats. Mutinynet has 30 s blocks and a faucet.
- Nostr: nostr-tools, publish to 2-3 public relays.
- Deploy: Vercel free tier.

## Build steps
0. Done 2026-10-29: core/ has the circle rules (validation, verifiable random payout order from a seed, round schedule, contributions, late penalties, payouts) with 17 vitest tests.
1. Me: scaffold, data model, circle and round logic with tests.
2. Done 2026-10-29: Lightning = **own LNbits 1.6.2 with FakeWallet** (user's choice). demo.lnbits.com is MAINNET (lnbc invoices, real sats) and Voltage has no public sign-up, so both were dropped. Local: `./run-lnbits.sh` (127.0.0.1:5001, Python 3.12 venv at ~/.local/lnbits-venv via uv, bitstring pinned 4.2.3, admin login in .lnbits-data/admin.txt). Top up test wallets with PUT /users/api/v1/balance using an admin session. `core/scripts/round-e2e.ts` runs a full round (4 payments + payout) and passes.
3. Done 2026-10-29: LNbits client + Nostr receipts (core/src/receipts.ts, kind 4041, coordinator-signed, preimage proof, replay() rebuilds the circle; 9 tests). e2e round now signs 6 events and the replay matches. Relay publishing not built yet (needs a yes before posting to public relays).
4. Done 2026-10-29: web/ Next.js 15 app (create circle, QR invoices + test-wallet pay, payout, schedule, receipts, in-browser verify page, naira via CoinGecko). Full round played through the API; phone screenshots checked. Run: run-lnbits.sh + `cd web && npx next start -p 3040`. Still open: publish receipts to public relays (ask first), hosting for a live link, Yoruba/Pidgin labels.
4b. Done 2026-10-31 : hosted mode. `AJO_LIGHTNING=embedded` uses web/src/lib/test-lightning.ts (test ledger, valid signet BOLT11 from core/src/bolt11.ts, passes the strict Python bolt11 decoder); `KV_REST_API_URL/TOKEN` switch storage and locks to Upstash (web/src/lib/kv.ts, keys prefixed `ajo:`). LIVE 2026-10-31 at https://ajo-lightning.vercel.app (auto-deploys from main); full round with 4 concurrent payments passed on real Upstash. Demo circle: /c/f19abe04. Local LNbits stays the default.
5. Me: deploy, seed a demo circle of 5 members, write the pitch; you record a short demo video.

## Timeline (3 weeks)
- By 4 Nov: logic + tests, Lightning test wallet working.
- By 11 Nov: full round end to end on Mutinynet, Nostr receipts.
- By 16 Nov: UI polish, deploy, pitch + video. Submit by 18 Nov.
