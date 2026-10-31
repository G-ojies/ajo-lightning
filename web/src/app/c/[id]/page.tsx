import CircleDashboard from '@/components/CircleDashboard';
import SiteHeader from '@/components/SiteHeader';

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="shell">
      <SiteHeader />
      <CircleDashboard id={id} />
    </main>
  );
}
