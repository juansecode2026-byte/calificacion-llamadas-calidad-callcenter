-- Migracion 025: ON DELETE explicito en todas las foreign keys
--
-- Cierra H19 de la auditoria (docs/revision-backend-db-2026-08-18.md).
-- Ninguna FK declaraba ON DELETE: por defecto Postgres usa NO ACTION,
-- asi que borrar una llamada obligaba a limpiar a mano, en orden, cada
-- tabla hija -- un paso manual propenso a error y facil de olvidar.
--
-- El informe listo 6 de las 13 FKs del proyecto. Se completan las 13 con
-- el mismo criterio, verificado contra pg_constraint antes de escribir
-- (los nombres son los que Postgres genero automaticamente al declarar
-- "references" sin CONSTRAINT explicito):
--
-- CASCADE -- filas que son satelite de UNA calificacion o UNA llamada y no
-- tienen significado propio fuera de esa relacion:
--   calificacion_detalle.calificacion_id
--   calificacion_categoria_resultado.calificacion_id
--   notificaciones.calificacion_id
--   transcripciones.llamada_id
--
-- RESTRICT -- todo lo demas: protege datos de referencia/plantilla y los
-- registros "padre" de un borrado accidental. Coherente con el patron ya
-- establecido en el proyecto de desactivar con la columna "activo" en vez
-- de borrar (asesores, evaluadores, parametros_calidad, plantillas,
-- categorias ya lo usan).

alter table calificacion_detalle
  drop constraint calificacion_detalle_calificacion_id_fkey,
  add constraint calificacion_detalle_calificacion_id_fkey
    foreign key (calificacion_id) references calificaciones(id) on delete cascade;

alter table calificacion_categoria_resultado
  drop constraint calificacion_categoria_resultado_calificacion_id_fkey,
  add constraint calificacion_categoria_resultado_calificacion_id_fkey
    foreign key (calificacion_id) references calificaciones(id) on delete cascade;

alter table notificaciones
  drop constraint notificaciones_calificacion_id_fkey,
  add constraint notificaciones_calificacion_id_fkey
    foreign key (calificacion_id) references calificaciones(id) on delete cascade;

alter table transcripciones
  drop constraint transcripciones_llamada_id_fkey,
  add constraint transcripciones_llamada_id_fkey
    foreign key (llamada_id) references llamadas(id) on delete cascade;

alter table asesores
  drop constraint asesores_area_id_fkey,
  add constraint asesores_area_id_fkey
    foreign key (area_id) references areas(id) on delete restrict;

alter table calificacion_categoria_resultado
  drop constraint calificacion_categoria_resultado_categoria_id_fkey,
  add constraint calificacion_categoria_resultado_categoria_id_fkey
    foreign key (categoria_id) references categorias_evaluacion(id) on delete restrict;

alter table calificacion_detalle
  drop constraint calificacion_detalle_parametro_id_fkey,
  add constraint calificacion_detalle_parametro_id_fkey
    foreign key (parametro_id) references parametros_calidad(id) on delete restrict;

alter table calificaciones
  drop constraint calificaciones_evaluador_id_fkey,
  add constraint calificaciones_evaluador_id_fkey
    foreign key (evaluador_id) references evaluadores(id) on delete restrict;

alter table calificaciones
  drop constraint calificaciones_llamada_id_fkey,
  add constraint calificaciones_llamada_id_fkey
    foreign key (llamada_id) references llamadas(id) on delete restrict;

alter table calificaciones
  drop constraint calificaciones_plantilla_id_fkey,
  add constraint calificaciones_plantilla_id_fkey
    foreign key (plantilla_id) references plantillas_evaluacion(id) on delete restrict;

alter table categorias_evaluacion
  drop constraint categorias_evaluacion_plantilla_id_fkey,
  add constraint categorias_evaluacion_plantilla_id_fkey
    foreign key (plantilla_id) references plantillas_evaluacion(id) on delete restrict;

alter table llamadas
  drop constraint llamadas_asesor_id_fkey,
  add constraint llamadas_asesor_id_fkey
    foreign key (asesor_id) references asesores(id) on delete restrict;

alter table parametros_calidad
  drop constraint parametros_calidad_categoria_id_fkey,
  add constraint parametros_calidad_categoria_id_fkey
    foreign key (categoria_id) references categorias_evaluacion(id) on delete restrict;
