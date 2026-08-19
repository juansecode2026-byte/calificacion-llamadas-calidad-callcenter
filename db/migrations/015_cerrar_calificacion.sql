-- Migracion 015: cerrar_calificacion() como unico camino de escritura
--
-- Cierra H5 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- calcular_veredicto_venta() y calificacion_requiere_revision() (migracion
-- 011) existen desde hace dias pero NADA las invoca: veredicto_venta queda
-- NULL y requiere_revision en false a menos que alguien las llame a mano.
-- El invariante "una categoria en SIN_VEREDICTO marca requiere_revision"
-- dependia de que el worker se acordara.
--
-- Se agrega cerrar_calificacion(): recorre las categorias de la plantilla,
-- guarda el resultado por categoria y escribe el veredicto de venta. El
-- worker la llama una sola vez al final del paso 4 del pipeline (CLAUDE.md)
-- y no hace nada de esto a mano.
--
-- De paso se factoriza el conteo que ya usaba calcular_veredicto_categoria()
-- (migracion 014) en una funcion propia, contar_categoria(): sin esto,
-- cerrar_calificacion() tendria que reescribir la misma consulta para
-- guardar preguntas_aprobadas/preguntas_totales, y dos copias de la misma
-- logica es exactamente el patron que origino H1 y H3 (una se actualiza,
-- la otra no). Ahora hay una sola fuente de verdad.
--
-- NO se agrega un trigger automatico sobre calificacion_detalle. Se
-- considero (es lo que sugiere el informe) pero un trigger AFTER INSERT FOR
-- EACH ROW dispararia cerrar_calificacion() despues de CADA fila insertada,
-- no despues de las 9 juntas -- y calcular_veredicto_categoria() (H3) hoy
-- falla a proposito si falta una sola. Insertar las 9 preguntas de una
-- llamada de a una explotaria el trigger en la primera fila. La razon que
-- motivaba el trigger (que una correccion humana no deje el veredicto
-- viejo colgado) ya la resuelve la migracion 017: ahi el usuario deja de
-- poder tocar "valor" via RLS, solo "comentario". El unico camino que
-- todavia escribe "valor" es el worker (service_role), que ya llama a
-- cerrar_calificacion() explicito. Si mas adelante se necesita disparo
-- automatico, la forma segura es un CONSTRAINT TRIGGER DEFERRABLE INITIALLY
-- DEFERRED (dispara al COMMIT, cuando las 9 filas ya estan), no un trigger
-- normal.

-- =========================================================
-- Helper compartido: conteo de una categoria para una calificacion
-- =========================================================

create or replace function contar_categoria(p_calificacion_id uuid, p_categoria_id uuid)
returns table(faltantes integer, aplicables integer, aprobadas integer)
language sql
security invoker
set search_path = public, pg_temp
stable
as $$
  select
    count(*) filter (where cd.id is null)::integer,
    count(*) filter (where cd.id is not null and cd.no_aplica = false)::integer,
    count(*) filter (where cd.id is not null and cd.no_aplica = false
                        and cd.valor >= p.valor_aprobacion_minimo)::integer
  from parametros_calidad p
  left join calificacion_detalle cd
    on cd.parametro_id = p.id and cd.calificacion_id = p_calificacion_id
  where p.categoria_id = p_categoria_id and p.activo = true;
$$;

comment on function contar_categoria(uuid, uuid) is
  'Cuenta faltantes/aplicables/aprobadas de una categoria para una
  calificacion, desde parametros_calidad (LEFT JOIN). Fuente unica de
  verdad: calcular_veredicto_categoria() y cerrar_calificacion() la usan
  las dos, para no mantener el mismo conteo escrito dos veces.';

-- =========================================================
-- calcular_veredicto_categoria(): reescrita para usar el helper
-- =========================================================
-- Mismo comportamiento que dejo la migracion 014 (raise exception si falta
-- un detalle o si la categoria no existe). Cambia como calcula: antes tenia
-- la consulta propia, ahora llama a contar_categoria(). Tambien suma
-- pg_temp al search_path, que la 014 no incluyo (ver migracion 016 para el
-- resto de las funciones con el mismo vacio).

create or replace function calcular_veredicto_categoria(p_calificacion_id uuid, p_categoria_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
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

comment on function calcular_veredicto_categoria(uuid, uuid) is
  'Veredicto SI/NO/SIN_VEREDICTO de una categoria, via contar_categoria().
  Falla (raise exception) si falta un detalle o si la categoria no existe,
  en vez de devolver un veredicto silencioso. search_path fijo desde el
  propio CREATE, incluido pg_temp.';

-- =========================================================
-- cerrar_calificacion(): unico camino de escritura del resultado
-- =========================================================

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
      (calificacion_id, categoria_id, preguntas_aprobadas, preguntas_totales, veredicto)
    values
      (p_calificacion_id, v_categoria.id, v_conteo.aprobadas, v_conteo.aplicables, v_veredicto)
    on conflict (calificacion_id, categoria_id) do update
      set preguntas_aprobadas = excluded.preguntas_aprobadas,
          preguntas_totales = excluded.preguntas_totales,
          veredicto = excluded.veredicto;
  end loop;

  update calificaciones
    set veredicto_venta = calcular_veredicto_venta(p_calificacion_id),
        requiere_revision = calificacion_requiere_revision(p_calificacion_id)
    where id = p_calificacion_id;
end;
$$;

comment on function cerrar_calificacion(uuid) is
  'Unico camino de escritura del resultado de una calificacion. Recorre las
  categorias de su plantilla, guarda calificacion_categoria_resultado, y
  escribe veredicto_venta + requiere_revision en calificaciones. El worker
  la llama una vez al final del paso 4 del pipeline (CLAUDE.md), despues de
  insertar los detalles de las 9 preguntas -- nunca antes.';
