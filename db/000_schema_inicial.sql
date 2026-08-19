-- =========================================================
-- Sistema de Calificación de Calidad de Llamadas
-- Esquema + datos semilla (plantilla real "LID de montos grandes")
-- =========================================================
--
-- ⚠️  NUNCA CORRER ESTE ARCHIVO SOLO. ⚠️
--
-- Este es el estado del schema ANTES de la migración 001 — congelado a
-- propósito para conservar la historia real del proyecto (con qué arrancó,
-- vs. qué se corrigió después). No tiene `no_aplica`, `SIN_VEREDICTO`,
-- `criterio_evaluacion`, `veredicto_venta`, ni ninguna de las columnas o
-- funciones que las migraciones 001-019 agregaron.
--
-- Corrido solo, este archivo levanta una base con la lógica de veredicto
-- VIEJA — la que existía antes del `n/a` (migración 008). Fue justo el
-- riesgo detectado en la auditoría del 2026-08-18 (hallazgo H1): con hasta
-- 5 proyectos Supabase (uno por empresa cliente), un tenant nuevo levantado
-- solo con este archivo arrancaría roto.
--
-- Orden correcto para levantar un proyecto nuevo: ver db/README.md.
-- (Antes de la migración 014 este archivo se llamaba `schema.sql` — el
-- nombre viejo queda en el historial de git, no en el árbol actual.)

create extension if not exists "pgcrypto";

-- ---------- Asesores y evaluadores ----------

create table asesores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  equipo text,
  fecha_ingreso date,
  activo boolean not null default true
);

create table evaluadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);

-- ---------- Llamadas ----------

create type estado_llamada as enum ('pendiente', 'asignada', 'calificada');

create table llamadas (
  id uuid primary key default gen_random_uuid(),
  asesor_id uuid references asesores(id),
  fecha_hora timestamptz not null,
  duracion_seg integer,
  archivo_audio_url text,
  cliente_referencia text,
  estado estado_llamada not null default 'pendiente',
  fecha_carga timestamptz not null default now()
);

-- ---------- Plantillas de evaluación ----------

create table plantillas_evaluacion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  version integer not null default 1,
  activo boolean not null default true,
  fecha_vigencia_desde date not null default current_date
);

create table categorias_evaluacion (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid references plantillas_evaluacion(id) not null,
  nombre text not null,
  orden integer not null,
  umbral_aprobacion numeric not null default 0.66  -- fracción mínima de preguntas aprobadas
);

create table parametros_calidad (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references categorias_evaluacion(id) not null,
  pregunta text not null,
  escala_max integer not null default 2,
  valor_aprobacion_minimo integer not null default 2,
  orden integer not null,
  activo boolean not null default true
);

-- ---------- Calificaciones ----------

create table calificaciones (
  id uuid primary key default gen_random_uuid(),
  llamada_id uuid references llamadas(id) not null,
  plantilla_id uuid references plantillas_evaluacion(id) not null,
  evaluador_id uuid references evaluadores(id) not null,
  fecha_evaluacion timestamptz not null default now(),
  score_total numeric,
  comentarios_generales text
);

create table calificacion_detalle (
  id uuid primary key default gen_random_uuid(),
  calificacion_id uuid references calificaciones(id) not null,
  parametro_id uuid references parametros_calidad(id) not null,
  valor integer not null check (valor >= 0),
  comentario text
);

create table calificacion_categoria_resultado (
  id uuid primary key default gen_random_uuid(),
  calificacion_id uuid references calificaciones(id) not null,
  categoria_id uuid references categorias_evaluacion(id) not null,
  preguntas_aprobadas integer not null,
  preguntas_totales integer not null,
  veredicto text not null check (veredicto in ('SI', 'NO'))
);

-- ---------- Indicadores personalizados ----------

create table indicadores_personalizados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  formula_descripcion text,
  parametros_involucrados jsonb,
  activo boolean not null default true
);

-- =========================================================
-- DATOS SEMILLA: plantilla real "LID de montos grandes"
-- =========================================================

with plantilla as (
  insert into plantillas_evaluacion (nombre, version)
  values ('LID de montos grandes', 1)
  returning id
),
cat_perfilado as (
  insert into categorias_evaluacion (plantilla_id, nombre, orden, umbral_aprobacion)
  select id, 'Perfilado', 1, 0.66 from plantilla
  returning id
),
cat_monto as (
  insert into categorias_evaluacion (plantilla_id, nombre, orden, umbral_aprobacion)
  select id, 'Trabajo sobre el monto', 2, 0.66 from plantilla
  returning id
),
cat_objeciones as (
  insert into categorias_evaluacion (plantilla_id, nombre, orden, umbral_aprobacion)
  select id, 'Trabajo con objeciones', 3, 0.66 from plantilla
  returning id
)
insert into parametros_calidad (categoria_id, pregunta, escala_max, valor_aprobacion_minimo, orden)
select id, pregunta, 2, 2, orden from (
  select (select id from cat_perfilado) as id, '¿Conocemos la experiencia del cliente?' as pregunta, 1 as orden
  union all
  select (select id from cat_perfilado), '¿Conocemos el área de actividad del cliente?', 2
  union all
  select (select id from cat_perfilado), '¿Sabemos para qué vino el cliente (objetivos del cliente)?', 3
  union all
  select (select id from cat_monto), '¿Hay Up-sell con CVB (CV/CB) desde el perfil hasta el próximo status?', 1
  union all
  select (select id from cat_monto), '¿Hay solicitud de feedback?', 2
  union all
  select (select id from cat_monto), '¿Hay venta del manager de la sucursal?', 3
  union all
  select (select id from cat_objeciones), '¿Hay acoplamiento?', 1
  union all
  select (select id from cat_objeciones), '¿Existe argumento en contra?', 2
  union all
  select (select id from cat_objeciones), '¿Hay solicitud de feedback?', 3
) preguntas;

-- =========================================================
-- Ejemplo: función para calcular el veredicto de una categoría
-- (referencia de la lógica de negocio; ajustar a gusto en el backend)
-- =========================================================

create or replace function calcular_veredicto_categoria(p_calificacion_id uuid, p_categoria_id uuid)
returns text as $$
declare
  v_total integer;
  v_aprobadas integer;
  v_umbral numeric;
  v_veredicto text;
begin
  select umbral_aprobacion into v_umbral
  from categorias_evaluacion where id = p_categoria_id;

  select count(*) into v_total
  from parametros_calidad
  where categoria_id = p_categoria_id and activo = true;

  select count(*) into v_aprobadas
  from calificacion_detalle cd
  join parametros_calidad p on p.id = cd.parametro_id
  where cd.calificacion_id = p_calificacion_id
    and p.categoria_id = p_categoria_id
    and cd.valor >= p.valor_aprobacion_minimo;

  if v_total = 0 then
    v_veredicto := 'NO';
  elsif (v_aprobadas::numeric / v_total::numeric) >= v_umbral then
    v_veredicto := 'SI';
  else
    v_veredicto := 'NO';
  end if;

  return v_veredicto;
end;
$$ language plpgsql;
