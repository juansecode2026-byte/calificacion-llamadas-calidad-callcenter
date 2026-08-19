-- Migracion 021: cota superior en calificacion_detalle.valor
--
-- Cierra H14 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- El check original solo exigia "valor >= 0", sin techo. Una correccion
-- humana con valor=7 (o cualquier numero) entraba sin problema y aprobaba
-- la pregunta -- el check no reflejaba que la plantilla actual es binaria
-- (0 o 2, ver CLAUDE.md).
--
-- Si en el futuro se habilita escala 0-1-2 (parametros_calidad.escala_max
-- ya lo contempla en el schema, aunque hoy no se usa), este check hay que
-- reemplazarlo por un trigger que valide contra escala_max de la pregunta,
-- no por una lista fija.

alter table calificacion_detalle
  drop constraint calificacion_detalle_valor_check;

alter table calificacion_detalle
  add constraint calificacion_detalle_valor_rango
  check (valor is null or valor in (0, 2));

comment on constraint calificacion_detalle_valor_rango on calificacion_detalle is
  'Binario 0/2, coherente con la plantilla actual (todas sus preguntas son
  escala_max=2). Si se habilita escala 0-1-2, reemplazar por un trigger
  contra parametros_calidad.escala_max en vez de una lista fija.';
