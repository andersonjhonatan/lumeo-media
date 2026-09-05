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

function lucene(value: string) {
  return value
    .replace(/[\\+\-!(){}\[\]^"~*?:/]/g, ' ')
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

async function archiveSearch(title: string, artist: string) {
  const titleQ = lucene(title);
  const artistQ = lucene(artist.split(',')[0] || artist);
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
        headers: { Accept: 'application/json', 'User-Agent': 'LUMEO/1.0' },
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const data = await response.json();
      const docs = Array.isArray(data?.response?.docs) ? data.response.docs as ArchiveDoc[] : [];
      if (docs.length) return docs;
    } catch {
      // tenta a próxima consulta
    }
  }

  return [] as ArchiveDoc[];
}

async function resolveOne(track: RequestedTrack, preferred: string) {
  const docs = await archiveSearch(track.title, track.artist);

  for (const doc of docs) {
    if (!doc.identifier) continue;
    const titleScore = similar(track.title, String(doc.title ?? ''));
    const creator = Array.isArray(doc.creator) ? doc.creator.join(', ') : String(doc.creator ?? '');
    const artistScore = creator ? similar(track.artist, creator) : 0;
    if (titleScore < 0.5) continue;

    try {
      const metaResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'LUMEO/1.0' },
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
        id: track.id,
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
        confidence: Math.round(((titleScore * 0.75) + (artistScore * 0.25)) * 100),
      };
    } catch {
      // tenta outro candidato
    }
  }

  return {
    id: track.id,
    available: false,
    provider: null,
    message: 'Nenhuma fonte aberta verificável foi encontrada para esta faixa.',
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

  return NextResponse.json({ ok: true, results });
}
