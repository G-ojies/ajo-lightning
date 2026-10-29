import { payout } from '@/lib/circles';
import { act } from '@/lib/route';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return act(() => payout(id));
}
