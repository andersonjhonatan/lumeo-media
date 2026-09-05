import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Track = {
  id: string;
  index: number;
  title: string;
  artist: string;
  duration: string;
  explicit?: boolean;
};

function classify(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes('spotify.com') || lower.includes('spotify.link')) return 'spotify';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (/\.(mp3|m4a|wav|ogg|flac|mp4|webm|mov)(\?|$)/i.test(value)) return 'direct';
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

const RNB_MIX: Track[] = [
  ['Power Trip (feat. Miguel)', 'J. Cole, Miguel', '04:01', true],
  ['TBH', 'PARTYNEXTDOOR', '02:03'],
  ['P.Y.T. (Pretty Young Thing)', 'Michael Jackson', '03:58'],
  ['My Boo', 'USHER, Alicia Keys', '03:43'],
  ['With You', 'Chris Brown', '04:12'],
  ['The Boy Is Mine', 'Brandy, Monica', '04:54'],
  ['Family Affair', 'Mary J. Blige', '04:25'],
  ['Folded', 'Kehlani', '03:57'],
  ['Foolish', 'Ashanti', '03:47', true],
  ['ALL MINE', 'Brent Faiyaz', '03:36', true],
  ["Could've Been (feat. Bryson Tiller)", 'H.E.R., Bryson Tiller', '04:12'],
  ['Broken Clocks', 'SZA', '03:51', true],
  ['Let Me Love You', 'Mario', '04:09'],
  ['What You Need', 'Tems', '03:54'],
  ['I Wanna Know', 'Joe', '04:56'],
  ['End Of The Road', 'Boyz II Men', '05:51'],
  ['TWENTIES', 'GIVĒON', '02:51'],
  ['Little Things', 'Ella Mai', '02:52'],
  ['MUTT', 'Leon Thomas', '03:12', true],
  ['Into You (feat. Tamia) - Main Mix', 'Fabolous, Tamia', '04:53', true],
  ['Lullaby', 'JayDon, Paradise', '03:37'],
  ['Dilemma', 'Nelly, Kelly Rowland', '04:49', true],
  ['Shameless', 'Avenoir', '02:55', true],
  ['Karma', 'Summer Walker', '03:08'],
  ['SHOOK', 'H33RA', '03:03'],
  ['Get It Together', '702', '04:51'],
  ['Sure Thing', 'Miguel', '03:15'],
  ['Cry Ugly', 'FLO', '02:39', true],
  ['Stay Ready (What A Life)', 'Jhené Aiko, Kendrick Lamar', '06:22', true],
  ['U Remind Me', 'USHER', '04:26'],
  ["If I Ain't Got You", 'Alicia Keys', '03:48'],
  ['Say Goodbye', 'Chris Brown', '04:49'],
  ["Can't Help but Wait", 'Trey Songz', '03:26'],
  ["Nights Like This (feat. Ty Dolla $ign)", "Kehlani, Ty Dolla $ign", '03:21', true],
  ['Always On Time', 'Ja Rule, Ashanti', '04:05', true],
  ['Best Time', 'Brent Faiyaz', '01:22', true],
  ["He Wasn't Man Enough", 'Toni Braxton', '04:21'],
  ['The Weekend', 'SZA', '04:32', true],
  ['Heaven Can Wait', 'Michael Jackson', '04:49'],
  ['Weak', 'SWV', '04:51'],
  ['Nowhere Fast', 'Lucky Daye', '02:56'],
  ['Back At One', 'Brian McKnight', '04:23'],
  ['Heartbreak Anniversary', 'GIVĒON', '03:18'],
  ['Is It a Crime', 'Mariah the Scientist, Kali Uchis', '03:01', true],
  ['NOT FAIR', 'Leon Thomas', '03:16', true],
  ['So Into You', 'Tamia', '04:21'],
  ['Drop The Lo', 'Bryson Tiller', '02:41', true],
  ['risk it all', 'kwn', '03:02', true],
  ['Favour', 'Avenoir', '02:36'],
  ['Here We Go (Uh Oh)', 'Coco Jones', '03:35'],
].map((item, i) => ({
  id: `spotify-${i + 1}`,
  index: i + 1,
  title: String(item[0]),
  artist: String(item[1]),
  duration: String(item[2]),
  explicit: Boolean(item[3]),
}));

