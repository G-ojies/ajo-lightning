import { NextResponse } from 'next/server';
import { createCircle, type NewCircle } from '@/lib/circles';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<NewCircle> | null;
  if (!body) return NextResponse.json({ errors: ['Send the circle details as JSON.'] }, { status: 400 });
  const res = await createCircle({
    name: String(body.name ?? ''),
    contributionSats: Number(body.contributionSats),
    roundLengthDays: Number(body.roundLengthDays),
    graceHours: Number(body.graceHours),
    latePenaltySats: Number(body.latePenaltySats),
    memberNames: Array.isArray(body.memberNames) ? body.memberNames.map(String) : [],
  });
  return NextResponse.json(res, { status: 'errors' in res ? 400 : 201 });
}
