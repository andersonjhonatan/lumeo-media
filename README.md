# LUMEO

Hub de mídia em Next.js com interface mobile-first para análise de links e conversão de arquivos autorizados.

## Demo online
https://lumeo-media.vercel.app

## O que funciona
- Landing page responsiva e premium
- Detecção de origem de URL em `POST /api/analyze`
- Reconhecimento de YouTube, Spotify, mídia direta e fontes genéricas
- Upload real de áudio/vídeo
- Conversão real com FFmpeg em `POST /api/convert`
- MP3, M4A, WAV, MP4 e WebM
- Limite de 50 MB no MVP
- Download automático do arquivo convertido
- API base de jobs em `POST /api/jobs`
- UI de fila/progresso pronta para evolução para worker assíncrono

## Escopo
O LUMEO não inclui mecanismos para contornar DRM, tokens, assinaturas ou restrições de download de plataformas. YouTube e Spotify são reconhecidos para fluxos permitidos de organização/análise. A conversão funciona para uploads do próprio usuário e outras mídias que ele tenha direito de processar.

## Stack
- Next.js 16.3.3
- React 19.2
- TypeScript
- Lucide React
- FFmpeg

## Requisitos locais
- Node.js 22+
- FFmpeg disponível no PATH

## Rodar
```bash
npm install
npm run dev
```
Abra `http://localhost:3000`.

## Produção recomendada
O endpoint de conversão síncrono é ideal para demonstração/local/VPS. Para escala real, mova a conversão para um worker:

`Next.js -> API -> Redis/BullMQ -> Worker Docker + FFmpeg -> R2/S3 -> URL assinada`

Adicione também autenticação, rate limit, quotas por usuário, antivírus/validação de arquivos, expiração de objetos e observabilidade.
