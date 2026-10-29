import Link from 'next/link';
import VerifyCircle from '@/components/VerifyCircle';

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <Link className="brand" href="/">AJO<span>⚡</span></Link>
      <p><Link href={`/c/${id}`}>← Back to the circle</Link></p>
      <VerifyCircle id={id} />
    </main>
  );
}
