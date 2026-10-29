import { NextResponse } from 'next/server';
import { viewCircle } from '@/lib/circles';
import { ngnPerSat } from '@/lib/rate';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const view = await viewCircle((await params).id);
  if (!view) return NextResponse.json({ error: 'Circle not found' }, { status: 404 });
  return NextResponse.json({ ...view, ngnPerSat: await ngnPerSat() });
}
