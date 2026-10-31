'use client';

// Runs entirely in the browser: download the public events, check every signature and payment proof, and rebuild
// the circle. Nothing here trusts the server's own view of the circle.
import { useEffect, useState } from 'react';
import type { Event } from 'nostr-tools/pure';
import { currentRound, drawOrder, roundCount, roundStatus } from '@ajo/core';
import { checkEvent, replay, type Replay } from '@ajo/core/receipts';
import { sats } from '@/lib/format';

interface Result {
  coordinator: string;
  total: number;
  valid: number;
  replayed: Replay;
  drawMatches: boolean;
  rounds: Array<{ round: number; recipient: string; paidIn: number; paidOut: number | null; state: string }>;
}

export default function VerifyCircle({ id }: { id: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/circles/${id}/events`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not download this circle\'s events.');
      const { coordinatorPubkey, events } = (await res.json()) as { coordinatorPubkey: string; events: Event[] };
      const replayed = replay(events, id, coordinatorPubkey);
      const c = replayed.config;
      const now = new Date().toISOString();
      const nameOf = (pk: string) => c.members.find(m => m.pubkey === pk)?.name ?? pk.slice(0, 8);
      const upTo = currentRound(c, replayed.payouts) ?? roundCount(c);
      setResult({
        coordinator: coordinatorPubkey,
        total: events.length,
        valid: events.filter(e => checkEvent(e, coordinatorPubkey) === null).length,
        replayed,
        drawMatches: drawOrder(c.members.map(m => m.pubkey), c.id).join() === c.order.join(),
        rounds: Array.from({ length: upTo }, (_, i) => {
          const s = roundStatus(c, i + 1, replayed.contributions, replayed.payouts, now);
          return {
            round: i + 1, recipient: nameOf(s.recipient), paidIn: s.potSats,
            paidOut: replayed.payouts.find(p => p.round === i + 1)?.amountSats ?? null, state: s.state,
          };
        }),
      });
    })().catch(e => setError((e as Error).message));
  }, [id]);

  if (error) return <div className="errors">{error}</div>;
  if (!result) return <div className="skeleton tall" aria-label="Checking signatures and payment proofs on this device" />;

  const { replayed, rounds } = result;
  const allGood = result.valid === result.total && replayed.rejected.length === 0 && result.drawMatches
    && rounds.every(r => r.paidOut === null || r.paidOut === r.paidIn);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Checked on this device, not by the server</p>
        <h1>{replayed.config.name}</h1>
      </div>
      <div className={`verdict ${allGood ? 'good' : 'bad'}`}>
        <span className="verdict-mark" aria-hidden="true">{allGood ? '✓' : '!'}</span>
        <div>
          <strong>{allGood ? 'Everything checks out.' : 'Some records did not check out.'}</strong>
          <p>{allGood
            ? 'Every record is signed by the circle key, every payment proof matches, and every payout equals what was paid in.'
            : 'They are listed below and were not counted.'}</p>
        </div>
      </div>

      <div className="split even">
        <section className="card">
          <h2>What this page checked</h2>
          <ul className="checks">
            <li><strong>{result.valid} of {result.total}</strong> events carry a valid signature from the circle key <span className="mono">{result.coordinator.slice(0, 16)}…</span></li>
            <li><strong>{replayed.contributions.length + replayed.payouts.length} payments:</strong> for each, sha256(preimage) equals the Lightning payment hash.</li>
            <li>Payout order <strong>{result.drawMatches ? 'matches' : 'does NOT match'}</strong> the random draw from the circle id.</li>
            <li>{replayed.rejected.length === 0 ? 'No duplicate, forged or outsider records.' : `${replayed.rejected.length} record(s) rejected.`}</li>
          </ul>
        </section>

        <section className="card">
          <h2>Rebuilt from the receipts</h2>
          <ol className="timeline">
            {rounds.map(r => (
              <li key={r.round} className={r.paidOut !== null ? 'done' : 'now'}>
                <span className="t-round">{r.round}</span>
                <span className="t-name">{r.recipient}</span>
                <span className="t-date">in {sats(r.paidIn)}</span>
                <span className="t-state">{r.paidOut === null ? r.state : r.paidOut === r.paidIn ? `Out ${sats(r.paidOut)}` : `Mismatch: ${sats(r.paidOut)}`}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {replayed.rejected.length > 0 && (
        <div className="card">
          <h2>Rejected records</h2>
          {replayed.rejected.map(r => <div className="receipt" key={r.id}><code>{r.id.slice(0, 16)}…</code> {r.reason}</div>)}
        </div>
      )}

      <p className="small muted">
        Download the raw events at <a href={`/api/circles/${id}/events`}>/api/circles/{id}/events</a> to check them with any Nostr tool.
      </p>
    </>
  );
}
