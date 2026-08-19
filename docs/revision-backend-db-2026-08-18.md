# Revisión de backend y base de datos — 2026-08-18

Auditoría del agente `revisor-frontend-backend` sobre `db/` y `backend/`,
contra el skill `revisor-full-stack` y las reglas de negocio de `CLAUDE.md`.

**24 hallazgos: 3 bloqueantes, 10 importantes, 11 menores.**

> Verificado a mano después de la auditoría: los 3 bloqueantes son reales.
> **H23 está mal** en su primera afirmación — `scripts/estructura.py` sí existe
> (se commiteó en `b94735d`). El resto de H23 (la captura duplicada en `docs/`)
> es correcto.

Este archivo es el registro de la auditoría, no el parche — se deja intacto
como estaba al momento de revisar. El estado de qué se corrigió vive en cada
commit, no acá.

> **Actualización 2026-08-18 (mismo día):** los 3 bloqueantes (H1, H2, H3) y
> H4 quedaron resueltos en el repo — ver `db/migrations/014_veredicto_categoria_robusto.sql`
> (H2, H3, H4) y el renombre de `schema.sql` a `db/000_schema_inicial.sql` +
> `db/README.md` (H1).
>
> **Actualización 2026-08-19: H2, H3 y H4 quedaron aplicados y verificados
> contra la base real** (proyecto `mdkussaxoyhdwvezwjqe`), corridos a mano
> por el usuario vía SQL Editor —el conector MCP seguía desconectado—.
> Verificación: las 2 constraints unique existen
> (`calificacion_detalle_unica_por_parametro`,
> `categoria_resultado_unica_por_categoria`); `pg_proc.proconfig` de
> `calcular_veredicto_categoria` muestra `["search_path=public"]`; y llamar
> a la función con un `categoria_id` inexistente ahora falla con
> `P0001: categoria_evaluacion ... inexistente o sin umbral_aprobacion` en
> vez de devolver `'NO'` en silencio.
>
> H1 (el renombre del schema) no requiere aplicarse en Supabase —es
> reorganización del repo, no una migración—, así que ya está cerrado por
> completo.
>
> **Actualización 2026-08-19 (mismo día): los 8 hallazgos importantes que
> quedaban (H5, H6, H7, H8, H9, H10, H12, H13) quedaron resueltos en el
> repo**, sin aplicar todavía contra Supabase:
> - `db/migrations/015_cerrar_calificacion.sql` (H5) — de paso factoriza el
>   conteo de H3 en `contar_categoria()`, para que
>   `calcular_veredicto_categoria()` y esta función no dupliquen la misma
>   lógica. **Desviación deliberada de la solución sugerida:** no se agregó
>   el trigger automático sobre `calificacion_detalle` — un `AFTER INSERT
>   FOR EACH ROW` dispararía la función tras cada fila individual, y con las
>   9 preguntas insertándose de a una explotaría en la primera (H3 hace
>   fallar la función si falta un detalle). El worker llama a
>   `cerrar_calificacion()` explícito al final; la razón original del
>   trigger (que una corrección humana deje el veredicto viejo colgado) la
>   resuelve H6, que le quita a `authenticated` el permiso de tocar `valor`.
> - `db/migrations/016_search_path_pg_temp.sql` (H7)
> - `db/migrations/017_columnas_correccion_humana.sql` (H6)
> - `db/migrations/018_calificaciones_origen_ia.sql` (H9)
> - `db/migrations/019_normalizar_correo_asesor.sql` (H10)
> - `db/policies/020_storage_audios.sql` (H13)
> - `backend/agent/output_schema.json` + `system_prompt.md` (H8) — `valor`
>   pasa a ser siempre texto (`"0"`/`"2"`/`"n/a"`), nunca número: verificado
>   contra la referencia de Structured Outputs que un enum de tipos mixtos
>   sin `type` no es válido en modo estricto, y que `additionalProperties:
>   false` es obligatorio en todo objeto (antes faltaba).
> - `.gitignore` + `.env.example` + sección "Variables de entorno" en
>   `CLAUDE.md` (H12)
>
> **H11 se resolvió antes**, con `db/README.md` (parte del cierre de H1).
>
> Sigue sin tocar: **11 hallazgos menores** (H14 a H24, salvo la corrección
> ya hecha a H23).

