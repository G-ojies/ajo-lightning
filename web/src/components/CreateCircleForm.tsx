'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CreateCircleForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErrors([]);
    const res = await fetch('/api/circles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: f.get('name'),
        contributionSats: Number(f.get('contributionSats')),
        roundLengthDays: Number(f.get('roundLengthDays')),
        graceHours: Number(f.get('graceHours')),
        latePenaltySats: Number(f.get('latePenaltySats')),
        memberNames: String(f.get('members')).split('\n'),
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (res?.ok && data?.id) {
      router.push(`/c/${data.id}`);
      return;
    }
    setErrors(data?.errors ?? [data?.error ?? 'Could not reach the server. Try again.']);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card">
      <h2>Start a circle</h2>
      <label htmlFor="name">Circle name</label>
      <input id="name" name="name" defaultValue="Oja Oba market ajo" maxLength={60} required />

      <label htmlFor="members">Members, one per line</label>
      <textarea id="members" name="members" defaultValue={'Ada\nBayo\nChika\nDupe\nEmeka'} required />
      <p className="hint">Each round one member collects the whole pot. The order is drawn at random and anyone can recheck the draw.</p>

      <div className="row">
        <div>
          <label htmlFor="contributionSats">Each pays per round (sats)</label>
          <input id="contributionSats" name="contributionSats" type="number" min={100} max={1000000} defaultValue={10000} required />
        </div>
        <div>
          <label htmlFor="roundLengthDays">Days per round</label>
          <input id="roundLengthDays" name="roundLengthDays" type="number" min={1} max={31} defaultValue={7} required />
        </div>
      </div>
      <div className="row">
        <div>
          <label htmlFor="graceHours">Grace period (hours)</label>
          <input id="graceHours" name="graceHours" type="number" min={0} max={168} defaultValue={24} required />
        </div>
        <div>
          <label htmlFor="latePenaltySats">Late fee (sats)</label>
          <input id="latePenaltySats" name="latePenaltySats" type="number" min={0} defaultValue={500} required />
          <p className="hint">Goes into that round&apos;s pot.</p>
        </div>
      </div>

      {errors.length > 0 && <div className="errors">{errors.map(e => <div key={e}>{e}</div>)}</div>}
      <button type="submit" className="full" disabled={busy} style={{ marginTop: 16 }}>
        {busy ? 'Setting up wallets…' : 'Create circle'}
      </button>
    </form>
  );
}
