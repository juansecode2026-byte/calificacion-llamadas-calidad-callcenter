-- Migracion 024: las funciones de calculo internas pasan a private
--
-- Cierra H17 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- calcular_veredicto_categoria(), contar_categoria(),
-- calcular_veredicto_venta() y calificacion_requiere_revision() vivian en
-- public, asi que PostgREST las publicaba como endpoints en
-- /rest/v1/rpc/<nombre> -- superficie de API que nadie pidio, igual que
-- paso con is_evaluador_activo() (ver policies/002_helper_a_schema_privado).
--
-- cerrar_calificacion() (migracion 015) es el unico punto de entrada
-- pensado para llamarse desde afuera -- el worker la invoca via RPC al
-- final del pipeline. Por eso ES la que se queda en public; las otras
-- cuatro son plumbing interno y se mueven a private.
--
-- DESVIACION DELIBERADA de la solucion que sugiere el informe: NO se
-- revoca "usage on schema private from anon". Las policies de
-- db/policies/001_baseline.sql no tienen clausula "to <rol>" -- aplican a
-- PUBLIC, es decir se evaluan tambien para el rol anon. Como esas policies
-- llaman a private.is_evaluador_activo() dentro de su USING, revocarle a
-- anon el USAGE del schema private rompe la evaluacion de la policy con
-- "permission denied" en vez de denegar limpio -- exactamente el error que
-- ya se documento y se descarto en policies/002 (ver su comentario "Intento
-- descartado"). El schema private sigue con
-- "grant usage on schema private to anon, authenticated" intacto.

alter function calcular_veredicto_categoria(uuid, uuid) set schema private;
alter function contar_categoria(uuid, uuid) set schema private;
alter function calcular_veredicto_venta(uuid) set schema private;
alter function calificacion_requiere_revision(uuid) set schema private;

-- Las dos funciones que llaman a otras de este grupo por nombre sin
-- calificar necesitan "private" en su propio search_path para seguir
-- resolviendo esas llamadas ahora que el destino cambio de schema.

create or replace function private.calcular_veredicto_categoria(p_calificacion_id uuid, p_categoria_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_umbral numeric;
  v_conteo record;
  v_veredicto text;
begin
  select umbral_aprobacion into v_umbral
  from categorias_evaluacion where id = p_categoria_id;

  if not found or v_umbral is null then
    raise exception 'categoria_evaluacion % inexistente o sin umbral_aprobacion', p_categoria_id;
  end if;

  select * into v_conteo from contar_categoria(p_calificacion_id, p_categoria_id);

  if v_conteo.faltantes > 0 then
    raise exception 'faltan % detalle(s) para la categoria % en la calificacion %',
      v_conteo.faltantes, p_categoria_id, p_calificacion_id;
  end if;

  if v_conteo.aplicables = 0 then
    v_veredicto := 'SIN_VEREDICTO';
  elsif (v_conteo.aprobadas::numeric / v_conteo.aplicables::numeric) >= v_umbral then
    v_veredicto := 'SI';
  else
    v_veredicto := 'NO';
  end if;

  return v_veredicto;
end;
$$;

comment on function private.calcular_veredicto_categoria(uuid, uuid) is
  'Movida a private en la migracion 024 -- ya no es endpoint de PostgREST.
  search_path incluye "private" para resolver la llamada a
  contar_categoria(), que se movio al mismo schema.';

create or replace function cerrar_calificacion(p_calificacion_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_plantilla_id uuid;
  v_categoria record;
  v_conteo record;
  v_veredicto text;
begin
  select plantilla_id into v_plantilla_id
  from calificaciones where id = p_calificacion_id;

  if not found then
    raise exception 'calificacion % inexistente', p_calificacion_id;
  end if;

  for v_categoria in
    select id from categorias_evaluacion where plantilla_id = v_plantilla_id
  loop
    v_veredicto := calcular_veredicto_categoria(p_calificacion_id, v_categoria.id);
    select * into v_conteo from contar_categoria(p_calificacion_id, v_categoria.id);

    insert into calificacion_categoria_resultado
      (calificacion_id, categoria_id, preguntas_aprobadas, preguntas_totales,
       preguntas_no_aplica, veredicto)
    values
      (p_calificacion_id, v_categoria.id, v_conteo.aprobadas, v_conteo.aplicables,
       v_conteo.no_aplicables, v_veredicto)
    on conflict (calificacion_id, categoria_id) do update
      set preguntas_aprobadas = excluded.preguntas_aprobadas,
          preguntas_totales = excluded.preguntas_totales,
          preguntas_no_aplica = excluded.preguntas_no_aplica,
          veredicto = excluded.veredicto;
  end loop;

  update calificaciones
    set veredicto_venta = calcular_veredicto_venta(p_calificacion_id),
        requiere_revision = calificacion_requiere_revision(p_calificacion_id)
    where id = p_calificacion_id;
end;
$$;

comment on function cerrar_calificacion(uuid) is
  'Unico camino de escritura del resultado de una calificacion, y unico
  punto de esta familia de funciones que se queda en public -- el worker
  la llama por RPC al final del pipeline. search_path incluye "private"
  para resolver las llamadas a calcular_veredicto_categoria(),
  calcular_veredicto_venta() y calificacion_requiere_revision(), las tres
  movidas a private en esta misma migracion.';