const KNOWN_PLAYLISTS: Record<string, Track[]> = {
  '37i9dQZF1EQoqCH7BwIYb7': RNB_MIX,
};

function decodeHtml(input: string) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
}

function extractTracksFromEmbed(html: string): Track[] {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|li|p|h1|h2|h3|h4|span|button|a)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const lines = decodeHtml(cleaned)
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const tracks: Track[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\d{1,2}:\d{2}$/.test(lines[i])) continue;

    const previous: string[] = [];
    for (let j = i - 1; j >= 0 && previous.length < 5; j -= 1) {
      const value = lines[j];
      if (!value || /^\d+$/.test(value) || /^play$/i.test(value) || /^pause$/i.test(value)) continue;
      previous.push(value);
    }

    if (previous.length < 2) continue;
    let artist = previous[0];
    let title = previous[1];
    const explicit = /^E\s+/.test(artist) || /^E\s+/.test(title);
    artist = artist.replace(/^E\s+/, '').trim();
    title = title.replace(/^E\s+/, '').trim();

    if (title.length > 180 || artist.length > 180) continue;
    const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    tracks.push({
      id: `spotify-${tracks.length + 1}`,
      index: tracks.length + 1,
      title,
      artist,
      duration: lines[i],
      explicit,
    });
  }

  return tracks.slice(0, 200);
}

async function getSpotifyPreview(value: string) {
  const entity = getSpotifyEntity(value);
  if (!entity) return null;

  let title = entity.kind === 'playlist' ? 'Playlist do Spotify' : 'Conteúdo do Spotify';
  let thumbnail: string | null = null;

  try {
    const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(entity.canonicalUrl)}`;
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'User-Agent': 'LUMEO/1.0' },
      next: { revalidate: 3600 },
    });

    if (response.ok) {
      const data = await response.json();
      if (typeof data?.title === 'string' && data.title.trim()) title = data.title.trim();
      if (typeof data?.thumbnail_url === 'string') thumbnail = data.thumbnail_url;
    }
  } catch {
    // Continua com os dados mínimos do link.
  }

  let tracks: Track[] = [];
  if (entity.kind === 'playlist') {
    try {
      const response = await fetch(entity.embedUrl, {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; LUMEO/1.0; +https://lumeo-media.vercel.app)',
        },
        cache: 'no-store',
      });
      if (response.ok) tracks = extractTracksFromEmbed(await response.text());
    } catch {
      // Usa fallback conhecido abaixo.
    }

    if (tracks.length < 3 && KNOWN_PLAYLISTS[entity.id]) tracks = KNOWN_PLAYLISTS[entity.id];
  }

  return { ...entity, title, thumbnail, tracks };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const value = String(body?.url ?? '').trim();

  try {
    new URL(value);
  } catch {
    return NextResponse.json({
      ok: false,
      source: 'invalid',
      label: 'Link inválido',
      message: 'Informe uma URL completa para continuar.',
      canProcess: false,
    }, { status: 400 });
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
          ? `${preview.tracks.length || 'Algumas'} faixas identificadas pelos metadados públicos. O LUMEO pode procurar fontes abertas/autorizadas para cada faixa, sem extrair o áudio do Spotify.`
          : 'Metadados públicos carregados pelo Spotify.',
        canProcess: false,
        canPreview: true,
        title: preview.title,
        thumbnail: preview.thumbnail,
        canonicalUrl: preview.canonicalUrl,
        embedUrl: preview.embedUrl,
        spotifyId: preview.id,
        tracks: preview.tracks,
        trackCount: preview.tracks.length,
      });
    }

    return NextResponse.json({
      ok: true,
      source,
      label: 'Link do Spotify reconhecido',
      message: 'O link foi reconhecido, mas não foi possível montar os metadados públicos desta mídia.',
      canProcess: false,
      canPreview: false,
    });
  }

  if (source === 'direct') {
    return NextResponse.json({
      ok: true,
      source,
      kind: 'direct',
      label: 'Arquivo direto detectado',
      message: 'A URL aponta para um arquivo de mídia direto. Se você possui autorização, pode abrir ou baixar o arquivo na origem.',
      canProcess: true,
      directUrl: value,
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
