-- Políticas RLS — baseline mínimo
--
-- Requiere: db/schema.sql + db/migrations/001 a 009 ya aplicadas
-- (en particular la 009, que agrega evaluadores.auth_user_id).
--
-- Alcance de este archivo: el guardrail día uno, no el diseño fino de
-- roles. docs/CONTEXT.md marca "Roles y permisos del dashboard" como
-- pendiente — cuando se resuelva (ej. rol admin separado de calidad, o
-- login de asesor), esto se amplía en un archivo nuevo (002_roles.sql),
-- nunca editando este in-place una vez aplicado en producción.
--
-- Regla de fondo (STACK.md): "RLS obligatorio desde el primer día, incluso
-- con un solo cliente o un solo usuario". Este proyecto Supabase es de una
-- sola empresa (aislamiento multi-tenant por infraestructura, no por
-- columna) — acá RLS no separa empresas, separa quién adentro de la
-- empresa puede ver o tocar qué, y bloquea a cualquier no-autenticado.

-- =========================================================
-- Helper: ¿el usuario logueado es personal de calidad activo?
-- =========================================================
-- security definer + search_path fijo: evita que la función quede sujeta a
-- la RLS de "evaluadores" que ella misma ayuda a evaluar (recursión), y
-- evita el riesgo de search_path hijacking en funciones security definer.

create or replace function is_evaluador_activo()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from evaluadores
    where auth_user_id = auth.uid()
      and activo = true
  );
$$;

comment on function is_evaluador_activo() is
  'true si el usuario autenticado (auth.uid()) es un evaluador activo. Usarla en las políticas en vez de repetir el subquery — un solo lugar para cambiar la regla de "quién es personal de calidad".';

-- =========================================================
-- Habilitar RLS en todas las tablas
-- =========================================================
-- Sin esto, el rol anon/authenticated accede según los grants por defecto
-- de Postgres/Supabase — es el hueco más común en proyectos nuevos.

alter table areas enable row level security;
alter table asesores enable row level security;
alter table evaluadores enable row level security;
alter table llamadas enable row level security;
alter table transcripciones enable row level security;
alter table plantillas_evaluacion enable row level security;
alter table categorias_evaluacion enable row level security;
alter table parametros_calidad enable row level security;
alter table calificaciones enable row level security;
alter table calificacion_detalle enable row level security;
alter table calificacion_categoria_resultado enable row level security;
alter table indicadores_personalizados enable row level security;
alter table configuracion_empresa enable row level security;
alter table notificaciones enable row level security;

-- =========================================================
-- Lectura: cualquier evaluador activo lee todo
-- =========================================================
-- anon queda afuera por diseño: no se le crea ninguna policy, y con RLS
-- habilitado y sin policies, el acceso es denegado por defecto.

create policy "evaluador_lee_areas" on areas
  for select using (is_evaluador_activo());

create policy "evaluador_lee_asesores" on asesores
  for select using (is_evaluador_activo());

create policy "evaluador_lee_evaluadores" on evaluadores
  for select using (is_evaluador_activo());

create policy "evaluador_lee_llamadas" on llamadas
  for select using (is_evaluador_activo());

create policy "evaluador_lee_transcripciones" on transcripciones
  for select using (is_evaluador_activo());

create policy "evaluador_lee_plantillas" on plantillas_evaluacion
  for select using (is_evaluador_activo());

create policy "evaluador_lee_categorias" on categorias_evaluacion
  for select using (is_evaluador_activo());

create policy "evaluador_lee_parametros" on parametros_calidad
  for select using (is_evaluador_activo());

create policy "evaluador_lee_calificaciones" on calificaciones
  for select using (is_evaluador_activo());

create policy "evaluador_lee_calificacion_detalle" on calificacion_detalle
  for select using (is_evaluador_activo());

create policy "evaluador_lee_categoria_resultado" on calificacion_categoria_resultado
  for select using (is_evaluador_activo());

create policy "evaluador_lee_indicadores" on indicadores_personalizados
  for select using (is_evaluador_activo());

create policy "evaluador_lee_configuracion_empresa" on configuracion_empresa
  for select using (is_evaluador_activo());

create policy "evaluador_lee_notificaciones" on notificaciones
  for select using (is_evaluador_activo());

-- =========================================================
-- Escritura: acotada a lo que un humano corrige a mano
-- =========================================================
-- El pipeline (ingesta, transcripción, calificación IA, cálculo,
-- notificación) corre con la service key desde backend/worker y
-- backend/functions — service_role bypassea RLS automáticamente en
-- Supabase, no necesita policy. Estas policies son solo para lo que el
-- humano hace desde el dashboard: corregir una calificación de la IA.

create policy "evaluador_corrige_calificacion_detalle" on calificacion_detalle
  for update
  using (is_evaluador_activo())
  with check (is_evaluador_activo());

-- Nada más admite insert/update/delete desde authenticated todavía: la
-- carga manual de llamadas pasa por una Edge Function (backend/functions,
-- service key), no por escritura directa del cliente contra la tabla.
-- Si el dashboard necesita insertar/editar algo más en el futuro (ej. crear
-- un asesor a mano), agregar esa policy puntual entonces — no abrir de más
-- "por si acaso".