---

## Bloqueantes

Los tres tocan el núcleo que la regla de negocio exige blindar: **el veredicto
determinista**. Hay que resolverlos antes de aplicar este set de migraciones a
cualquier proyecto Supabase adicional.

### H1 — `db/schema.sql` quedó congelado antes de la migración 008

`schema.sql` no menciona `no_aplica` ni `SIN_VEREDICTO` en ningún lado, y su
`calcular_veredicto_categoria()` usa denominador fijo. Pero `CLAUDE.md` lo
declara "schema completo" y `docs/CONTEXT.md:107` manda correrlo como paso 1 al
levantar un proyecto.

Con hasta 5 proyectos Supabase (uno por empresa), **un tenant nuevo arrancaría
con la lógica de veredicto anterior al `n/a`**.

**Solución:** regenerar `schema.sql` como snapshot del estado post-013, o
renombrarlo a `db/000_schema_inicial.sql` y prohibir su uso suelto. En el
snapshot: `asesores` sin `nombre`, `estado_llamada` con los 5 valores de la 004,
check de veredicto con `SIN_VEREDICTO`, `calificacion_detalle` con `valor`
nullable + `no_aplica` + `origen`, `calificaciones` con `veredicto_venta` y
`requiere_revision`, `criterio_evaluacion`, las tablas de la 003 y 006, los
índices de la 012.

**Trampa asociada:** declarar el `search_path` **dentro** de cada
`create function ... set search_path = ...`, no vía `ALTER FUNCTION`. Un
`create or replace` posterior borra lo que fijó el `ALTER` — o sea que
re-ejecutar la 008 hoy **revierte el hardening de la 010**.

### H2 — Faltan constraints de unicidad: un reproceso puede inventar una venta

No existe `unique (calificacion_id, parametro_id)` en `calificacion_detalle`,
ni `unique (calificacion_id, categoria_id)` en
`calificacion_categoria_resultado`. Confirmado: no hay ninguno.

Un reintento del worker que reinserte filas duplica el denominador y, peor,
hace que `calcular_veredicto_venta()` **cuente dos veces la misma categoría en
`SI`** — una sola categoría aprobada devolvería `CUENTA`, rompiendo el umbral
absoluto de 2 de 3.

**Solución** (migración 014):

```sql
alter table calificacion_detalle
  add constraint calificacion_detalle_unica_por_parametro
  unique (calificacion_id, parametro_id);

alter table calificacion_categoria_resultado
  add constraint categoria_resultado_unica_por_categoria
  unique (calificacion_id, categoria_id);
```

Los índices sueltos `idx_calificacion_detalle_calificacion` e
`idx_calificacion_categoria_resultado_calificacion` de la 012 quedan
redundantes (el compuesto cubre el prefijo) — reemplazarlos.

### H3 — Una respuesta incompleta del agente se comporta como `n/a`

En `008_valor_na_y_veredicto.sql`, `v_aplicables` se calcula contando **filas
que existen en `calificacion_detalle`**, no los parámetros activos de la
categoría:

```sql
select count(*) into v_aplicables
from calificacion_detalle cd
join parametros_calidad p on p.id = cd.parametro_id
where cd.calificacion_id = p_calificacion_id
  and p.categoria_id = p_categoria_id
  and p.activo = true
  and cd.no_aplica = false;
```

Una pregunta que el modelo no devolvió (fila ausente) **baja el denominador
exactamente igual que un `n/a` legítimo**. La regla dice que solo el `n/a`
explícito excluye. Hoy una respuesta incompleta produce en silencio un veredicto
`SI` con 1 de 1, en vez de fallar.

**Solución:** partir de `parametros_calidad` con `LEFT JOIN` y abortar si falta
algún detalle:

```sql
select count(*) filter (where cd.id is null),
       count(*) filter (where cd.id is not null and cd.no_aplica = false),
       count(*) filter (where cd.id is not null and cd.no_aplica = false
                          and cd.valor >= p.valor_aprobacion_minimo)
  into v_faltantes, v_aplicables, v_aprobadas
from parametros_calidad p
left join calificacion_detalle cd
  on cd.parametro_id = p.id and cd.calificacion_id = p_calificacion_id
where p.categoria_id = p_categoria_id and p.activo = true;

if v_faltantes > 0 then
  raise exception 'Faltan % detalles para la categoria % en la calificacion %',
    v_faltantes, p_categoria_id, p_calificacion_id;
end if;
```

