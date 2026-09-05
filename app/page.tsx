'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight, AudioLines, Check, CheckCircle2, CloudUpload, Download, ExternalLink, FileDown,
  Film, Link2, ListMusic, LoaderCircle, Music2, Search, ShieldCheck, Sparkles, Upload, WandSparkles
} from 'lucide-react';

type Track = {
  id: string;
  index: number;
  title: string;
  artist: string;
  duration: string;
  explicit?: boolean;
};

type Analysis = {
  ok: boolean;
  source: string;
  kind?: string;
  label: string;
  message: string;
  canProcess: boolean;
  canPreview?: boolean;
  title?: string;
  thumbnail?: string | null;
  canonicalUrl?: string;
  embedUrl?: string;
  spotifyId?: string;
  directUrl?: string;
  tracks?: Track[];
  trackCount?: number;
};

type SourceResult = {
  id: string;
  available: boolean;
  provider?: string | null;
  candidateTitle?: string;
  candidateArtist?: string;
  license?: string;
  downloadUrl?: string;
  itemUrl?: string;
  fileName?: string;
  actualFormat?: string;
  size?: number | null;
  confidence?: number;
  message?: string;
};

const features = [
  { icon: ListMusic, title: 'Playlist em lote', text: 'Importe metadados públicos, selecione músicas e processe a lista por lotes.' },
  { icon: Search, title: 'Busca de fontes abertas', text: 'O LUMEO procura fontes públicas/licenciadas e só libera download quando encontra uma fonte verificável.' },
  { icon: AudioLines, title: 'Formatos de áudio', text: 'Defina o formato preferido para a busca e para os fluxos de conversão autorizados.' },
  { icon: Download, title: 'Downloads organizados', text: 'Baixe fontes disponíveis individualmente ou exporte uma lista M3U com os links encontrados.' },
  { icon: ShieldCheck, title: 'Sem rip de plataforma', text: 'Spotify e YouTube servem como referência de metadados; o áudio protegido não é extraído.' },
  { icon: WandSparkles, title: 'Experiência premium', text: 'Mobile-first, rápida e clara, com estados de busca, disponibilidade e progresso.' },
];

