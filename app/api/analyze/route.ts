import { NextResponse } from 'next/server';

function classify(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes('spotify.com') || lower.includes('spotify.link')) return 'spotify';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (/\.(mp3|m4a|wav|ogg|mp4|webm|mov)(\?|$)/i.test(value)) return 'direct';
  return 'other';
}

function getSpotifyEntity(value: string) {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  if (host !== 'open.spotify.com') return null;

  const [kind, id] = parsed.pathname.split('/').filter(Boolean);
  const supported = new Set(['playlist', 'album', 'track', 'artist', 'show', 'episode']);
  if (!kind || !id || !supported.has(kind)) return null;

  const cleanId = id.split('?')[0];
  const canonicalUrl = `https://open.spotify.com/${kind}/${cleanId}`;
  const embedUrl = `https://open.spotify.com/embed/${kind}/${cleanId}?utm_source=generator&theme=0`;

  return { kind, id: cleanId, canonicalUrl, embedUrl };
}

async function getSpotifyPreview(value: string) {
  const entity = getSpotifyEntity(value);
  if (!entity) return null;

  let title = entity.kind === 'playlist' ? 'Playlist do Spotify' : 'Conteúdo do Spotify';
  let thumbnail: string | null = null;

  try {
    const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(entity.canonicalUrl)}`;
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });

    if (response.ok) {
      const data = await response.json();
      if (typeof data?.title === 'string' && data.title.trim()) title = data.title.trim();
      if (typeof data?.thumbnail_url === 'string') thumbnail = data.thumbnail_url;
    }
  } catch {
    // A prévia oficial via iframe continua funcionando mesmo se o oEmbed falhar.
  }

  return {
    ...entity,
    title,
    thumbnail,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const value = String(body?.url ?? '').trim();

  try {
    new URL(value);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        source: 'invalid',
        label: 'Link inválido',
        message: 'Informe uma URL completa para continuar.',
        canProcess: false,
      },
      { status: 400 },
    );
  }

  const source = classify(value);

  if (source === 'youtube') {
    return NextResponse.json({
      ok: true,
      source,
      label: 'Link do YouTube reconhecido',
      message: 'A origem foi reconhecida. O LUMEO não contorna proteções nem extrai conteúdo não autorizado.',
      canProcess: false,
    });
  }

  if (source === 'spotify') {
    const preview = await getSpotifyPreview(value);

    if (preview) {
      const isPlaylist = preview.kind === 'playlist';
      return NextResponse.json({
        ok: true,
        source,
        kind: preview.kind,
        label: isPlaylist ? 'Playlist do Spotify encontrada' : 'Conteúdo do Spotify encontrado',
        message: isPlaylist
          ? 'Prévia oficial carregada. Você pode visualizar e reproduzir as faixas pelo player do Spotify sem extrair o áudio.'
          : 'Prévia oficial carregada pelo Spotify.',
        canProcess: false,
        canPreview: true,
        title: preview.title,
        thumbnail: preview.thumbnail,
        canonicalUrl: preview.canonicalUrl,
        embedUrl: preview.embedUrl,
        spotifyId: preview.id,
      });
    }

    return NextResponse.json({
      ok: true,
      source,
      label: 'Link do Spotify reconhecido',
      message: 'O link foi reconhecido, mas não foi possível montar a prévia oficial deste formato.',
      canProcess: false,
      canPreview: false,
    });
  }

  if (source === 'direct') {
    return NextResponse.json({
      ok: true,
      source,
      label: 'Arquivo direto detectado',
      message: 'A URL parece apontar diretamente para uma mídia e pode ser encaminhada ao pipeline quando a origem permitir.',
      canProcess: true,
    });
  }

  return NextResponse.json({
    ok: true,
    source,
    label: 'Link reconhecido',
    message: 'Fonte genérica detectada. Verifique se você possui autorização para processar esse conteúdo.',
    canProcess: false,
  });
}
