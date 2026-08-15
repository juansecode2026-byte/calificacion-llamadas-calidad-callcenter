-- Migración 008: valor "n/a" y veredicto siempre-texto
--
-- CLAUDE.md (Reglas de negocio clave):
-- - "n/a" es una excepción estructural (la situación no se dio en la
--   llamada), nunca un comodín por ambigüedad — eso sigue siendo 0.
-- - Las preguntas en n/a se excluyen del cálculo de la categoría: el
--   denominador baja de 3 a las preguntas aplicables.
-- - Si las 3 preguntas de una categoría son n/a, esa categoría queda sin
--   veredicto (no se aprueba ni se rechaza por defecto).
-- - El veredicto de categoría es SIEMPRE texto ("SI"/"NO"), nunca un número
--   — bug real detectado: una fórmula mal copiada mostró "2" en vez de "SI".

-- ---------- calificacion_detalle: permitir n/a ----------
-- valor ya admite NULL para una fila en n/a (el check "valor >= 0" del
-- schema original ya deja pasar NULL sin cambios: en SQL, CHECK sobre NULL
-- no falla). Solo hace falta quitar el NOT NULL y agregar la marca explícita
-- de "no aplica" + la regla de exclusividad valor/no_aplica.

alter table calificacion_detalle
  alter column valor drop not null,
  add column no_aplica boolean not null default false;

alter table calificacion_detalle
  add constraint calificacion_detalle_valor_o_na check (
    (no_aplica = true and valor is null)
    or (no_aplica = false and valor is not null)
  );

comment on column calificacion_detalle.no_aplica is
  'true solo cuando la situación evaluada por la pregunta no se dio en esta llamada (ausencia estructural). Nunca por ambigüedad en la transcripción — eso se califica 0. Ver backend/agent/system_prompt.md, regla 8.';

-- ---------- calificacion_categoria_resultado: tercer estado ----------

alter table calificacion_categoria_resultado
  drop constraint calificacion_categoria_resultado_veredicto_check;

alter table calificacion_categoria_resultado
  add constraint calificacion_categoria_resultado_veredicto_check
  check (veredicto in ('SI', 'NO', 'SIN_VEREDICTO'));

comment on column calificacion_categoria_resultado.veredicto is
  'SI/NO/SIN_VEREDICTO — siempre texto, nunca un número. SIN_VEREDICTO cuando todas las preguntas aplicables de la categoría resultaron n/a (denominador 0): no se aprueba ni se rechaza por defecto, queda marcada para revisión.';

-- ---------- calcular_veredicto_categoria(): excluir n/a del cálculo ----------

create or replace function calcular_veredicto_categoria(p_calificacion_id uuid, p_categoria_id uuid)
returns text as $$
declare
  v_aplicables integer;
  v_aprobadas integer;
  v_umbral numeric;
  v_veredicto text;
begin
  select umbral_aprobacion into v_umbral
  from categorias_evaluacion where id = p_categoria_id;

  -- Preguntas aplicables = las de la categoría que NO quedaron en n/a para
  -- esta calificación puntual (el denominador ya no es fijo en 3).
  select count(*) into v_aplicables
  from calificacion_detalle cd
  join parametros_calidad p on p.id = cd.parametro_id
  where cd.calificacion_id = p_calificacion_id
    and p.categoria_id = p_categoria_id
    and p.activo = true
    and cd.no_aplica = false;

  select count(*) into v_aprobadas
  from calificacion_detalle cd
  join parametros_calidad p on p.id = cd.parametro_id
  where cd.calificacion_id = p_calificacion_id
    and p.categoria_id = p_categoria_id
    and p.activo = true
    and cd.no_aplica = false
    and cd.valor >= p.valor_aprobacion_minimo;

  if v_aplicables = 0 then
    v_veredicto := 'SIN_VEREDICTO';  -- las 3 preguntas resultaron n/a
  elsif (v_aprobadas::numeric / v_aplicables::numeric) >= v_umbral then
    v_veredicto := 'SI';
  else
    v_veredicto := 'NO';
  end if;

  return v_veredicto;
end;
$$ language plpgsql;
