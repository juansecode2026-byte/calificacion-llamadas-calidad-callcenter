-- Migracion 019: normalizar y validar el correo del asesor
--
-- Cierra H10 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- La unicidad de asesores.correo (migracion 002) es sensible a mayusculas
-- y a espacios, sin validar formato. El paso 1 del pipeline (CLAUDE.md)
-- resuelve al asesor por correo con autocompletado: "Juan@x.com" y
-- "juan@x.com " (con espacio) conviven hoy como dos asesores distintos y
-- parten el historico de llamadas en dos silenciosamente.

-- Primero se limpian los datos existentes (mejor esfuerzo, la tabla esta
-- vacia en este proyecto pero el mismo set de migraciones se aplica a
-- cada empresa cliente).
update asesores set correo = lower(trim(correo));

alter table asesores drop constraint asesores_correo_unique;

-- Unico sobre el valor normalizado, no sobre la columna cruda: dos
-- correos que solo difieren en mayusculas o espacios siguen chocando.
create unique index asesores_correo_unique
  on asesores (lower(trim(correo)));

alter table asesores add constraint asesores_correo_formato check (
  correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
);

comment on column asesores.correo is
  'Identificador del asesor en la carga manual (CLAUDE.md). La unicidad
  real es sobre lower(trim(correo)) -- ver el indice
  asesores_correo_unique. El servicio de busqueda del dashboard debe
  aplicar lower(trim()) al input antes de consultar, para usar el indice.';