function prettyBytes(value?: number | null) {
  if (!value || Number.isNaN(value)) return '';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [format, setFormat] = useState('mp3');
  const [quality, setQuality] = useState('192');
  const [sourceResults, setSourceResults] = useState<Record<string, SourceResult>>({});
  const [resolvingIds, setResolvingIds] = useState<string[]>([]);
  const [sourceMessage, setSourceMessage] = useState('');

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState('');

  const tracks = analysis?.tracks ?? [];
  const selectedTracks = useMemo(() => tracks.filter(track => selectedIds.includes(track.id)), [tracks, selectedIds]);
  const availableSelected = useMemo(
    () => selectedTracks.filter(track => sourceResults[track.id]?.available && sourceResults[track.id]?.downloadUrl),
    [selectedTracks, sourceResults],
  );

  async function analyze() {
    if (!url.trim()) return;
    setLoading(true);
    setAnalysis(null);
    setSelectedIds([]);
    setSourceResults({});
    setSourceMessage('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setAnalysis(data);
      if (Array.isArray(data?.tracks)) setSelectedIds(data.tracks.map((track: Track) => track.id));
    } finally {
      setLoading(false);
    }
  }

  function toggleTrack(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  function toggleAll() {
    if (selectedIds.length === tracks.length) setSelectedIds([]);
    else setSelectedIds(tracks.map(track => track.id));
  }

  async function findSources() {
    if (!selectedTracks.length) return;
    setSourceMessage('');
    const batches: Track[][] = [];
    for (let i = 0; i < selectedTracks.length; i += 8) batches.push(selectedTracks.slice(i, i + 8));

    for (const batch of batches) {
      const ids = batch.map(track => track.id);
      setResolvingIds(current => Array.from(new Set([...current, ...ids])));
      try {
        const response = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format,
            quality,
            tracks: batch.map(track => ({ id: track.id, title: track.title, artist: track.artist })),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Falha ao procurar fontes.');
        const incoming: Record<string, SourceResult> = {};
        for (const result of data.results ?? []) incoming[result.id] = result;
        setSourceResults(current => ({ ...current, ...incoming }));
      } catch (error) {
        setSourceMessage(error instanceof Error ? error.message : 'Falha ao procurar fontes.');
      } finally {
        setResolvingIds(current => current.filter(id => !ids.includes(id)));
      }
    }
  }

  function exportM3U() {
    const rows = ['#EXTM3U'];
    for (const track of availableSelected) {
      const result = sourceResults[track.id];
      rows.push(`#EXTINF:-1,${track.artist} - ${track.title}`);
      rows.push(result.downloadUrl!);
    }
    const blob = new Blob([rows.join('\n')], { type: 'audio/x-mpegurl;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${(analysis?.title || 'lumeo-playlist').replace(/[^a-zA-Z0-9-_]+/g, '-')}.m3u`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  function downloadAvailable() {
    availableSelected.forEach((track, index) => {
      const result = sourceResults[track.id];
      window.setTimeout(() => {
        const anchor = document.createElement('a');
        anchor.href = result.downloadUrl!;
        anchor.target = '_blank';
        anchor.rel = 'noreferrer';
        anchor.click();
      }, index * 450);
    });
  }

  async function convertFile() {
    if (!file) return;
    setConverting(true);
    setConvertMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('format', format);
      const res = await fetch('/api/convert', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível converter o arquivo neste ambiente.');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const base = file.name.replace(/\.[^/.]+$/, '') || 'lumeo';
      a.download = `${base}.${format}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
      setConvertMessage('Arquivo convertido com sucesso.');
    } catch (err) {
      setConvertMessage(err instanceof Error ? err.message : 'Falha na conversão.');
    } finally {
      setConverting(false);
    }
  }

  const spotifyPlaylist = analysis?.source === 'spotify' && analysis.kind === 'playlist' && tracks.length > 0;

  return (
    <main>
      <div className="shell">
        <nav className="nav">
          <a className="brand" href="#"><span className="brand-mark"><Sparkles size={17}/></span>LUMEO</a>
          <div className="nav-links"><a href="#recursos">Recursos</a><a href="#workspace">Conversor</a><a href="#sobre">Sobre</a></div>
          <a className="nav-cta" href="#analisar">Começar</a>
        </nav>

        <section className="hero" id="analisar">
          <span className="eyebrow"><Sparkles size={13}/> Playlist, mídia e fontes abertas</span>
          <h1>Mídia, <span>do seu jeito.</span></h1>
          <p>Cole uma playlist, selecione as faixas e deixe o LUMEO procurar fontes realmente baixáveis e licenciadas — sem extrair o áudio protegido da plataforma.</p>

          <div className="converter">
            <div className="converter-inner">
              <div className="input-row">
                <div className="url-box"><Link2 size={18}/><input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter' && analyze()} placeholder="Cole uma playlist ou URL de mídia..." /></div>
                <button className="primary-btn" onClick={analyze} disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16}/> Analisando</> : <>Analisar <ArrowRight size={16}/></>}</button>
              </div>
              <div className="platform-row">
                <span className="platform-pill"><Music2 size={12}/> Spotify</span>
                <span className="platform-pill"><Film size={12}/> YouTube</span>
                <span className="platform-pill"><Link2 size={12}/> URL direta</span>
                <span className="platform-pill"><Upload size={12}/> Upload</span>
              </div>

              {analysis && spotifyPlaylist && (
                <div className="playlist-panel">
                  <div className="playlist-head">
                    {analysis.thumbnail ? <img className="playlist-cover" src={analysis.thumbnail} alt="Capa da playlist" /> : <div className="playlist-cover playlist-fallback"><Music2/></div>}
                    <div className="playlist-meta">
                      <span className="playlist-kicker">PLAYLIST · SPOTIFY · METADADOS PÚBLICOS</span>
                      <h2>{analysis.title || 'Playlist'}</h2>
                      <p>{tracks.length} faixas encontradas · {selectedIds.length} selecionadas</p>
                      {analysis.canonicalUrl && <a href={analysis.canonicalUrl} target="_blank" rel="noreferrer">Abrir playlist original <ExternalLink size={13}/></a>}
                    </div>
                    <div className="playlist-count"><strong>{tracks.length}</strong><span>faixas</span></div>
                  </div>

                  <div className="download-controls">
                    <div className="control-group">
                      <span>Formato preferido</span>
                      <div className="segmented">{['mp3','m4a','wav'].map(item => <button key={item} onClick={()=>setFormat(item)} className={format===item?'active':''}>{item.toUpperCase()}</button>)}</div>
                    </div>
                    <div className="control-group">
                      <span>Qualidade desejada</span>
                      <div className="segmented">{['128','192','320'].map(item => <button key={item} onClick={()=>setQuality(item)} className={quality===item?'active':''}>{item}k</button>)}</div>
                    </div>
                    <button className="select-all" onClick={toggleAll}><Check size={15}/>{selectedIds.length === tracks.length ? 'Desmarcar todas' : 'Selecionar todas'}</button>
                  </div>

                  <div className="track-list">
                    {tracks.map(track => {
                      const selected = selectedIds.includes(track.id);
                      const result = sourceResults[track.id];
                      const resolving = resolvingIds.includes(track.id);
                      return (
                        <div className={`track-row ${selected ? 'selected' : ''}`} key={track.id}>
                          <button className={`track-check ${selected ? 'checked' : ''}`} onClick={()=>toggleTrack(track.id)} aria-label={selected ? 'Desmarcar faixa' : 'Selecionar faixa'}>{selected && <Check size={13}/>}</button>
                          <span className="track-number">{String(track.index).padStart(2,'0')}</span>
                          <div className="track-main"><strong>{track.title}{track.explicit && <small>E</small>}</strong><span>{track.artist}</span></div>
                          <span className="track-duration">{track.duration}</span>
                          <div className="track-source">
                            {resolving && <span className="source-searching"><LoaderCircle className="spin" size={13}/> procurando</span>}
                            {!resolving && result?.available && <>
                              <span className="source-ok">Fonte aberta · {result.actualFormat?.toUpperCase()}</span>
                              <span className="source-sub">{result.provider}{result.size ? ` · ${prettyBytes(result.size)}` : ''}{typeof result.confidence === 'number' ? ` · ${result.confidence}% match` : ''}</span>
                            </>}
                            {!resolving && result && !result.available && <span className="source-none">Sem fonte aberta encontrada</span>}
                            {!resolving && !result && <span className="source-idle">Ainda não pesquisada</span>}
                          </div>
                          <div className="track-actions">
                            {result?.available && result.itemUrl && <a className="mini-btn" href={result.itemUrl} target="_blank" rel="noreferrer" title="Ver licença e origem"><ExternalLink size={13}/></a>}
                            {result?.available && result.downloadUrl && <a className="mini-btn download" href={result.downloadUrl} target="_blank" rel="noreferrer" title="Baixar da fonte"><Download size={13}/></a>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="playlist-actions-bar">
                    <div><strong>{selectedTracks.length}</strong><span> selecionadas</span>{Object.keys(sourceResults).length > 0 && <><b> · </b><strong>{availableSelected.length}</strong><span> com fonte aberta</span></>}</div>
                    <div className="bar-actions">
                      {availableSelected.length > 0 && <button className="secondary-btn" onClick={exportM3U}><FileDown size={15}/> Exportar M3U</button>}
                      {availableSelected.length > 0 && <button className="secondary-btn" onClick={downloadAvailable}><Download size={15}/> Baixar disponíveis</button>}
                      <button className="primary-btn find-btn" onClick={findSources} disabled={!selectedTracks.length || resolvingIds.length > 0}>{resolvingIds.length > 0 ? <><LoaderCircle className="spin" size={15}/> Procurando...</> : <><Search size={15}/> Procurar fontes</>}</button>
                    </div>
                  </div>
                  {sourceMessage && <p className="source-message">{sourceMessage}</p>}
                  <div className="legal-note"><ShieldCheck size={15}/><span>O Spotify é usado apenas para identificar a playlist e suas faixas. Downloads só aparecem quando uma fonte externa com licença aberta/pública é encontrada.</span></div>
                </div>
              )}

              {analysis && analysis.source === 'direct' && analysis.directUrl && (
                <div className="direct-result">
                  <div className="thumb"><Link2/></div>
                  <div><h3>{analysis.label}</h3><p>{analysis.message}</p></div>
                  <a className="secondary-btn" href={analysis.directUrl} target="_blank" rel="noreferrer"><Download size={14}/> Abrir mídia</a>
                </div>
              )}

              {analysis && !spotifyPlaylist && analysis.source !== 'direct' && (
                <div className="result">
                  <div className="thumb">{analysis.source === 'spotify' ? <Music2/> : <Film/>}</div>
                  <div><h3>{analysis.label}</h3><p>{analysis.message}</p></div>
                  <span className="status">{analysis.canProcess ? 'Processável' : 'Análise'}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="section" id="recursos"><div className="shell">
        <div className="section-head"><h2>Um fluxo de download que sabe dizer “não disponível”.</h2><p>Em vez de fingir que qualquer faixa pode ser baixada, o LUMEO separa metadados da plataforma de arquivos realmente liberados por outras fontes.</p></div>
        <div className="grid">{features.map(({icon:Icon,title,text})=><article className="card" key={title}><div className="icon-box"><Icon size={20}/></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div></section>

      <section className="section" id="workspace"><div className="shell">
        <div className="section-head"><h2>Conversor para arquivos seus.</h2><p>Envie áudio ou vídeo que você tem direito de processar e escolha o formato de saída.</p></div>
        <div className="workspace">
          <div className="dropzone"><div className="dropbox">
            <div className="upload-circle"><CloudUpload/></div><h3>Solte sua mídia aqui</h3><p>MP4, MOV, WEBM, MP3, WAV, M4A e outros arquivos autorizados.</p>
            <input ref={fileInput} type="file" hidden accept="audio/*,video/*" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
            <button className="ghost-btn" onClick={()=>fileInput.current?.click()}>{file ? file.name : 'Escolher arquivo'}</button>
            {file && <div className="upload-options">
              <div className="format-picker">{['mp3','m4a','wav','mp4','webm'].map(item=><button key={item} className={format===item ? 'format active' : 'format'} onClick={()=>setFormat(item)}>{item.toUpperCase()}</button>)}</div>
              <button className="primary-btn convert-btn" onClick={convertFile} disabled={converting}>{converting ? <><LoaderCircle className="spin" size={15}/> Convertendo...</> : `Converter para ${format.toUpperCase()}`}</button>
              {convertMessage && <p className="convert-message">{convertMessage}</p>}
            </div>}
          </div></div>
          <div className="history"><h3>Como o LUMEO decide</h3>
            <div className="job"><div className="job-icon"><Music2 size={18}/></div><div><strong>Spotify / playlists</strong><span>metadados públicos → busca externa</span></div><span>01</span></div>
            <div className="job"><div className="job-icon"><Search size={18}/></div><div><strong>Fonte aberta encontrada</strong><span>licença + arquivo verificável</span></div><CheckCircle2 size={18}/></div>
            <div className="job"><div className="job-icon"><ShieldCheck size={18}/></div><div><strong>Sem fonte aberta</strong><span>download permanece indisponível</span></div><span>—</span></div>
          </div>
        </div>
      </div></section>

      <div className="shell"><footer className="footer" id="sobre"><span>© 2026 LUMEO · mídia organizada com transparência.</span><span>Downloads somente de fontes externas autorizadas ou arquivos do usuário.</span></footer></div>
    </main>
  );
}
