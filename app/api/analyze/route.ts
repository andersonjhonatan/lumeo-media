import { NextResponse } from 'next/server';

function classify(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes('spotify.com')) return 'spotify';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (/\.(mp3|m4a|wav|ogg|mp4|webm|mov)(\?|$)/i.test(value)) return 'direct';
  return 'other';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const value = String(body?.url ?? '').trim();

  try { new URL(value); } catch {
    return NextResponse.json({ ok: false, source: 'invalid', label: 'Link inválido', message: 'Informe uma URL completa para continuar.', canProcess: false }, { status: 400 });
  }

  const source = classify(value);
  if (source === 'youtube') return NextResponse.json({ ok: true, source, label: 'Link do YouTube reconhecido', message: 'A interface reconhece a origem. O projeto não implementa contorno de proteções ou extração não autorizada.', canProcess: false });
  if (source === 'spotify') return NextResponse.json({ ok: true, source, label: 'Link do Spotify reconhecido', message: 'Pronto para fluxo de organização/metadados. O áudio protegido não é extraído pelo projeto.', canProcess: false });
  if (source === 'direct') return NextResponse.json({ ok: true, source, label: 'Arquivo direto detectado', message: 'A URL parece apontar diretamente para uma mídia e pode ser encaminhada ao pipeline quando a origem permitir.', canProcess: true });
  return NextResponse.json({ ok: true, source, label: 'Link reconhecido', message: 'Fonte genérica detectada. Verifique se você possui autorização para processar esse conteúdo.', canProcess: false });
}
