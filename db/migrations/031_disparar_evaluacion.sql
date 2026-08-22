-- Migracion 031: permitir que un evaluador dispare la evaluacion
--
-- El disparo del pipeline es manual (CLAUDE.md): el boton "Evaluar" del
-- dashboard pasa una llamada de 'cargada' a 'pendiente'. Verificado antes
-- de escribir esto: "authenticated" ya tenia GRANT de UPDATE sobre TODAS
-- las columnas de llamadas (grants por defecto de Supabase), pero no
-- existia ninguna policy de UPDATE -- con RLS activo y sin policy, el
-- update se bloquea en silencio (0 filas, sin error), el mismo tipo de
-- trampa que motivo H6 en la auditoria del 2026-08-18.
--
-- Se acota a nivel de columna (mismo patron que H6/migracion 017: revocar
-- el grant amplio, otorgar solo sobre "estado") y la policy limita la
-- transicion exacta con USING (fila actual) + WITH CHECK (fila resultante):
-- solo se puede pasar de 'cargada' a 'pendiente', nada mas. Un evaluador
-- no puede reescribir asesor_id, archivo_audio_url, ni saltar directo a
-- 'calificada'.

revoke update on llamadas from authenticated;
grant update (estado) on llamadas to authenticated;

create policy "evaluador_dispara_evaluacion" on llamadas
  for update
  using (estado = 'cargada' and private.is_evaluador_activo())
  with check (estado = 'pendiente' and private.is_evaluador_activo());

comment on policy "evaluador_dispara_evaluacion" on llamadas is
  'Permite exactamente la transicion cargada -> pendiente (boton "Evaluar"
  del dashboard). El worker despues consume "pendiente" con service_role,
  que bypassea RLS -- esta policy es solo para el click humano.';
