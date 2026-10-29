'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import type { CircleView } from '@/lib/circles';
import { day, naira, sats, when } from '@/lib/format';

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

  if (missing) return <div className="card">This circle does not exist. <Link href="/">Start one</Link>.</div>;
  if (!view) return <p className="muted">Loading circle…</p>;

  const { config, status, ngnPerSat } = view;
  const nameOf = (pk: string) => config.members.find(m => m.pubkey === pk)?.name ?? pk.slice(0, 8);
  const target = config.contributionSats * config.members.length;
  const ngn = (n: number) => naira(n, ngnPerSat);

  return (
    <>
      <h1>{config.name}</h1>
      <p className="muted">
        {config.members.length} members · {sats(config.contributionSats)}{ngn(config.contributionSats) && ` (${ngn(config.contributionSats)})`} each,
        every {config.roundLengthDays} day{config.roundLengthDays > 1 ? 's' : ''}
      </p>

      {message && <div className={message.ok ? 'ok' : 'errors'}>{message.text}</div>}

      {status ? (
        <div className="card">
          <div className="pot">
            <div>
              <div className="muted small">Round {status.round} of {view.rounds} · pot for <strong>{nameOf(status.recipient)}</strong></div>
              <div className="big">{sats(status.potSats)}</div>
              {ngn(status.potSats) && <div className="muted">{ngn(status.potSats)}</div>}
            </div>
            <div className="small muted">Due {when(status.dueAt)}<br />Grace {config.graceHours}h, late fee {sats(config.latePenaltySats)}</div>
          </div>
          <div className="progress"><div style={{ width: `${Math.min(100, (status.potSats / target) * 100)}%` }} /></div>
          <div className="small muted">{status.paid.length} of {config.members.length} paid</div>

          {status.state === 'ready-to-pay' && (
            <button className="gold full" style={{ marginTop: 14 }} disabled={busy !== null}
              onClick={() => run('payout', async () => {
                const r = await post<{ recipient: string; amountSats: number }>(`/api/circles/${id}/payout`);
                return `Paid ${sats(r.amountSats)} to ${r.recipient}. Payout receipt published.`;
              })}>
              {busy === 'payout' ? 'Paying out…' : `Everyone has paid: send ${sats(status.potSats)} to ${nameOf(status.recipient)}`}
            </button>
          )}
        </div>
      ) : (
        <div className="card ok">This circle is complete: every member has collected the pot once.</div>
      )}

      {invoice && (
        <div className="card invoice" id="invoice">
          <h2>{invoice.name} pays {sats(invoice.amountSats)}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR is a generated data URL, nothing to optimise */}
          <img src={invoice.qr} alt="Lightning invoice QR code" />
          <p className="small muted">Scan with any Lightning wallet. This page updates by itself when it is paid.</p>
          <p className="bolt11">{invoice.bolt11}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="secondary" onClick={() => navigator.clipboard.writeText(invoice.bolt11)}>Copy invoice</button>
            <button className="secondary" onClick={() => setInvoice(null)}>Close</button>
          </div>
        </div>
      )}

      {status && (
        <div className="card">
          <h2>This round</h2>
          <ul className="members">
            {config.members.map(m => {
              const paid = status.paid.includes(m.pubkey);
              const late = status.late.includes(m.pubkey);
              const owed = status.owed[m.pubkey];
              return (
                <li key={m.pubkey}>
                  <div>
                    <div className="who">{m.name}{m.pubkey === status.recipient && ' 🎉'}</div>
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
                        {busy === `pay-${m.pubkey}` ? 'Paying…' : 'Pay (test wallet)'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Who collects when</h2>
        <table className="schedule">
          <tbody>
            {view.schedule.map(s => (
              <tr key={s.round} className={s.round === view.round ? 'now' : undefined}>
                <td>Round {s.round}</td>
                <td>{s.name}</td>
                <td className="small">{day(s.dueAt)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'normal' }}>{s.paidOutSats ? `✓ ${sats(s.paidOutSats)}` : s.round === view.round ? 'now' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Order drawn from the circle id with sha256, so anyone can recheck it.</p>
      </div>

      <div className="card">
        <h2>Public record</h2>
        <p className="small muted">Every payment below is a signed Nostr event carrying the Lightning proof of payment.</p>
        <Link className="button secondary" href={`/c/${id}/verify`}>Verify this circle yourself</Link>
        {view.receipts.length === 0 && <p className="small muted" style={{ marginTop: 12 }}>No payments yet.</p>}
        {view.receipts.map(r => (
          <div className="receipt" key={r.id}>
            {r.action === 'payout' ? '🎉 Payout' : 'Paid in'} · round {r.round} · <strong>{r.name}</strong> · {sats(r.amountSats)}
            <div className="mono muted">event {r.id.slice(0, 16)}…</div>
          </div>
        ))}
      </div>
    </>
  );
}