---

## Importantes

### H4 — Un `categoria_id` inválido devuelve `NO` en vez de fallar
`008:54-55, 78`. Si la categoría no existe, `v_umbral` queda `NULL`, la
comparación da `NULL` y el flujo cae en el `else` devolviendo `'NO'`. Un
veredicto plausible y persistible a partir de un id inválido — la misma clase de
fallo silencioso que el bug de la planilla de Excel.

**Solución:** `if not found or v_umbral is null then raise exception ...`

### H5 — Nada invoca las funciones de veredicto de venta
`011_veredicto_venta.sql:30-89`. `calcular_veredicto_venta()` y
`calificacion_requiere_revision()` existen pero **nada las llama ni sincroniza**:
`veredicto_venta` es nullable y `requiere_revision` default `false`, ambos
escribibles a mano. El invariante "una categoría en `SIN_VEREDICTO` marca
`requiere_revision`" depende de que el worker se acuerde.

**Solución:** una función `cerrar_calificacion(p_calificacion_id uuid)` que sea
el único camino de escritura del resultado — recorre categorías, escribe
`calificacion_categoria_resultado`, y setea `veredicto_venta` y
`requiere_revision`. Más un trigger sobre `calificacion_detalle` para que una
corrección humana no deje el veredicto viejo colgado. El worker llama a
`cerrar_calificacion()` y nada más.

### H6 — La corrección humana puede cambiar el `valor`, no solo la justificación
`policies/001_baseline.sql:123-126`. La policy permite `UPDATE` de cualquier
columna: `valor`, `no_aplica`, `origen`, incluso `parametro_id`. `CLAUDE.md`
limita la corrección humana a la justificación. Y si un evaluador cambia el
`valor`, los resultados por categoría ya persistidos quedan desincronizados.

**Solución** (RLS no puede filtrar por columna; los grants sí):

```sql
revoke update on calificacion_detalle from authenticated;
grant update (comentario, corregido_por_humano) on calificacion_detalle to authenticated;
```

### H7 — `is_evaluador_activo()` es vulnerable a shadowing por tabla temporal
`policies/001_baseline.sql:28-40`. Es `SECURITY DEFINER` con
`set search_path = public`, que **no lista `pg_temp`**. Postgres busca el schema
temporal antes que el resto para nombres de relación no calificados. Una tabla
temporal llamada `evaluadores` shadowea la real y la función devuelve `true`
para cualquiera — y es el gate de **todas** las policies del proyecto.

**Solución:** `set search_path = ''` con el nombre calificado
(`select 1 from public.evaluadores`), o `set search_path = public, pg_temp` con
`pg_temp` explícito y último. Mismo criterio para las tres funciones de cálculo.

### H8 — `output_schema.json` no es válido para Structured Outputs estricto
`valor` es un enum de tipos mixtos (`0, 2, "n/a"`) sin `"type"`, y ningún objeto
declara `additionalProperties: false` ni `minItems`. Además `CLAUDE.md:53` sigue
afirmando que "valor no puede ser otra cosa que 0 o 2", desactualizado desde la
008. Y no está escrito en ningún lado el mapeo `"n/a"` → (`valor` NULL,
`no_aplica` true).

Si la API rechaza o relaja el schema, **la garantía de formato que justifica que
`parser.ts` solo valide reglas de negocio deja de existir**.

### H9 — El pipeline automático no tiene `evaluador_id` válido que poner
`schema.sql:73`. `calificaciones.evaluador_id` es `NOT NULL` y referencia
`evaluadores`, pero la calificación la produce la IA. O se inventa un evaluador
falso, o no se puede insertar.

**Solución preferida** (coherente con `calificacion_detalle.origen`, que existe
desde la 005): hacer `evaluador_id` nullable, agregar `origen` con check
`('humano','ia')`, y un check que exija `evaluador_id` cuando `origen = 'humano'`.

