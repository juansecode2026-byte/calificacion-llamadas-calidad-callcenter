# CONTEXT.md — Sistema de Calificación de Calidad de Llamadas

> Este archivo es el contexto de arranque para Claude Code / cualquier desarrollador que retome este proyecto.
> Colócalo en la raíz del repo. Complementa con `schema.sql` (esquema de base de datos ya listo para correr en Supabase).

## 1. Qué es este proyecto

Una compañía tiene asesores comerciales que venden vía telefónica. El departamento de calidad califica esas llamadas contra un scorecard de parámetros. El objetivo es automatizar todo el flujo, **incluido el juicio de calidad** — la calificación de cada llamada la hace un agente/IA a partir de la transcripción, no una persona. El rol humano pasa a ser leer esa calificación ya calculada y enviar el reporte al vendedor.

> ⚠️ Corrección 2026-08-13: la versión anterior de este documento decía que la
> evaluación era 100% manual. Es al revés — la calificación es automática; el
> evaluador humano no califica, solo revisa el resultado y lo reenvía. Ver
> `DECISIONES.md` → "Agente evaluador automático".

**Se automatiza:** ingesta y registro de llamadas, asignación a evaluadores, transcripción, **calificación de la llamada contra el scorecard (juicio de calidad vía agente/IA)**, cálculo de puntajes y veredictos, dashboard de indicadores.

**Rol humano restante:** el evaluador/encargado lee la calificación ya generada y arma/envía el reporte al vendedor — no la corrige ni la genera él.

## 2. Estado actual de las decisiones (fuente de verdad)

| Decisión | Estado | Detalle |
|---|---|---|
| Modelo de datos | ✅ Definido | Ver `schema.sql` |
| Plantilla real de evaluación | ✅ Cargada | "LID de montos grandes" — 3 categorías, 9 preguntas |
| Regla de veredicto por categoría | ✅ Confirmada | Mayoría de preguntas aprobadas (ver sección 4) |
| Backend/DB | ✅ Decidido | Supabase (Postgres + Auth + Storage) |
| Transcripción de audio | 🟡 En evaluación | Candidato: Whisper (local) — ver sección 6. Falta decidir diarización |
| Otras plantillas además de esta | ❌ Pendiente | Confirmar con negocio |
| Fórmula "% probabilidad de éxito" | ❌ Pendiente | Definir con equipo de calidad |
| Reglas de asignación de llamadas | ❌ Pendiente | Round-robin vs. muestreo % |
| Roles y permisos del dashboard | ❌ Pendiente | Definir |
| Multi-tenant (varias empresas cliente) | ✅ Confirmado | **Proyecto Supabase separado por empresa** (no `empresa_id` compartido) — aislamiento real de infraestructura, no por RLS. El mismo set de migraciones se aplica a cada proyecto. |
| Escala máxima de tenants | ✅ Confirmado | Máximo **5 empresas** cliente, por diseño — límite explícito para evitar saturación/colapso en producción. Con proyectos separados, además contiene el radio de impacto de cualquier falla a una sola empresa. |
| Routing empresa → proyecto Supabase | ❌ Pendiente | Falta definir dónde vive el registro de qué empresa usa qué proyecto (URL/keys) y cómo el login resuelve a cuál conectarse |

## 3. Modelo de datos (resumen — detalle completo en `schema.sql`)

- `asesores` — quién hace las llamadas
- `evaluadores` — quién califica
- `llamadas` — registro de cada llamada (audio, estado, asesor)
- `plantillas_evaluacion` — un formulario de evaluación (ej. "LID de montos grandes")
- `categorias_evaluacion` — secciones dentro de una plantilla (ej. "Perfilado"), cada una con su `umbral_aprobacion`
- `parametros_calidad` — cada pregunta individual, con escala configurable (0-2, algunas binarias)
- `calificaciones` — la calificación de una llamada específica
- `calificacion_detalle` — el valor dado a cada pregunta + comentario
- `calificacion_categoria_resultado` — veredicto SI/NO calculado por categoría
- `indicadores_personalizados` — indicadores configurables (ej. % probabilidad de éxito)

## 4. Regla de negocio clave: veredicto por categoría

Cada categoría tiene un `umbral_aprobacion` (fracción, ej. 0.66). La categoría da **"SI"** solo si:

```
(preguntas_aprobadas / preguntas_totales) >= umbral_aprobacion
```

Ejemplo real: categoría con 3 preguntas y umbral 0.66 → se necesitan **al menos 2 de 3** aprobadas para que el veredicto sea "SI". Esta regla aplica igual a las 3 categorías de la plantilla actual.

Una pregunta se considera "aprobada" cuando `valor >= valor_aprobacion_minimo` (definido por pregunta en `parametros_calidad`).

La función SQL `calcular_veredicto_categoria()` en `schema.sql` ya implementa esta lógica — úsala como referencia o llámala directo desde el backend.

## 5. Plantilla real: "LID de montos grandes"

Todas las preguntas son binarias (0 o 2) en la muestra actual, aunque el esquema soporta escala 0-1-2 para el futuro.

**Perfilado** (umbral 2/3):
1. ¿Conocemos la experiencia del cliente?
2. ¿Conocemos el área de actividad del cliente?
3. ¿Sabemos para qué vino el cliente (objetivos del cliente)?

**Trabajo sobre el monto** (umbral 2/3):
1. ¿Hay Up-sell con CVB (CV/CB) desde el perfil hasta el próximo status?
2. ¿Hay solicitud de feedback?
3. ¿Hay venta del manager de la sucursal?

**Trabajo con objeciones** (umbral 2/3):
1. ¿Hay acoplamiento?
2. ¿Existe argumento en contra?
3. ¿Hay solicitud de feedback?

## 6. Transcripción de audio (en evaluación)

Opción evaluada: **Whisper (OpenAI)**, corrido localmente.

```bash
brew install ffmpeg            # o apt/choco según el SO
python -m venv venv && source venv/bin/activate
pip install openai-whisper
whisper "llamada.mp3" --language Spanish --model medium
```

Para producción con volumen alto, considerar `faster-whisper` (mismo modelo, más rápido) o la API de OpenAI en vez de correrlo localmente.

**Pendiente de decidir:** si se necesita diarización (separar "Asesor:" de "Cliente:" en el texto). Whisper base no la trae — requeriría sumar `pyannote.audio`, o usar un servicio con diarización nativa (Google STT, AssemblyAI, Deepgram). Esta decisión afecta la arquitectura de ingesta, así que definirla antes de construir esa parte del pipeline.

**Uso previsto de la transcripción:** es el insumo que recibe el agente/IA para calificar la llamada (paso 3 del pipeline, ver `CLAUDE.md`) — no es solo apoyo de búsqueda para un evaluador humano.

## 7. Stack técnico

- **DB/Backend:** Supabase (Postgres + Auth + Storage)
- **Frontend dashboard:** React + recharts
- **Transcripción (si se automatiza):** Whisper / faster-whisper, o servicio con diarización

## 8. Próximos pasos sugeridos al retomar en Claude Code

1. Correr `schema.sql` contra el proyecto de Supabase
2. Construir el formulario de calificación (scorecard digital) siguiendo la estructura de `parametros_calidad`
3. Construir el dashboard con los indicadores listados en la especificación completa
4. Resolver los pendientes de la sección 2 de este archivo antes de tocar ingesta de audio y transcripción
