-- Migracion 022: coherencia y documentacion de preguntas_totales
--
-- Cierra H15 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- preguntas_totales cambio de significado en la migracion 008: paso de
-- "las 3 preguntas fijas de la categoria" a "las preguntas APLICABLES"
-- (las 3 menos las que resultaron n/a). El nombre de la columna no cambio,
-- y nada lo documentaba. Con SIN_VEREDICTO el valor legitimo es 0 -- un
-- consumidor (el dashboard) que no lo sepa puede dividir por cero al
-- mostrar "aprobadas/totales".
--
-- Se agrega un check de coherencia y se documenta el significado real.
-- Tambien se agrega preguntas_no_aplica, para que el dashboard pueda
-- mostrar "2/2 aplicables (1 n/a)" sin tener que recalcular contando
-- calificacion_detalle aparte -- para que el dato no quede en 0 siempre,
-- contar_categoria() y cerrar_calificacion() se actualizan para poblarlo.

alter table calificacion_categoria_resultado
  add constraint categoria_resultado_conteos_coherentes
  check (preguntas_aprobadas >= 0 and preguntas_aprobadas <= preguntas_totales);

alter table calificacion_categoria_resultado
  add column preguntas_no_aplica integer not null default 0;

comment on column calificacion_categoria_resultado.preguntas_totales is
  'Preguntas APLICABLES de la categoria en esta calificacion (las 3 menos
  las que resultaron n/a) -- NO es un total fijo de la plantilla. Vale 0
  cuando el veredicto es SIN_VEREDICTO: el consumidor debe cortocircuitar
  antes de dividir, nunca asumir "aprobadas/totales" sin chequear 0.';

comment on column calificacion_categoria_resultado.preguntas_no_aplica is
  'Cuantas preguntas de la categoria resultaron n/a en esta calificacion.
  preguntas_totales + preguntas_no_aplica = preguntas activas de la
  categoria (3 en la plantilla actual), salvo que falten detalles.';

-- ---------- contar_categoria(): suma el conteo de n/a ----------
--
-- Cambia la firma de retorno (se agrega no_aplicables): CREATE OR REPLACE
-- no permite cambiar el tipo de retorno de una funcion existente -- hay
-- que soltarla primero. calcular_veredicto_categoria() referencia esta
-- funcion por nombre dentro de su cuerpo, no via una dependencia dura de
-- Postgres (pg_depend no registra llamadas funcion-a-funcion), asi que el
-- DROP no falla por eso.

drop function if exists contar_categoria(uuid, uuid);

create function contar_categoria(p_calificacion_id uuid, p_categoria_id uuid)
returns table(faltantes integer, aplicables integer, aprobadas integer, no_aplicables integer)
language sql
security invoker
set search_path = public, pg_temp
stable
as $$
  select
    count(*) filter (where cd.id is null)::integer,
    count(*) filter (where cd.id is not null and cd.no_aplica = false)::integer,
    count(*) filter (where cd.id is not null and cd.no_aplica = false
                        and cd.valor >= p.valor_aprobacion_minimo)::integer,
    count(*) filter (where cd.id is not null and cd.no_aplica = true)::integer
  from parametros_calidad p
  left join calificacion_detalle cd
    on cd.parametro_id = p.id and cd.calificacion_id = p_calificacion_id
  where p.categoria_id = p_categoria_id and p.activo = true;
$$;

comment on function contar_categoria(uuid, uuid) is
  'Cuenta faltantes/aplicables/aprobadas/no_aplicables de una categoria
  para una calificacion, desde parametros_calidad (LEFT JOIN). Fuente
  unica de verdad: calcular_veredicto_categoria() y cerrar_calificacion()
  la usan las dos, para no mantener el mismo conteo escrito dos veces.';

-- ---------- cerrar_calificacion(): guarda preguntas_no_aplica ----------

create or replace function cerrar_calificacion(p_calificacion_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
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
