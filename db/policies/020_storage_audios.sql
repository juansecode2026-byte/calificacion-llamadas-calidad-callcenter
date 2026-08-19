-- Politicas de Storage para los audios de llamadas
--
-- Cierra H13 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- llamadas.archivo_audio_url apunta a Supabase Storage, pero no existia
-- ninguna policy de storage.objects ni definicion de bucket. Son
-- grabaciones de clientes reales: un bucket publico las deja accesibles
-- con solo tener la URL, y esa URL ya viaja en una tabla que el dashboard
-- lee normalmente.
--
-- Requiere: db/policies/002_helper_a_schema_privado.sql ya aplicado (usa
-- private.is_evaluador_activo()).

insert into storage.buckets (id, name, public)
values ('audios-llamadas', 'audios-llamadas', false)
on conflict (id) do update set public = false;

-- Solo lectura para evaluadores activos. No hay policy de insert para
-- "authenticated": la carga de audio pasa por la Edge Function de
-- backend/functions con la service key (CLAUDE.md, paso 1 del pipeline),
-- que bypassea RLS -- el cliente nunca escribe directo al bucket.

create policy "evaluador_lee_audios" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'audios-llamadas'
    and private.is_evaluador_activo()
  );

comment on policy "evaluador_lee_audios" on storage.objects is
  'Guardar la RUTA del objeto en llamadas.archivo_audio_url, no una URL
  publica -- el dashboard resuelve la reproduccion con createSignedUrl()
  de duracion corta, nunca exponiendo una URL permanente.';
