-- Migración 010: fijar el search_path de calcular_veredicto_categoria()
--
-- Corrige un descuido de la 008: is_evaluador_activo() (en db/policies/) se
-- creó con search_path fijo, pero la función de cálculo quedó sin él.
--
-- Sin search_path fijo, un rol con permiso de crear objetos en algún schema
-- del search_path puede anteponer una tabla o función falsa —por ejemplo su
-- propia "parametros_calidad"— y alterar el veredicto que devuelve la
-- función. Detectado por el linter de seguridad de Supabase
-- (lint 0011_function_search_path_mutable).

alter function calcular_veredicto_categoria(uuid, uuid)
  set search_path = public;
