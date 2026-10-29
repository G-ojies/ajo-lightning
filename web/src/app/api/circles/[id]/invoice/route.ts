import { requestInvoice } from '@/lib/circles';
import { act } from '@/lib/route';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { pubkey } = (await req.json().catch(() => ({}))) as { pubkey?: string };
  const { id } = await params;
  return act(() => requestInvoice(id, String(pubkey)));
}
