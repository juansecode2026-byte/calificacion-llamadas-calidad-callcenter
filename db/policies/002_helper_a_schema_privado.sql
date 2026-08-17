-- Políticas RLS — sacar el helper del schema expuesto
--
-- Requiere: db/policies/001_baseline.sql ya aplicado.
--
-- Problema que resuelve: PostgREST publica toda función del schema "public"
-- como endpoint en /rest/v1/rpc/<nombre>. is_evaluador_activo() quedó así
-- alcanzable por anon y por authenticated, aunque es un helper interno de
-- las políticas y no parte de la API. Detectado por el linter de seguridad
-- de Supabase (lints 0028 y 0029).
--
-- Intento descartado: revocar EXECUTE a anon/authenticated. **No funciona** —
-- la expresión de una policy se evalúa con los permisos del rol que hace la
-- consulta, así que sin EXECUTE toda consulta falla con
-- "permission denied for function is_evaluador_activo" en vez de denegar
-- limpiamente. Verificado contra la base real antes de descartarlo.
--
-- Solución aplicada: mover la función a un schema que PostgREST no publica.
-- Sigue siendo ejecutable (las policies la resuelven por OID, que no cambia
-- al mover de schema) pero deja de ser alcanzable como endpoint.

create schema if not exists private;

alter function public.is_evaluador_activo() set schema private;

-- USAGE es necesario para que la evaluación de las policies alcance la
-- función. No la vuelve pública: PostgREST solo expone los schemas que tiene
-- configurados, y "private" no está entre ellos.
grant usage on schema private to anon, authenticated;

comment on schema private is
  'Helpers internos que las políticas RLS necesitan ejecutar pero que no deben quedar expuestos como endpoints de la API REST. PostgREST solo publica los schemas configurados (public), no este.';

-- Nota para futuras políticas: los helpers nuevos van directo en "private",
-- no en "public" —- si no, reaparece el mismo lint.
