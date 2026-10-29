import Link from 'next/link';
import CreateCircleForm from '@/components/CreateCircleForm';

export default function Home() {
  return (
    <main>
      <Link className="brand" href="/">AJO<span>⚡</span></Link>
      <h1>Your ajo, without trusting the organiser.</h1>
      <p className="muted">
        Ajo, esusu, adashe, susu: millions of us save this way. Everyone pays in each round and one person takes the
        pot. It works until the organiser disappears, or nobody can agree who paid.
      </p>

      <div className="card">
        <h2>How this one is different</h2>
        <ol className="steps">
          <li><strong>Pay over Lightning.</strong> Each contribution is a Lightning invoice, settled in seconds from any wallet.</li>
          <li><strong>Every payment is signed and public.</strong> A receipt with the payment&apos;s proof goes on Nostr, so the record is not just the organiser&apos;s word.</li>
          <li><strong>Anyone can check.</strong> The verify page rebuilds the whole circle from those receipts on your own phone.</li>
          <li><strong>The pot only waits as long as it must.</strong> It pays out to that round&apos;s member as soon as everyone has paid.</li>
        </ol>
      </div>

      <CreateCircleForm />

      <p className="small muted">
        This demo runs on a test Lightning wallet: the sats are not real, and every member gets a funded test wallet so
        you can play a full circle. Amounts in naira use the live BTC rate.
      </p>
      <footer>Built for the Dakar Bitcoin Hack by BTrust.</footer>
    </main>
  );
}
