import Link from 'next/link';

export default function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Ajo home">
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="15.6 4" />
          <path d="M18 7.5 10.5 17.5h5l-1.5 7 7.5-10h-5z" className="brand-bolt" />
        </svg>
        Ajo
      </Link>
      {children}
    </header>
  );
}
