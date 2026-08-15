-- Migración 001: áreas del asesor
--
-- Cada empresa cliente usa su propio proyecto Supabase (aislamiento por
-- infraestructura, no por columna empresa_id) — por eso "areas" no lleva
-- empresa_id: dentro de un proyecto, todo pertenece a una sola empresa.

create table areas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);

alter table asesores
  add column area_id uuid references areas(id);
