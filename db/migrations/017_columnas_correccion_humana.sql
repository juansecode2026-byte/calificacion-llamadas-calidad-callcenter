-- Migracion 017: la correccion humana solo puede tocar comentario
--
-- Cierra H6 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- La policy "evaluador_corrige_calificacion_detalle" (db/policies/001)
-- filtra QUE FILAS puede tocar un evaluador (RLS), pero no filtra QUE
-- COLUMNAS -- eso RLS no lo puede hacer. Sin un grant a nivel de columna,
-- un evaluador con permiso de UPDATE sobre la fila puede cambiar "valor",
-- "no_aplica" o incluso "parametro_id", aunque CLAUDE.md limita la
-- correccion humana a la justificacion (comentario). Y si cambia "valor",
-- calificacion_categoria_resultado queda desincronizado -- nada la
-- recalcula sola.
--
-- Los grants de Supabase por defecto le dan a "authenticated" UPDATE sobre
-- toda columna de las tablas de public a menos que se revoque. Se revoca
-- el UPDATE amplio y se otorga solo sobre las dos columnas que un humano
-- puede tocar.

revoke update on calificacion_detalle from authenticated;
grant update (comentario, corregido_por_humano) on calificacion_detalle to authenticated;

-- Un evaluador que corrige el comentario de una fila que vino de la IA
-- deberia marcar corregido_por_humano el solo, pero no hay garantia de que
-- el cliente lo haga -- se fuerza en la base para que no dependa de que el
-- frontend se acuerde.

create or replace function marcar_correccion_humana()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.comentario is distinct from old.comentario and old.origen = 'ia' then
    new.corregido_por_humano := true;
  end if;
  return new;
end;
$$;

comment on function marcar_correccion_humana() is
  'Trigger BEFORE UPDATE en calificacion_detalle: si cambia el comentario
  de una fila que vino de la IA, fuerza corregido_por_humano = true sin
  depender de que el cliente lo mande.';

drop trigger if exists trg_marcar_correccion_humana on calificacion_detalle;

create trigger trg_marcar_correccion_humana
  before update on calificacion_detalle
  for each row
  execute function marcar_correccion_humana();
