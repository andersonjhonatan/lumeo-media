import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.source) return NextResponse.json({ error: 'source é obrigatório' }, { status: 400 });
  return NextResponse.json({ id: crypto.randomUUID(), status: 'queued', progress: 0, createdAt: new Date().toISOString() }, { status: 201 });
}
