// Edge Function de ingesta — paso 1 del pipeline (CLAUDE.md).
//
// Recibe multipart/form-data: { correo, audio }. Busca al asesor por
// correo, sube el audio a Storage, calcula la duración leyendo el propio
// archivo, y crea el registro de la llamada (estado='cargada' por default
// — el disparo a 'pendiente' es un paso manual aparte, ver migración 031).
//
// Corre con service_role (bypassea RLS, CLAUDE.md), así que el chequeo de
// "es un evaluador activo" se hace acá mismo, a mano — no queda delegado
// a RLS como con el resto de las lecturas del dashboard.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseBuffer } from 'npm:music-metadata@10';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Falta el header Authorization' }, 401);
  const token = authHeader.replace('Bearer ', '');

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Sesión inválida o expirada' }, 401);

  const { data: evaluador, error: evaluadorError } = await admin
    .from('evaluadores')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .eq('activo', true)
    .maybeSingle();
  if (evaluadorError) return json({ error: evaluadorError.message }, 500);
  if (!evaluador) return json({ error: 'El usuario autenticado no es un evaluador activo' }, 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'El body debe ser multipart/form-data' }, 400);
  }

  const correoRaw = form.get('correo');
  const audio = form.get('audio');
  if (typeof correoRaw !== 'string' || !correoRaw.trim()) {
    return json({ error: 'Falta el correo del asesor' }, 400);
  }
  if (!(audio instanceof File)) {
    return json({ error: 'Falta el archivo de audio' }, 400);
  }

  // Comparación case-insensitive: el índice único es sobre
  // lower(trim(correo)) (migración 019), pero la columna cruda puede tener
  // otra capitalización según cómo se haya cargado el asesor.
  const correoNormalizado = correoRaw.trim();
  const { data: asesor, error: asesorError } = await admin
    .from('asesores')
    .select('id, nombres, apellidos, activo')
    .ilike('correo', correoNormalizado)
    .maybeSingle();
  if (asesorError) return json({ error: asesorError.message }, 500);
  if (!asesor || !asesor.activo) {
    return json({ error: `No se encontró ningún asesor activo con el correo ${correoNormalizado}` }, 404);
  }

  const bytes = new Uint8Array(await audio.arrayBuffer());

  // Duración leída del propio archivo (CLAUDE.md, paso 1). Si el parseo
  // falla (formato raro, archivo corrupto) no se bloquea la carga -- la
  // evidencia de la llamada importa más que el dato de duración, y la
  // columna es nullable a propósito.
  let duracionSeg: number | null = null;
  try {
    const metadata = await parseBuffer(bytes, audio.type || undefined);
    if (metadata.format.duration) duracionSeg = Math.round(metadata.format.duration);
  } catch (err) {
    console.warn('No se pudo leer la duración del audio:', err);
  }

  const extension = audio.name.includes('.') ? audio.name.split('.').pop() : 'audio';
  const ruta = `${asesor.id}/${crypto.randomUUID()}.${extension}`;

  // Se guarda la RUTA, no una URL pública (ver migración 020) — el
  // dashboard resuelve la reproducción con createSignedUrl() cuando haga
  // falta reproducir el audio, todavía no construido.
  const { error: uploadError } = await admin.storage
    .from('audios-llamadas')
    .upload(ruta, bytes, { contentType: audio.type || 'application/octet-stream' });
  if (uploadError) return json({ error: `No se pudo subir el audio: ${uploadError.message}` }, 500);

  // fecha_hora queda aproximada a "ahora": no hay integración con ningún
  // dialer todavía (CLAUDE.md), así que no hay de dónde sacar la hora real
  // de la llamada. Si más adelante se agrega, este es el lugar a ajustar.
  const { data: llamada, error: llamadaError } = await admin
    .from('llamadas')
    .insert({
      asesor_id: asesor.id,
      fecha_hora: new Date().toISOString(),
      duracion_seg: duracionSeg,
      archivo_audio_url: ruta,
      // estado usa su default ('cargada', migración 029) — no se setea acá.
    })
    .select('id, fecha_carga')
    .single();
  if (llamadaError) return json({ error: llamadaError.message }, 500);

  return json({
    llamada_id: llamada.id,
    asesor: `${asesor.nombres} ${asesor.apellidos}`,
    duracion_seg: duracionSeg,
  });
});
