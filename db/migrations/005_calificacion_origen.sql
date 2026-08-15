-- Migración 005: origen de la calificación (transición manual → IA)
--
-- CLAUDE.md: "scores y score_detail distinguen origen manual vs. IA, y
-- permiten corrección humana sobre la justificación de la IA". El proceso
-- de hoy es manual; la meta es automatizado — este campo sirve para los dos,
-- sin tener que rediseñar el schema cuando se complete la transición.

alter table calificacion_detalle
  add column origen text not null default 'ia' check (origen in ('humano', 'ia')),
  add column justificacion_ia text,
  add column corregido_por_humano boolean not null default false;

comment on column calificacion_detalle.comentario is
  'Nota humana sobre el valor final — la justificación propia (si origen=humano) o la corrección sobre la justificación de la IA (si origen=ia y corregido_por_humano=true).';
comment on column calificacion_detalle.justificacion_ia is
  'Justificación generada por el agente/IA, con evidencia de la transcripción. Null si origen=humano.';
