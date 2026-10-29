import Link from 'next/link';
import CircleDashboard from '@/components/CircleDashboard';

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <Link className="brand" href="/">AJO<span>⚡</span></Link>
      <CircleDashboard id={id} />
    </main>
  );
}
