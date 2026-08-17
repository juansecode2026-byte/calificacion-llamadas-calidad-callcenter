-- Migración 012: índices sobre las foreign keys
--
-- Postgres NO crea índice automáticamente al declarar una foreign key —solo
-- lo hace del lado de la primary key referenciada—. Sin él, cada join o
-- filtro por la columna hace un scan secuencial, y además cada borrado en la
-- tabla padre tiene que recorrer la hija entera para validar la FK.
--
-- Detectado por el linter de performance de Supabase
-- (lint 0001_unindexed_foreign_keys): 12 FKs sin cobertura.
--
-- Hoy la base está vacía y no se nota. Se agregan ahora porque las consultas
-- que más va a hacer el dashboard son exactamente estas: el detalle de una
-- calificación, las llamadas de un asesor, los resultados por categoría.
--
-- No se incluyen evaluadores.auth_user_id ni transcripciones.llamada_id: ya
-- están cubiertas por sus constraints unique.

-- ---------- Ruta caliente del dashboard ----------
-- Traer una calificación completa: sus 9 detalles y sus 3 resultados.
create index idx_calificacion_detalle_calificacion
  on calificacion_detalle(calificacion_id);

create index idx_calificacion_categoria_resultado_calificacion
  on calificacion_categoria_resultado(calificacion_id);

-- Histórico por asesor (CLAUDE.md, paso 6 del pipeline).
create index idx_llamadas_asesor
  on llamadas(asesor_id);

create index idx_calificaciones_llamada
  on calificaciones(llamada_id);

-- ---------- Resto de las FKs ----------
create index idx_asesores_area
  on asesores(area_id);

create index idx_calificacion_detalle_parametro
  on calificacion_detalle(parametro_id);

create index idx_calificacion_categoria_resultado_categoria
  on calificacion_categoria_resultado(categoria_id);

create index idx_calificaciones_evaluador
  on calificaciones(evaluador_id);

create index idx_calificaciones_plantilla
  on calificaciones(plantilla_id);

create index idx_categorias_evaluacion_plantilla
  on categorias_evaluacion(plantilla_id);

create index idx_parametros_calidad_categoria
  on parametros_calidad(categoria_id);

create index idx_notificaciones_calificacion
  on notificaciones(calificacion_id);