### H10 — El correo del asesor no está normalizado
`002_asesores_correo.sql:20-22`. La unicidad es sensible a mayúsculas y
espacios, sin validación de formato. El paso 1 del pipeline resuelve al asesor
por correo: `Juan@x.com` y `juan@x.com` conviven como dos asesores y **parten el
histórico en dos**.

**Solución:** `create unique index ... on asesores (lower(trim(correo)))` más un
check de formato, o pasar la columna a `citext`.

### H11 — No hay orden de ejecución documentado
Tres numeraciones independientes con dependencias cruzadas reales: `policies/001`
exige migraciones 001-009, y `policies/002` se aplicó **antes** que las
migraciones 010-013. `STACK.md` exige "SQL versionado y con orden de ejecución
documentado".

**Solución:** `db/README.md` con el orden canónico, documentando la excepción
histórica. De la 014 en adelante, numeración única y creciente para todo el SQL.

### H12 — Ninguna variable de entorno documentada, y `.gitignore` bloquea el ejemplo
No existe `.env.example`, y la línea `.env.*` del `.gitignore` **también lo
ignoraría**. `STACK.md` exige documentarlas explícitamente.

**Solución:** `!.env.example` en `.gitignore`, crear el archivo con claves
vacías, y una sección "Variables de entorno" en `CLAUDE.md` con la regla
explícita: en el dashboard solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`;
la service role key y la key de Anthropic **jamás** con prefijo `VITE_`.

### H13 — No hay ninguna policy de Storage para los audios
Se guarda `archivo_audio_url` apuntando a Supabase Storage, pero no hay policy
de `storage.objects` ni definición de bucket privado. **Son grabaciones de
clientes reales**: un bucket público las deja accesibles con solo tener la URL,
y la URL viaja en una tabla que el dashboard ya lee.

**Solución:** `db/policies/004_storage_audios.sql` con el bucket `public = false`
y policy de `select` para evaluadores activos. Guardar la ruta del objeto, no
una URL pública, y resolver la reproducción con `createSignedUrl` de duración
corta.

---

## Menores

| ID | Qué |
|---|---|
| H14 | `calificacion_detalle.valor` solo tiene check `>= 0`, sin cota superior — una corrección humana con `7` aprueba la pregunta |
| H15 | `preguntas_totales` cambió de significado en la 008 (ahora es "aplicables") sin documentarse; con `SIN_VEREDICTO` vale 0 y el dashboard dividiría por cero |
| H16 | No hay unique ni noción de "vigente" en `calificaciones(llamada_id)` — reprocesar duplica cada KPI |
| H17 | Las tres funciones de cálculo viven en `public`, así que PostgREST las publica en `/rest/v1/rpc/`; y `private` tiene grant a `anon`, que no evalúa ninguna policy |
| H18 | `policies/001` crea `is_evaluador_activo()` sin calificar schema — re-ejecutarlo tras la 002 recrea la copia en `public` |
| H19 | Ninguna FK declara `ON DELETE` — borrar una llamada obliga a limpiar a mano en orden |
| H20 | `system_prompt.md` no tiene la regla del caso de referencia (se evalúa la conducta del asesor, no la reacción del cliente) — el agente cae directo en la trampa documentada |
| H21 | El unique sobre `transcripciones.llamada_id` impide re-transcribir sin destruir la evidencia previa |
| H22 | El cálculo apunta al parámetro vivo sin congelar la versión de plantilla — editar una pregunta cambia retroactivamente calificaciones históricas |
| H23 | `docs/` tiene la misma captura dos veces (**la parte sobre `scripts/` es errónea**) |
| H24 | La 013 pone `apellidos NOT NULL` pero la 002 solo backfilleó nombres — inofensivo hoy con la tabla vacía, no en un tenant con datos |

---

## Veredicto

La base está bien pensada y la trazabilidad de las migraciones es buena, pero
**no está lista para replicarse a otro tenant**. H1, H2 y H3 deben resolverse
antes de aplicar este set a cualquier proyecto Supabase adicional.

H20 además es el puente que falta entre
`docs/caso-de-referencia-criterios.md` y el agente: la lógica está documentada
pero no llegó al system prompt.
