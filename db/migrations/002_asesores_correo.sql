-- Migración 002: identificación del asesor por correo, nombres/apellidos separados
--
-- CLAUDE.md especifica que la carga manual busca al asesor por su correo
-- (con autocompletado y confirmación visual del nombre). Hoy `asesores.nombre`
-- es un solo campo; se separa en nombres/apellidos para el formulario.

alter table asesores
  add column correo text,
  add column nombres text,
  add column apellidos text;

-- Migración de datos existentes: mejor esfuerzo, todo "nombre" pasa a
-- "nombres" (no hay separador confiable entre nombre y apellido en datos ya
-- cargados). Revisar/corregir a mano si el proyecto ya tiene asesores reales.
update asesores set nombres = nombre where nombres is null;

-- correo se vuelve obligatorio y único recién acá, después del backfill,
-- para no romper si ya hay filas sin correo cargado todavía.
-- Si esta migración falla por filas sin correo: completarlas a mano primero.
alter table asesores
  alter column correo set not null,
  add constraint asesores_correo_unique unique (correo);

-- "nombre" queda obsoleto pero no se elimina en esta migración, para no
-- perder datos si algo más todavía lo referencia. Retirarla en una migración
-- aparte una vez confirmado que nada la usa.
comment on column asesores.nombre is 'OBSOLETO — reemplazado por nombres/apellidos. Ver migración 002.';
