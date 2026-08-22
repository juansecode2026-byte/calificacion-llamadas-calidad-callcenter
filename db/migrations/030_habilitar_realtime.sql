-- Migracion 030: habilitar Realtime en llamadas y calificaciones
--
-- CLAUDE.md dice "el dashboard usa Supabase Realtime para reflejar el
-- cambio de estado", pero eso no es automatico: cada tabla se agrega a
-- proposito a la publicacion supabase_realtime. Verificado el 2026-08-20
-- al conectar el dashboard de verdad: pg_publication_tables devolvia 0
-- filas, ninguna tabla estaba habilitada.
--
-- Se habilitan las dos tablas que la fila "Estado en tiempo real" del
-- dashboard necesita:
--   llamadas       -> cambios de estado (cargada -> pendiente ->
--                     transcribiendo -> evaluando -> calificada / error)
--   calificaciones -> veredicto_venta y requiere_revision, que solo
--                     existen cuando cerrar_calificacion() termina
--
-- Realtime respeta las policies de RLS ya existentes (evaluador_lee_*):
-- un usuario autenticado solo recibe eventos de filas que ya podria leer
-- por SELECT. No hace falta ninguna policy nueva para esto.

alter publication supabase_realtime add table llamadas;
alter publication supabase_realtime add table calificaciones;
