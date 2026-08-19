-- Migracion 016: pg_temp explicito en el resto de las funciones
--
-- Cierra H7 de la auditoria (docs/revision-backend-db-2026-08-18.md).
-- calcular_veredicto_categoria() y contar_categoria() ya quedaron con
-- pg_temp en la migracion 015 -- esta migracion cubre las tres funciones
-- que quedaban con "set search_path = public" solo.
--
-- Sin pg_temp en el search_path, Postgres busca el schema temporal ANTES
-- que cualquier schema listado, incluso sin nombrarlo. Una tabla temporal
-- llamada "evaluadores" (o "calificacion_categoria_resultado") shadowea la
-- real. Para is_evaluador_activo() eso es especialmente grave: es el gate
-- de TODAS las policies del proyecto, y devolveria true para cualquiera
-- con permiso de crear una tabla temporal con ese nombre.
--
-- Poner "public, pg_temp" (pg_temp al final) hace que Postgres busque
-- public PRIMERO -- la tabla real siempre gana, y pg_temp solo se consulta
-- si no hay nada en public. Cierra el hueco sin tener que calificar cada
-- nombre de tabla dentro del cuerpo de la funcion.

create or replace function private.is_evaluador_activo()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from evaluadores
    where auth_user_id = auth.uid()
      and activo = true
  );
$$;

comment on function private.is_evaluador_activo() is
  'true si el usuario autenticado (auth.uid()) es un evaluador activo.
  search_path incluye pg_temp explicito y al final -- ver migracion 016.';

create or replace function calcular_veredicto_venta(p_calificacion_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_categorias_si integer;
begin
  select count(*) into v_categorias_si
  from calificacion_categoria_resultado
  where calificacion_id = p_calificacion_id
    and veredicto = 'SI';

  if v_categorias_si >= 2 then
    return 'CUENTA';
  else
    return 'NO_CUENTA';
  end if;
end;
$$;

comment on function calcular_veredicto_venta(uuid) is
  'Veredicto final: CUENTA si al menos 2 categorias dieron SI. Umbral
  absoluto (2), no proporcional. search_path incluye pg_temp -- ver
  migracion 016.';

create or replace function calificacion_requiere_revision(p_calificacion_id uuid)
returns boolean
language sql
security invoker
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from calificacion_categoria_resultado
    where calificacion_id = p_calificacion_id
      and veredicto = 'SIN_VEREDICTO'
  );
$$;

comment on function calificacion_requiere_revision(uuid) is
  'true si alguna categoria de la calificacion quedo en SIN_VEREDICTO.
  search_path incluye pg_temp -- ver migracion 016.';
