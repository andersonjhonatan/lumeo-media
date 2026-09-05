import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestedTrack = {
  id: string;
  title: string;
  artist: string;
};

type ArchiveDoc = {
  identifier?: string;
  title?: string;
  creator?: string | string[];
  licenseurl?: string;
  rights?: string;
};

type ArchiveFile = {
  name?: string;
  format?: string;
  source?: string;
  size?: string;
};

type Alternative = {
  kind: 'store' | 'search';
  provider: string;
  url: string;
  label: string;
  price?: number;
  currency?: string;
  confidence?: number;
};

function lucene(value: string) {
  return value
    .replace(/[+\-!(){}\[\]^"~*?:]/g, ' ')
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similar(a: string, b: string) {
  const aa = new Set(normalize(a).split(' ').filter(Boolean));
  const bb = new Set(normalize(b).split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  aa.forEach(word => { if (bb.has(word)) hit += 1; });
  return hit / Math.max(aa.size, bb.size);
}

function scoreTrack(title: string, artist: string, candidateTitle: string, candidateArtist: string) {
  const titleScore = similar(title, candidateTitle);
  const artistScore = candidateArtist ? similar(artist, candidateArtist) : 0;
  return Math.round(((titleScore * 0.75) + (artistScore * 0.25)) * 100);
}

function isOpenLicense(value: unknown) {
  const text = String(value ?? '').toLowerCase();
  return text.includes('creativecommons.org') || text.includes('public domain') || text.includes('cc0');
}

function fileFormat(name: string) {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (ext === 'mp3') return 'mp3';
  if (ext === 'm4a' || ext === 'aac') return 'm4a';
  if (ext === 'wav') return 'wav';
  if (ext === 'ogg' || ext === 'oga') return 'ogg';
  if (ext === 'flac') return 'flac';
  return ext;
}

function chooseAudioFile(files: ArchiveFile[], preferred: string) {
  const usable = files.filter(file => {
    const name = String(file.name ?? '');
    const format = String(file.format ?? '').toLowerCase();
    return /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(name)
      || /mp3|mpeg audio|flac|ogg|wave|aac|m4a/.test(format);
  });

  const preferredMatch = usable.find(file => fileFormat(String(file.name ?? '')) === preferred);
  return preferredMatch || usable.find(file => String(file.source ?? '').toLowerCase() === 'original') || usable[0] || null;
}

async function archiveDownload(track: RequestedTrack, preferred: string) {
  const titleQ = lucene(track.title);
  const artistQ = lucene(track.artist.split(',')[0] || track.artist);
  const queries = [
    `mediatype:audio AND title:("${titleQ}") AND creator:("${artistQ}")`,
    `mediatype:audio AND title:("${titleQ}")`,
  ];

  for (const q of queries) {
    try {
      const endpoint = new URL('https://archive.org/advancedsearch.php');
      endpoint.searchParams.set('q', q);
      endpoint.searchParams.append('fl[]', 'identifier');
      endpoint.searchParams.append('fl[]', 'title');
      endpoint.searchParams.append('fl[]', 'creator');
      endpoint.searchParams.append('fl[]', 'licenseurl');
      endpoint.searchParams.append('fl[]', 'rights');
      endpoint.searchParams.set('rows', '5');
      endpoint.searchParams.set('page', '1');
      endpoint.searchParams.set('output', 'json');

      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json', 'User-Agent': 'LUMEO/1.1' },
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const data = await response.json();
      const docs = Array.isArray(data?.response?.docs) ? data.response.docs as ArchiveDoc[] : [];

      for (const doc of docs) {
        if (!doc.identifier) continue;
        const creator = Array.isArray(doc.creator) ? doc.creator.join(', ') : String(doc.creator ?? '');
        const confidence = scoreTrack(track.title, track.artist, String(doc.title ?? ''), creator);
        if (confidence < 65) continue;

        const metaResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'LUMEO/1.1' },
          cache: 'no-store',
        });
        if (!metaResponse.ok) continue;
        const meta = await metaResponse.json();
        const license = meta?.metadata?.licenseurl || meta?.metadata?.rights || doc.licenseurl || doc.rights || '';
        if (!isOpenLicense(license)) continue;

        const files = Array.isArray(meta?.files) ? meta.files as ArchiveFile[] : [];
        const selected = chooseAudioFile(files, preferred);
        if (!selected?.name) continue;

        const safeName = selected.name.split('/').map(part => encodeURIComponent(part)).join('/');
        return {
          available: true,
          provider: 'Internet Archive',
          candidateTitle: String(meta?.metadata?.title || doc.title || track.title),
          candidateArtist: String(meta?.metadata?.creator || creator || ''),
          license: String(license),
          downloadUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${safeName}`,
          itemUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
          fileName: selected.name,
          actualFormat: fileFormat(selected.name),
          size: selected.size ? Number(selected.size) : null,
          confidence,
        };
      }
    } catch {
      // tenta a próxima consulta/provedor
    }
  }

  return null;
}

async function jamendoDownload(track: RequestedTrack, preferred: string) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return null;

  try {
    const endpoint = new URL('https://api.jamendo.com/v3.0/tracks/');
    endpoint.searchParams.set('client_id', clientId);
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('limit', '10');
    endpoint.searchParams.set('search', `${track.title} ${track.artist}`);
    endpoint.searchParams.set('audiodlformat', preferred === 'wav' ? 'flac' : 'mp32');

    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    const candidates = Array.isArray(data?.results) ? data.results : [];

    let best: any = null;
    let bestScore = 0;
    for (const item of candidates) {
      if (item?.audiodownload_allowed !== true || !item?.audiodownload) continue;
      const confidence = scoreTrack(track.title, track.artist, String(item?.name ?? ''), String(item?.artist_name ?? ''));
      if (confidence > bestScore) {
        best = item;
        bestScore = confidence;
      }
    }

    if (!best || bestScore < 72) return null;
    return {
      available: true,
      provider: 'Jamendo',
      candidateTitle: String(best.name ?? track.title),
      candidateArtist: String(best.artist_name ?? track.artist),
      license: String(best.license_ccurl ?? 'Licença informada pelo Jamendo'),
      downloadUrl: String(best.audiodownload),
      itemUrl: String(best.shareurl || best.shorturl || best.audio || ''),
      fileName: `${String(best.artist_name || track.artist)} - ${String(best.name || track.title)}.${preferred === 'wav' ? 'flac' : 'mp3'}`,
      actualFormat: preferred === 'wav' ? 'flac' : 'mp3',
      size: null,
      confidence: bestScore,
    };
  } catch {
    return null;
  }
}

async function itunesAlternative(track: RequestedTrack): Promise<Alternative | null> {
  try {
    const endpoint = new URL('https://itunes.apple.com/search');
    endpoint.searchParams.set('term', `${track.title} ${track.artist}`);
    endpoint.searchParams.set('country', 'BR');
    endpoint.searchParams.set('media', 'music');
    endpoint.searchParams.set('entity', 'song');
    endpoint.searchParams.set('limit', '5');

    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    let best: any = null;
    let bestScore = 0;
    for (const item of results) {
      const confidence = scoreTrack(track.title, track.artist, String(item?.trackName ?? ''), String(item?.artistName ?? ''));
      if (confidence > bestScore) {
        best = item;
        bestScore = confidence;
      }
    }

    if (!best?.trackViewUrl || bestScore < 70) return null;
    return {
      kind: 'store',
      provider: 'Apple / iTunes',
      url: String(best.trackViewUrl),
      label: typeof best.trackPrice === 'number' ? 'Comprar faixa' : 'Abrir na loja',
      price: typeof best.trackPrice === 'number' ? best.trackPrice : undefined,
      currency: typeof best.currency === 'string' ? best.currency : undefined,
      confidence: bestScore,
    };
  } catch {
    return null;
  }
}

function legalSearchAlternatives(track: RequestedTrack): Alternative[] {
  const q = encodeURIComponent(`${track.artist} ${track.title}`);
  return [
    { kind: 'search', provider: 'Bandcamp', url: `https://bandcamp.com/search?q=${q}`, label: 'Pesquisar no Bandcamp' },
    { kind: 'search', provider: 'SoundCloud', url: `https://soundcloud.com/search/sounds?q=${q}`, label: 'Pesquisar no SoundCloud' },
  ];
}

async function resolveOne(track: RequestedTrack, preferred: string) {
  const checkedProviders = ['Internet Archive'];

  const archive = await archiveDownload(track, preferred);
  if (archive) {
    return {
      id: track.id,
      ...archive,
      checkedProviders,
      alternatives: legalSearchAlternatives(track),
    };
  }

  if (process.env.JAMENDO_CLIENT_ID) checkedProviders.push('Jamendo');
  const jamendo = await jamendoDownload(track, preferred);
  if (jamendo) {
    return {
      id: track.id,
      ...jamendo,
      checkedProviders,
      alternatives: legalSearchAlternatives(track),
    };
  }

  checkedProviders.push('Apple / iTunes');
  const store = await itunesAlternative(track);
  const alternatives = [
    ...(store ? [store] : []),
    ...legalSearchAlternatives(track),
  ];

  return {
    id: track.id,
    available: false,
    provider: null,
    checkedProviders,
    alternatives,
    message: alternatives.length
      ? 'Não encontrei download liberado, mas encontrei opções legais para esta gravação.'
      : 'Nenhuma fonte legal verificável foi encontrada para esta faixa.',
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tracks = Array.isArray(body?.tracks) ? body.tracks as RequestedTrack[] : [];
  const preferred = String(body?.format ?? 'mp3').toLowerCase();

  if (!tracks.length) {
    return NextResponse.json({ ok: false, error: 'Selecione ao menos uma faixa.' }, { status: 400 });
  }

  if (tracks.length > 8) {
    return NextResponse.json({ ok: false, error: 'Envie no máximo 8 faixas por lote de busca.' }, { status: 400 });
  }

  const safeTracks = tracks
    .map(track => ({
      id: String(track?.id ?? ''),
      title: String(track?.title ?? '').trim(),
      artist: String(track?.artist ?? '').trim(),
    }))
    .filter(track => track.id && track.title && track.artist);

  const results = [];
  for (const track of safeTracks) results.push(await resolveOne(track, preferred));

  return NextResponse.json({
    ok: true,
    results,
    providerStatus: {
      internetArchive: 'active',
      appleItunes: 'active',
      jamendo: process.env.JAMENDO_CLIENT_ID ? 'active' : 'needs-key',
      bandcamp: 'search-link',
      soundcloud: 'search-link',
    },
  });
}
