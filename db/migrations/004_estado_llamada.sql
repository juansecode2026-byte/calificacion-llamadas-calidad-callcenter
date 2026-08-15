-- Migración 004: estados del pipeline asíncrono
--
-- El flujo automatizado no tiene un paso de "asignación humana" — se
-- reemplaza estado_llamada por los pasos reales del pipeline (ver CLAUDE.md):
-- pendiente → transcribiendo → evaluando → calificada (+ error).
--
-- Postgres no permite quitar valores de un enum in-place: se crea un tipo
-- nuevo, se migra la columna, se elimina el tipo viejo.

create type estado_llamada_nuevo as enum (
  'pendiente',
  'transcribiendo',
  'evaluando',
  'calificada',
  'error'
);

-- El default actual ('pendiente'::estado_llamada) está tipado contra el enum
-- viejo: Postgres no puede castearlo solo y falla con "default for column
-- cannot be cast automatically". Se quita antes y se repone después.
alter table llamadas alter column estado drop default;

alter table llamadas
  alter column estado type estado_llamada_nuevo
  using (
    case estado::text
      when 'asignada' then 'pendiente'  -- ese paso ya no existe en el flujo automatizado
      else estado::text
    end
  )::estado_llamada_nuevo;

alter table llamadas alter column estado set default 'pendiente';

drop type estado_llamada;
alter type estado_llamada_nuevo rename to estado_llamada;
