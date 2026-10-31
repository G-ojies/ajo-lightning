import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import VerifyCircle from '@/components/VerifyCircle';

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="shell">
      <SiteHeader><Link className="nav-link" href={`/c/${id}`}>Back to the circle</Link></SiteHeader>
      <VerifyCircle id={id} />
    </main>
  );
}
