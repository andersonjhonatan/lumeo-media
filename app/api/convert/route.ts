import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowed = new Set(['mp3', 'm4a', 'wav', 'mp4', 'webm']);
const mime: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

function ffmpegArgs(input: string, output: string, format: string) {
  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input];
  if (format === 'mp3') return [...common, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', output];
  if (format === 'm4a') return [...common, '-vn', '-c:a', 'aac', '-b:a', '192k', output];
  if (format === 'wav') return [...common, '-vn', '-c:a', 'pcm_s16le', output];
  if (format === 'mp4') return [...common, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', output];
  return [...common, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', output];
}

function runFFmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-5000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `FFmpeg saiu com código ${code}`)));
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  const format = String(form.get('format') ?? 'mp3').toLowerCase();

  if (!(file instanceof File)) return NextResponse.json({ error: 'Envie um arquivo de áudio ou vídeo.' }, { status: 400 });
  if (!allowed.has(format)) return NextResponse.json({ error: 'Formato de saída não suportado.' }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'No MVP, o limite é 50 MB por arquivo.' }, { status: 413 });
  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) return NextResponse.json({ error: 'Tipo de arquivo não permitido.' }, { status: 415 });

  const id = crypto.randomUUID();
  const inputExt = path.extname(file.name).replace(/[^.a-zA-Z0-9]/g, '') || '.bin';
  const input = path.join(os.tmpdir(), `lumeo-${id}${inputExt}`);
  const output = path.join(os.tmpdir(), `lumeo-${id}.${format}`);

  try {
    await fs.writeFile(input, Buffer.from(await file.arrayBuffer()));
    await runFFmpeg(ffmpegArgs(input, output, format));
    const data = await fs.readFile(output);
    const base = path.basename(file.name, path.extname(file.name)).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 80) || 'lumeo';

    return new Response(data, {
      headers: {
        'Content-Type': mime[format],
        'Content-Disposition': `attachment; filename="${base}.${format}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao processar a mídia.' }, { status: 500 });
  } finally {
    await Promise.allSettled([fs.unlink(input), fs.unlink(output)]);
  }
}
