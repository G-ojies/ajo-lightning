'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import type { CircleView } from '@/lib/circles';
import { day, naira, sats, when } from '@/lib/format';
import CircleDial, { type Seat } from './CircleDial';

type View = CircleView & { ngnPerSat: number | null };
interface OpenInvoice { pubkey: string; name: string; bolt11: string; paymentHash: string; amountSats: number; qr: string }

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data as T;
}

export default function CircleDashboard({ id }: { id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [invoice, setInvoice] = useState<OpenInvoice | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/circles/${id}`, { cache: 'no-store' });
    if (res.status === 404) return setMissing(true);
    if (res.ok) setView(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  // Bring a newly opened invoice into view (on a phone it opens below the pot card).
  const openHash = invoice?.paymentHash;
  useEffect(() => {
    if (openHash) document.getElementById('invoice')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openHash]);

  // While an invoice is open, check every few seconds whether it has been paid.
  useEffect(() => {
    if (!invoice) return;
    const t = setInterval(async () => {
      const r = await post<{ paid: boolean }>(`/api/circles/${id}/settle`, { paymentHash: invoice.paymentHash }).catch(() => null);
      if (r?.paid) {
        setMessage({ ok: true, text: `${invoice.name}'s ${sats(invoice.amountSats)} arrived. Receipt published.` });
        setInvoice(null);
        load();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [invoice, id, load]);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await fn() });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (missing) return <div className="card empty"><h2>This circle does not exist</h2><p>It may have expired. <Link href="/#start">Start a new one</Link>.</p></div>;
  if (!view) return <div className="split" aria-label="Loading circle"><div className="skeleton tall" /><div className="skeleton tall" /></div>;

  const { config, status, ngnPerSat } = view;
  const nameOf = (pk: string) => config.members.find(m => m.pubkey === pk)?.name ?? pk.slice(0, 8);
  const ngn = (n: number) => naira(n, ngnPerSat);
  const seats: Seat[] = config.members.map(m => ({
    key: m.pubkey,
    name: m.name,
    state: !status || status.paid.includes(m.pubkey) ? 'paid' : status.late.includes(m.pubkey) ? 'late' : 'owed',
    collects: m.pubkey === status?.recipient,
  }));

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{config.members.length} members · every {config.roundLengthDays} day{config.roundLengthDays > 1 ? 's' : ''}</p>
        <h1>{config.name}</h1>
        <p className="lede">
          {sats(config.contributionSats)}{ngn(config.contributionSats) && ` (${ngn(config.contributionSats)})`} each round. Grace {config.graceHours}h, late fee {sats(config.latePenaltySats)}.
        </p>
      </div>

      <div className="toast-slot" aria-live="polite">
        {message && <div className={message.ok ? 'ok' : 'errors'}>{message.text}</div>}
      </div>

      <div className="split">
        <aside className="side">
          <div className="hero-panel adire">
            <CircleDial seats={seats} tone="indigo"
              label={status ? `Round ${status.round}: ${status.paid.length} of ${config.members.length} paid, ${nameOf(status.recipient)} collects.` : 'Every member has collected.'}>
              {status ? (
                <>
                  <div className="dial-kicker">Round {status.round} of {view.rounds}</div>
                  <div className="dial-amount">{status.potSats.toLocaleString('en-NG')}</div>
                  <div className="dial-kicker">sats{ngn(status.potSats) && ` · ${ngn(status.potSats)}`}</div>
                </>
              ) : (
                <>
                  <div className="dial-amount small">Complete</div>
                  <div className="dial-kicker">Everyone has collected</div>
                </>
              )}
            </CircleDial>
            {status && (
              <div className="panel-foot">
                <span><strong>{nameOf(status.recipient)}</strong> collects · {status.paid.length} of {config.members.length} paid</span>
                <span>Due {when(status.dueAt)}</span>
              </div>
            )}
          </div>

          {status?.state === 'ready-to-pay' && (
            <button className="gold full" disabled={busy !== null}
              onClick={() => run('payout', async () => {
                const r = await post<{ recipient: string; amountSats: number }>(`/api/circles/${id}/payout`);
                return `Paid ${sats(r.amountSats)} to ${r.recipient}. Payout receipt published.`;
              })}>
              {busy === 'payout' ? 'Paying out…' : `Send ${sats(status.potSats)} to ${nameOf(status.recipient)}`}
            </button>
          )}

          {invoice && (
            <div className="card invoice" id="invoice">
              <h2>{invoice.name} pays {sats(invoice.amountSats)}</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR is a generated data URL, nothing to optimise */}
              <img src={invoice.qr} alt="Lightning invoice QR code" />
              <p className="small muted">This demo invoice is test-only, so real wallets cannot pay it. Use Pay with test wallet. In a live circle, members scan this with any Lightning wallet.</p>
              <p className="bolt11">{invoice.bolt11}</p>
              <div className="button-row">
                <button className="secondary" onClick={() => navigator.clipboard.writeText(invoice.bolt11)}>Copy invoice</button>
                <button className="secondary" onClick={() => setInvoice(null)}>Close</button>
              </div>
            </div>
          )}
        </aside>

        <div className="main-col">
          {status && (
            <section className="card">
              <h2>This round</h2>
              <ul className="members">
                {config.members.map(m => {
                  const paid = status.paid.includes(m.pubkey);
                  const late = status.late.includes(m.pubkey);
                  const owed = status.owed[m.pubkey];
                  return (
                    <li key={m.pubkey}>
                      <span className={`avatar ${paid ? 'paid' : late ? 'late' : ''}`} aria-hidden="true">{m.name.slice(0, 1).toUpperCase()}</span>
                      <div className="who-wrap">
                        <div className="who">{m.name}{m.pubkey === status.recipient && <span className="pill collects">Collects</span>}</div>
                        {paid ? <span className="pill paid">Paid</span>
                          : <span className={`pill ${late ? 'late' : 'owed'}`}>{late ? 'Late · ' : 'Owes '}{sats(owed)}</span>}
                      </div>
                      {!paid && (
                        <div className="actions">
                          <button className="secondary" disabled={busy !== null}
                            onClick={() => run(`inv-${m.pubkey}`, async () => {
                              const r = await post<{ bolt11: string; paymentHash: string; amountSats: number }>(`/api/circles/${id}/invoice`, { pubkey: m.pubkey });
                              const qr = await QRCode.toDataURL(`lightning:${r.bolt11}`.toUpperCase(), { margin: 1, width: 440 });
                              setInvoice({ pubkey: m.pubkey, name: m.name, qr, ...r });
                              return `Invoice ready for ${m.name}.`;
                            })}>
                            Invoice
                          </button>
                          <button disabled={busy !== null}
                            onClick={() => run(`pay-${m.pubkey}`, async () => {
                              await post(`/api/circles/${id}/demo-pay`, { pubkey: m.pubkey });
                              return `${m.name} paid from their test wallet. Receipt published.`;
                            })}>
                            {busy === `pay-${m.pubkey}` ? 'Paying…' : 'Pay with test wallet'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>Who collects when</h2>
            <ol className="timeline">
              {view.schedule.map(s => (
                <li key={s.round} className={s.paidOutSats ? 'done' : s.round === view.round ? 'now' : undefined}>
                  <span className="t-round">{s.round}</span>
                  <span className="t-name">{s.name}</span>
                  <span className="t-date">{day(s.dueAt)}</span>
                  <span className="t-state">{s.paidOutSats ? `Paid ${sats(s.paidOutSats)}` : s.round === view.round ? 'Now' : ''}</span>
                </li>
              ))}
            </ol>
            <p className="hint">Order drawn from the circle id with sha256, so anyone can recheck it.</p>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Public record</h2>
              <Link className="button secondary" href={`/c/${id}/verify`}>Verify this circle</Link>
            </div>
            <p className="small muted">Each entry is a signed Nostr event carrying the Lightning proof of payment.</p>
            {view.receipts.length === 0 && <p className="small muted">No payments yet. The first member to pay appears here.</p>}
            {view.receipts.map(r => (
              <div className={`receipt${r.action === 'payout' ? ' payout' : ''}`} key={r.id}>
                <div><strong>{r.name}</strong> {r.action === 'payout' ? 'collected' : 'paid in'} {sats(r.amountSats)} <span className="muted">· round {r.round}</span></div>
                <div className="mono muted">event {r.id.slice(0, 16)}…</div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
