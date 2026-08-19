# Orden de ejecución del SQL

Ningún archivo de acá se corre suelto — cada proyecto Supabase nuevo (uno
por empresa cliente, ver `CLAUDE.md`) se levanta corriendo **todo esto, en
este orden**:

1. **`000_schema_inicial.sql`** — el schema base. Trae advertencia propia:
   corrido solo, levanta la lógica de veredicto vieja (anterior al `n/a`).
2. **`migrations/001_areas.sql` → `migrations/019_normalizar_correo_asesor.sql`**,
   en orden numérico estricto.
3. **`policies/001_baseline.sql`**
4. **`policies/002_helper_a_schema_privado.sql`**
5. **`policies/020_storage_audios.sql`**
6. Sembrar a mano `configuracion_empresa` con el nombre comercial y el canal
   de notificación de esa empresa (ver comentario en `migrations/006_notificaciones.sql`).

## Por qué existe este archivo

Detectado en la auditoría del 2026-08-18
(`docs/revision-backend-db-2026-08-18.md`, H11): el orden real tiene una
excepción histórica que ningún archivo declaraba en un solo lugar.
`STACK.md` exige "SQL versionado y con orden de ejecución documentado" —
esto es ese documento.

## La excepción histórica (por qué las policies "se adelantaron")

En **este** proyecto (`calificacion-llamadas-callcenter`), `policies/001` y
`policies/002` se aplicaron entre las migraciones 009 y 010 — no después de
la 013 como sugeriría su posición en la carpeta. `policies/001_baseline.sql`
lo documenta en su propio encabezado ("Requiere: ... migraciones 001 a
009"). En un proyecto **nuevo**, no hace falta reproducir ese orden
intercalado: correr todas las migraciones primero y las policies al final
funciona igual, porque ninguna migración posterior a la 009 depende de que
RLS ya esté activo.

## Numeración única de acá en adelante

A partir de la migración 014, todo el SQL nuevo —sea migración o policy—
usa una numeración continua y creciente, sin dos carpetas numerando por
separado. Los números 015 a 020 ya están tomados (auditoría del
2026-08-19, ver más abajo). El próximo archivo de políticas de roles
(pendiente, ver `DECISIONES.md`) es `021_roles.sql`.

## Lo que agregó la auditoría del 2026-08-19 (H5 a H13)

- `migrations/015_cerrar_calificacion.sql` — H5: `cerrar_calificacion()`
  como único camino de escritura del resultado, más `contar_categoria()`
  como fuente única de verdad del conteo (evita que
  `calcular_veredicto_categoria()` y este cálculo diverjan).
- `migrations/016_search_path_pg_temp.sql` — H7: `pg_temp` explícito en
  `is_evaluador_activo()`, `calcular_veredicto_venta()` y
  `calificacion_requiere_revision()`.
- `migrations/017_columnas_correccion_humana.sql` — H6: la corrección
  humana solo puede tocar `comentario`, nunca `valor`, a nivel de grant.
- `migrations/018_calificaciones_origen_ia.sql` — H9: `evaluador_id`
  nullable + columna `origen`, para que el pipeline automático pueda
  insertar sin inventar un evaluador falso.
- `migrations/019_normalizar_correo_asesor.sql` — H10: unicidad de correo
  sobre `lower(trim(correo))` + check de formato.
- `policies/020_storage_audios.sql` — H13: bucket privado + policy de
  lectura para los audios.
