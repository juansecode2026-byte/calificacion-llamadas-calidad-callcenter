-- Migración 014: cerrar los hallazgos bloqueantes de la auditoría de
-- revisor-frontend-backend (docs/revision-backend-db-2026-08-18.md)
--
-- H2 — Sin unique en calificacion_detalle ni en
-- calificacion_categoria_resultado, un reintento del worker podía duplicar
-- filas y hacer que calcular_veredicto_venta() contara dos veces la misma
-- categoría en 'SI' — bastaba una sola categoría aprobada para devolver
-- CUENTA, rompiendo el umbral absoluto de 2 de 3 (migración 011).
--
-- H3 — calcular_veredicto_categoria() contaba "aplicables" a partir de las
-- filas que EXISTEN en calificacion_detalle, no de los parámetros activos
-- de la categoría. Una pregunta que el agente no devolvió (fila ausente) se
-- comportaba igual que un n/a legítimo: el denominador bajaba en silencio
-- en vez de fallar.
--
-- De paso, mismo cuerpo de función, no amerita otra migración aparte:
-- H4 — un categoria_id inexistente devolvía 'NO' en vez de fallar
-- (v_umbral quedaba NULL, la comparación numérica con NULL da NULL, y el
-- flujo caía en el ELSE). Ahora es un error explícito.
--
-- Se fija además el search_path DENTRO del CREATE, no con ALTER FUNCTION
-- como hizo la 010: un CREATE OR REPLACE futuro sobre esta función ya no
-- pierde el hardening por accidente si alguien olvida repetir el ALTER.

-- =========================================================
-- H2: unicidad — una fila por (calificación, parámetro) y por
-- (calificación, categoría)
-- =========================================================

alter table calificacion_detalle
  add constraint calificacion_detalle_unica_por_parametro
  unique (calificacion_id, parametro_id);

alter table calificacion_categoria_resultado
  add constraint categoria_resultado_unica_por_categoria
  unique (calificacion_id, categoria_id);

-- Los índices de la 012 quedan cubiertos por el prefijo del unique
-- compuesto (calificacion_id es la primera columna en ambos) — mantenerlos
-- aparte es redundante.
drop index if exists idx_calificacion_detalle_calificacion;
drop index if exists idx_calificacion_categoria_resultado_calificacion;

-- =========================================================
-- H3 + H4: recalcular desde los parámetros activos, nunca desde las filas
-- que ya existen en el detalle
-- =========================================================

create or replace function calcular_veredicto_categoria(p_calificacion_id uuid, p_categoria_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_faltantes integer;
  v_aplicables integer;
  v_aprobadas integer;
  v_umbral numeric;
  v_veredicto text;
begin
  select umbral_aprobacion into v_umbral
  from categorias_evaluacion where id = p_categoria_id;

  if not found or v_umbral is null then
    raise exception 'categoria_evaluacion % inexistente o sin umbral_aprobacion', p_categoria_id;
  end if;

  -- LEFT JOIN desde los parámetros activos de la categoría, no desde el
  -- detalle: así una fila ausente en calificacion_detalle se detecta como
  -- "falta un detalle" (v_faltantes > 0) y no se confunde con un n/a
  -- legítimo (que sí tiene fila, con no_aplica = true).
  select
    count(*) filter (where cd.id is null),
    count(*) filter (where cd.id is not null and cd.no_aplica = false),
    count(*) filter (where cd.id is not null and cd.no_aplica = false
                        and cd.valor >= p.valor_aprobacion_minimo)
    into v_faltantes, v_aplicables, v_aprobadas
  from parametros_calidad p
  left join calificacion_detalle cd
    on cd.parametro_id = p.id and cd.calificacion_id = p_calificacion_id
  where p.categoria_id = p_categoria_id and p.activo = true;

  if v_faltantes > 0 then
    raise exception 'faltan % detalle(s) para la categoria % en la calificacion %',
      v_faltantes, p_categoria_id, p_calificacion_id;
  end if;

  if v_aplicables = 0 then
    v_veredicto := 'SIN_VEREDICTO';  -- todas las preguntas aplicables resultaron n/a
  elsif (v_aprobadas::numeric / v_aplicables::numeric) >= v_umbral then
    v_veredicto := 'SI';
  else
    v_veredicto := 'NO';
  end if;

  return v_veredicto;
end;
$$;

comment on function calcular_veredicto_categoria(uuid, uuid) is
  'Veredicto SI/NO/SIN_VEREDICTO de una categoria. Cuenta "aplicables"
  desde parametros_calidad (LEFT JOIN), no desde calificacion_detalle:
  una fila faltante hace fallar la funcion en vez de tratarse como n/a.
  search_path fijo desde el propio CREATE, no por un ALTER FUNCTION
  aparte como en la migracion 010.';
