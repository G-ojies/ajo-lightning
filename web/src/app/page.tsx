import Link from 'next/link';
import CreateCircleForm from '@/components/CreateCircleForm';
import HeroDial from '@/components/HeroDial';
import SiteHeader from '@/components/SiteHeader';

const DEMO_CIRCLE = '40cb54ca';

const STEPS = [
  ['Pay over Lightning', 'Each contribution is a Lightning invoice, settled in seconds.'],
  ['Every payment is signed', 'A receipt carries the payment’s proof, so the record is not just the organiser’s word.'],
  ['Anyone can check', 'The verify page rebuilds the whole circle from those receipts on your own phone.'],
  ['The pot does not wait', 'It goes to that round’s member as soon as everyone has paid.'],
];

export default function Home() {
  return (
    <>
      <div className="shell">
        <SiteHeader>
          <Link className="nav-link" href={`/c/${DEMO_CIRCLE}`}>See a live circle</Link>
        </SiteHeader>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Ajo · Esusu · Adashe · Susu</p>
            <h1>Your ajo, with a record nobody can quietly change.</h1>
            <p className="lede">
              Millions of us save this way. Everyone pays in each round and one person takes the pot. It works until the
              organiser disappears, or nobody can agree who paid.
            </p>
            <div className="cta">
              <a className="button" href="#start">Start a circle</a>
              <Link className="button secondary" href={`/c/${DEMO_CIRCLE}`}>See a live circle</Link>
            </div>
          </div>
          <div className="hero-panel adire"><HeroDial /></div>
        </section>

        <section aria-labelledby="how">
          <h2 id="how" className="section-title">How this one is different</h2>
          <ol className="steps-grid">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="step-num">{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="start" id="start">
          <div className="start-copy">
            <h2 className="section-title">Start a circle</h2>
            <p>Name it, list your members and set the amount. Each person gets a test wallet, so you can play a full circle right now.</p>
            <p className="notice">
              <strong>Test sats only.</strong> This demo runs on a test Lightning ledger, so no real money moves.
              Naira amounts use the live BTC rate.
            </p>
          </div>
          <CreateCircleForm />
        </section>
      </div>
      <footer className="site-footer">Built for the Dakar Bitcoin Hack by BTrust.</footer>
    </>
  );
}
