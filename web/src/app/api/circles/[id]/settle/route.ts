import { settle } from '@/lib/circles';
import { act } from '@/lib/route';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { paymentHash } = (await req.json().catch(() => ({}))) as { paymentHash?: string };
  const { id } = await params;
  return act(() => settle(id, String(paymentHash)));
}
