import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { supabase } from './supabase.ts';

/**
 * Paso 2 del pipeline — transcripción real con diarización por canal.
 *
 * Decisiones tomadas con el usuario (ver DECISIONES.md, "Transcripción
 * automática de audio"):
 * - Los audios llegan en ESTÉREO, un canal por hablante (grabación
 *   VoIP/PBX típica de call center) — la diarización sale de separar
 *   canales con ffmpeg, no hace falta un modelo de diarización aparte
 *   (pyannote, etc.). Si algún audio llega en mono, esto falla ruidosamente
 *   en vez de fingir que separó algo que no existía.
 * - Canal IZQUIERDO = asesor, DERECHO = cliente por convención de PBX
 *   (`CANAL_ASESOR_LADO`, confirmar con la primera llamada real — si viene
 *   invertido en la práctica, es la única variable a cambiar).
 * - Groq (whisper-large-v3-turbo) para esta etapa de desarrollo/pruebas:
 *   gratis y rápido para validar si Whisper transcribe bien en español.
 *   Decisión explícita del usuario, no confirmada para producción — antes
 *   de ese salto hay que recalcular volumen real vs. límites del plan
 *   gratis de Groq.
 * - Requiere `ffmpeg` instalado en el host donde corre el worker (no es
 *   una dependencia de npm — es un binario del sistema).
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELO = 'whisper-large-v3-turbo';

// Exportado para que procesarLlamada.ts registre en transcripciones.modelo
// el modelo que realmente se usó, en vez de depender de una variable de
// entorno aparte que podría desincronizarse de este archivo.
export const MODELO_TRANSCRIPCION = `groq/${MODELO}`;

type Hablante = 'Asesor' | 'Cliente';

interface Segmento {
  hablante: Hablante;
  inicio: number;
  texto: string;
}

export async function transcribirAudio(llamadaId: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Falta GROQ_API_KEY en el entorno (.env de la raíz del proyecto).');
  }

  const ladoAsesor = (process.env.CANAL_ASESOR_LADO ?? 'izquierdo').trim().toLowerCase();
  if (ladoAsesor !== 'izquierdo' && ladoAsesor !== 'derecho') {
    throw new Error(`CANAL_ASESOR_LADO debe ser "izquierdo" o "derecho", no "${ladoAsesor}".`);
  }

  const { data: llamada, error: errorLlamada } = await supabase
    .from('llamadas')
    .select('archivo_audio_url')
    .eq('id', llamadaId)
    .single();
  if (errorLlamada) throw errorLlamada;
  if (!llamada.archivo_audio_url) throw new Error(`La llamada ${llamadaId} no tiene archivo_audio_url.`);

  const { data: blob, error: errorDescarga } = await supabase.storage
    .from('audios-llamadas')
    .download(llamada.archivo_audio_url);
  if (errorDescarga) throw errorDescarga;

  const dir = await mkdtemp(join(tmpdir(), 'llamada-'));
  try {
    const original = join(dir, 'original');
    await writeFile(original, Buffer.from(await blob.arrayBuffer()));

    const canalIzq = join(dir, 'izquierdo.wav');
    const canalDer = join(dir, 'derecho.wav');
    await separarCanales(original, canalIzq, canalDer);

    const archivoAsesor = ladoAsesor === 'izquierdo' ? canalIzq : canalDer;
    const archivoCliente = ladoAsesor === 'izquierdo' ? canalDer : canalIzq;

    const [segmentosAsesor, segmentosCliente] = await Promise.all([
      transcribirCanal(archivoAsesor, 'Asesor', apiKey),
      transcribirCanal(archivoCliente, 'Cliente', apiKey),
    ]);

    // Se intercalan por tiempo de inicio -- cada canal trae su propia
    // lista de segmentos ordenada, pero la conversación real alterna entre
    // los dos. Sin esto el texto quedaría "todo lo del asesor primero,
    // todo el cliente después", ilegible para el agente evaluador.
    const todos = [...segmentosAsesor, ...segmentosCliente].sort((a, b) => a.inicio - b.inicio);
    if (todos.length === 0) {
      throw new Error(`La transcripción de la llamada ${llamadaId} salió vacía en los dos canales.`);
    }

    return todos.map((s) => `${s.hablante}: ${s.texto.trim()}`).join('\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function separarCanales(entrada: string, salidaIzq: string, salidaDer: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i',
      entrada,
      '-filter_complex',
      '[0:a]channelsplit=channel_layout=stereo[left][right]',
      '-map',
      '[left]',
      salidaIzq,
      '-map',
      '[right]',
      salidaDer,
    ]);
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    ffmpeg.on('error', (err) => {
      reject(new Error(`No se pudo ejecutar ffmpeg (¿está instalado en el PATH del worker?): ${err.message}`));
    });
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg terminó con código ${code} separando canales:\n${stderr.slice(-2000)}`));
    });
  });
}

async function transcribirCanal(ruta: string, hablante: Hablante, apiKey: string): Promise<Segmento[]> {
  const bytes = await readFile(ruta);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), `${hablante}.wav`);
  form.append('model', MODELO);
  form.append('language', 'es');
  form.append('response_format', 'verbose_json');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    throw new Error(`Groq devolvió ${res.status} transcribiendo el canal de ${hablante}: ${cuerpo.slice(0, 500)}`);
  }

  const data = (await res.json()) as { segments?: { start: number; text: string }[]; text?: string };

  // Un canal sin voz detectada (el hablante se quedó callado toda la
  // llamada) es un resultado válido, no un error -- devuelve lista vacía.
  if (!data.segments || data.segments.length === 0) {
    return data.text?.trim() ? [{ hablante, inicio: 0, texto: data.text }] : [];
  }
  return data.segments
    .map((s) => ({ hablante, inicio: s.start, texto: s.text }))
    .filter((s) => s.texto.trim().length > 0);
}
