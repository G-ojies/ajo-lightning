import { NextResponse } from 'next/server';
import { publicEvents } from '@/lib/circles';

// The public record: everything a member needs to verify the circle, and nothing secret.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const pub = await publicEvents((await params).id);
  if (!pub) return NextResponse.json({ error: 'Circle not found' }, { status: 404 });
  return NextResponse.json(pub);
}
