'use client';

import { useRef, useState } from 'react';
import {
  ArrowRight, AudioLines, CheckCircle2, CloudUpload, Copy, ExternalLink, Film, Link2,
  ListMusic, Music2, Scissors, ShieldCheck, Sparkles, Upload, WandSparkles
} from 'lucide-react';

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
};

const features = [
  { icon: AudioLines, title: 'Áudio sem complicação', text: 'Converta arquivos próprios para MP3, M4A, WAV e outros formatos com uma experiência simples.' },
  { icon: Film, title: 'Vídeo pronto para qualquer tela', text: 'Prepare MP4 e WebM, ajuste resolução e organize os arquivos antes de exportar.' },
  { icon: ListMusic, title: 'Playlists organizadas', text: 'Analise links, organize listas e visualize playlists do Spotify em um fluxo único.' },
  { icon: Scissors, title: 'Ferramentas rápidas', text: 'Arquitetura preparada para corte, extração de áudio, compressão e processamento em lote.' },
  { icon: ShieldCheck, title: 'Processamento autorizado', text: 'O motor trabalha com uploads e fontes que permitem download ou processamento pelo usuário.' },
  { icon: WandSparkles, title: 'Experiência premium', text: 'Mobile-first, responsiva e pensada para parecer produto — não apenas uma ferramenta técnica.' },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState('mp3');
  const [converting, setConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState('');

  async function analyze() {
    if (!url.trim()) return;
    setLoading(true);
    setAnalysis(null);
    setCopied(false);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setAnalysis(data);
    } finally {
      setLoading(false);
    }
  }

  async function copySpotifyLink() {
    if (!analysis?.canonicalUrl) return;
    await navigator.clipboard.writeText(analysis.canonicalUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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
        throw new Error(data.error || 'Não foi possível converter o arquivo.');
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

  const spotifyPlaylist = analysis?.source === 'spotify' && analysis.kind === 'playlist' && analysis.embedUrl;

  return (
    <main>
      <div className="shell">
        <nav className="nav">
          <a className="brand" href="#"><span className="brand-mark"><Sparkles size={17}/></span>LUMEO</a>
          <div className="nav-links"><a href="#recursos">Recursos</a><a href="#workspace">Workspace</a><a href="#sobre">Sobre</a></div>
          <a className="nav-cta" href="#workspace">Começar</a>
        </nav>

        <section className="hero">
          <span className="eyebrow"><Sparkles size={13}/> Seu hub de mídia, mais simples</span>
          <h1>Mídia, <span>do seu jeito.</span></h1>
          <p>Analise links, visualize playlists e processe arquivos autorizados em uma interface rápida, limpa e feita para funcionar perfeitamente no celular.</p>

          <div className="converter">
            <div className="converter-inner">
              <div className="input-row">
                <div className="url-box"><Link2 size={18}/><input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter' && analyze()} placeholder="Cole um link de mídia aqui..." /></div>
                <button className="primary-btn" onClick={analyze} disabled={loading}>{loading ? 'Analisando...' : <>Analisar <ArrowRight size={16} style={{verticalAlign:'middle',marginLeft:5}}/></>}</button>
              </div>
              <div className="platform-row">
                <span className="platform-pill"><Music2 size={12}/> Spotify</span>
                <span className="platform-pill"><Film size={12}/> YouTube</span>
                <span className="platform-pill"><Link2 size={12}/> URL direta</span>
                <span className="platform-pill"><Upload size={12}/> Upload</span>
              </div>

              {analysis && spotifyPlaylist && (
                <div className="spotify-result">
                  <div className="spotify-summary">
                    {analysis.thumbnail ? (
                      <img className="spotify-cover" src={analysis.thumbnail} alt={`Capa de ${analysis.title || 'playlist do Spotify'}`} />
                    ) : (
                      <div className="spotify-cover spotify-cover-fallback"><Music2 size={28}/></div>
                    )}
                    <div className="spotify-info">
                      <span className="spotify-kicker">PLAYLIST · SPOTIFY</span>
                      <h3>{analysis.title || analysis.label}</h3>
                      <p>{analysis.message}</p>
                      <div className="spotify-actions">
                        {analysis.canonicalUrl && (
                          <a className="spotify-primary" href={analysis.canonicalUrl} target="_blank" rel="noreferrer">
                            Abrir no Spotify <ExternalLink size={14}/>
                          </a>
                        )}
                        <button className="spotify-secondary" onClick={copySpotifyLink}>
                          <Copy size={14}/> {copied ? 'Link copiado' : 'Copiar link'}
                        </button>
                      </div>
                    </div>
                    <span className="spotify-status">Prévia oficial</span>
                  </div>

                  <div className="spotify-player-wrap">
                    <iframe
                      className="spotify-player"
                      src={analysis.embedUrl}
                      width="100%"
                      height="352"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      title={`Spotify: ${analysis.title || 'playlist'}`}
                    />
                  </div>

                  <div className="spotify-note">
                    <CheckCircle2 size={15}/>
                    <span>As faixas são exibidas e reproduzidas pelo player oficial do Spotify. O LUMEO não baixa nem copia o áudio.</span>
                  </div>
                </div>
              )}

              {analysis && !spotifyPlaylist && (
                <div className="result">
                  <div className="thumb">{analysis.source === 'spotify' ? <Music2/> : <Film/>}</div>
                  <div><h3>{analysis.label}</h3><p>{analysis.message}</p></div>
                  <span className="status">{analysis.canProcess ? 'Processável' : analysis.canPreview ? 'Prévia disponível' : 'Somente análise'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="stats">
            <div className="stat"><strong>100%</strong><span>responsivo e mobile-first</span></div>
            <div className="stat"><strong>6+</strong><span>formatos preparados</span></div>
            <div className="stat"><strong>1 fluxo</strong><span>links, uploads e jobs</span></div>
          </div>
        </section>
      </div>

      <section className="section" id="recursos"><div className="shell">
        <div className="section-head"><h2>Uma central de mídia que parece produto.</h2><p>O LUMEO foi desenhado para crescer: de um conversor elegante para uma plataforma completa de processamento e organização.</p></div>
        <div className="grid">{features.map(({icon:Icon,title,text})=><article className="card" key={title}><div className="icon-box"><Icon size={20}/></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div></section>

      <section className="section" id="workspace"><div className="shell">
        <div className="section-head"><h2>Workspace para arquivos reais.</h2><p>Uploads autorizados entram na fila de processamento e podem ser convertidos por um worker dedicado com FFmpeg.</p></div>
        <div className="workspace">
          <div className="dropzone"><div className="dropbox">
            <div className="upload-circle"><CloudUpload/></div><h3>Solte sua mídia aqui</h3><p>MP4, MOV, WEBM, MP3, WAV, M4A e outros. O backend pode processar o arquivo em jobs independentes.</p>
            <input ref={fileInput} type="file" hidden accept="audio/*,video/*" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
            <button className="ghost-btn" onClick={()=>fileInput.current?.click()}>{file ? file.name : 'Escolher arquivo'}</button>
            {file && <div style={{marginTop:16,width:'100%',maxWidth:390}}>
              <div className="format-picker">{['mp3','m4a','wav','mp4','webm'].map(item=><button key={item} className={format===item ? 'format active' : 'format'} onClick={()=>setFormat(item)}>{item.toUpperCase()}</button>)}</div>
              <button className="primary-btn convert-btn" onClick={convertFile} disabled={converting}>{converting ? 'Convertendo...' : `Converter para ${format.toUpperCase()}`}</button>
              {convertMessage && <p className="convert-message">{convertMessage}</p>}
            </div>}
          </div></div>
          <div className="history"><h3>Atividade recente</h3>
            <div className="job"><div className="job-icon"><Film size={18}/></div><div><strong>video-campanha.mov</strong><span>Convertendo para MP4 · 78%</span><div className="progress"><i style={{width:'78%'}}/></div></div><span>01:24</span></div>
            <div className="job"><div className="job-icon"><Music2 size={18}/></div><div><strong>podcast-episodio.wav</strong><span>Concluído · MP3 320 kbps</span></div><CheckCircle2 size={18}/></div>
            <div className="job"><div className="job-icon"><AudioLines size={18}/></div><div><strong>trilha-abertura.m4a</strong><span>Na fila · aguardando worker</span></div><span>—</span></div>
          </div>
        </div>
      </div></section>

      <div className="shell"><footer className="footer" id="sobre"><span>© 2026 LUMEO. Uma experiência de mídia criada para ser simples.</span><span>Projeto demonstrativo · processamento de conteúdo autorizado.</span></footer></div>
    </main>
  );
}
