# Decisiones

Registro de candidatos evaluados por el Arquitecto (agente `seleccionar-forma`):
aceptados, rechazados o aplazados, cada uno con su motivo y su condición de
activación.

> **Quién escribe este archivo.** El agente `seleccionar-forma` **propone**,
> el usuario **decide**, y el agente principal **escribe** el resultado acá.
> El Arquitecto no tiene herramientas de escritura a propósito ("quien decide
> no ejecuta"), así que nunca actualiza este archivo por su cuenta — aunque
> sus propias instrucciones digan lo contrario (contradicción conocida en su
> definición, detectada el 2026-08-20).

<!-- Formato sugerido por entrada:

## <nombre del candidato>
- Estado: aceptado | rechazado | aplazado
- Fecha: AAAA-MM-DD
- Motivo:
- Condición de activación (si aplazado):
-->

## Agente evaluador automático (`backend/agent/`)
- Estado: **aceptado** (2026-08-20)
- Fecha: propuesto 2026-08-13, aplazado hasta definir forma, aceptado 2026-08-20
- Forma definida (`seleccionar-forma`, modo INCREMENTAL, 2026-08-20):
  - **Mecanismo:** llamada directa a la API de Claude vía `@anthropic-ai/sdk`
    con Structured Outputs. **No** es subagente markdown ni script SDK de
    `agentes-sdk/`: no hay tool-use, ni multi-turno, ni decisión de "qué hacer
    después" — es una función que arma un prompt y parsea una respuesta.
    El Arquitecto lo señaló explícitamente: este candidato no encaja limpio en
    la taxonomía genérica del laboratorio, y forzarlo a `agentes-sdk/` habría
    sido meterlo en una carpeta que no le corresponde.
  - **Composición:** uno solo. No hay contexto que aislar (todo entra en un
    prompt), ni permisos que separar (el agente no escribe nada: devuelve
    JSON y el worker persiste), ni paralelismo real que ganar.
- Construido: `client.ts` (llamada con Structured Outputs, detecta `refusal` y
  truncado por `max_tokens`) y `parser.ts` (valida reglas de negocio: las 9
  preguntas presentes, ninguna repetida; convierte `"n/a"` → `valor=null` +
  `no_aplica=true`).
- Motivo: la calificación de la llamada **es automática** — la hace la IA a
  partir de la transcripción, aplicando `parametros_calidad` de la plantilla.
  El evaluador humano no califica: solo lee el resultado y reenvía el reporte.
- Nota de corrección (2026-08-13): la primera versión de esta entrada decía lo
  contrario (que la calificación era manual). Salió de una lectura errónea de
  `docs/CONTEXT.md`, corregida por el usuario. Ese archivo ya quedó actualizado.
- Hallazgo al construir (2026-08-20): `CLAUDE.md` pedía usar `temperature`
  baja, pero `claude-sonnet-5` **rechaza los parámetros de sampling con error
  400**. La regla era irrealizable con el modelo elegido; se corrigió en
  `CLAUDE.md`. La reproducibilidad se apoya en el criterio explícito del
  system prompt, no en el sampling.
- Procedencia: manifiesto `estructura.yaml` de la skill `fullstack`; corregido
  por aclaración directa del usuario.

## Worker orquestador del pipeline (`backend/worker/`)
- Estado: **aceptado** (2026-08-20)
- Fecha: 2026-08-20
- Forma definida (`seleccionar-forma`, modo INCREMENTAL):
  - **No es un agente.** Toda la interpretación de contenido la hace
    `client.ts` como un paso interno; la orquestación en sí es una secuencia
    fija sin decisión sobre contenido → **script determinístico** en Node.js,
    coherente con el resto del backend.
  - **Disparo: polling** sobre `llamadas` en estado `pendiente`, decidido por
    el usuario el 2026-08-20 sobre la alternativa de Supabase Realtime. Razón:
    si el worker se cae y vuelve, retoma solo lo que quedó pendiente; con
    eventos, un aviso que llega mientras está caído se pierde y la llamada
    queda colgada para siempre. A este volumen (máximo 5 empresas, cargas
    manuales) la latencia extra es irrelevante.
- Motivo: sin él, una llamada cargada queda en la base para siempre — nadie la
  transcribe, evalúa ni califica. Es el pegamento entre los pasos 2 a 5: cada
  pieza sabe hacer su parte, ninguna sabe qué viene después.
- Construido: `index.ts` (loop de polling con reclamo atómico para que dos
  workers no evalúen la misma llamada), `procesarLlamada.ts` (pipeline de una
  llamada; cualquier fallo la deja en `error`, nunca colgada en un estado
  intermedio), `supabase.ts` (cliente con service role), `env.ts`,
  `transcribir.ts` (ver aplazado abajo).
- Hallazgo al construir (2026-08-20): `CLAUDE.md` decía "el disparo del
  pipeline es manual: un botón en el dashboard", pero el schema no lo permitía
  — `llamadas.estado` arrancaba en `pendiente` por defecto, que es justo el
  estado que el worker consume, así que subir el audio encolaba la llamada
  automáticamente. Se agregó el estado `cargada` como nuevo default
  (migraciones 028 y 029), confirmado con el usuario.

## Transcripción automática de audio (paso 2 del pipeline)
- Estado: **aplazado**
- Fecha: 2026-08-20
- Motivo: `backend/worker/transcribir.ts` existe pero **falla a propósito**.
  Devolver texto de relleno haría que el agente evalúe una transcripción falsa
  y produzca un veredicto con apariencia de real sobre una llamada que nadie
  transcribió — el peor resultado posible para un sistema cuyo output afecta a
  un asesor real.
- Condición de activación: decidir **diarización** (separar "Asesor:" de
  "Cliente:" en el texto), que sigue abierta en `docs/CONTEXT.md` sección 6.
  No es cosmético: el system prompt del agente evalúa la conducta del ASESOR,
  no la del cliente (regla 9). Sin diarización, el agente tiene que inferir
  quién habla — exactamente el tipo de inferencia que su regla 1 le prohíbe.
  Definido eso, elegir entre Whisper local, faster-whisper o un servicio con
  diarización nativa.
- Mientras tanto: el worker procesa normalmente cualquier llamada que ya tenga
  una transcripción vigente cargada a mano, lo que permite probar el resto del
  pipeline de punta a punta.

## Edge Function de ingesta (`backend/functions/`)
- Estado: **aplazado**
- Fecha: 2026-08-20
- Motivo: no hace falta agente — son pasos fijos ya descritos en `CLAUDE.md`
  (buscar asesor por correo, subir el audio a Storage, calcular duración, crear
  el registro). Script (Edge Function Deno). Es la pieza más simple del
  pipeline, y el Arquitecto la marcó como independiente: puede construirse en
  paralelo con el agente.
- Condición de activación: que se quiera cargar una llamada real desde el
  dashboard. Hoy el formulario del frontend existe pero no tiene backend que
  reciba el audio.

## Notificador automático al asesor (paso 5 del pipeline)
- Estado: **aplazado**
- Fecha: 2026-08-20
- Motivo: no hace falta agente — es un texto armado con template a partir de
  datos ya calculados, sin juicio nuevo. Script determinístico, puede vivir
  como paso final del propio worker.
- Condición de activación: elegir el proveedor de envío.
  `configuracion_empresa.canal_notificacion` ya es configurable
  (`email`/`whatsapp`/`chat`) y `plantilla_mensaje` existe en el schema, pero
  están vacíos y no hay integración decidida.
- Qué pasa si no está: el asesor solo se entera si alguien mira el dashboard a
  mano — vuelve a ser manual disfrazado de automático.

## Vigía de llamadas atascadas en el pipeline
- Estado: **aplazado**
- Fecha: 2026-08-20
- Motivo: propuesto ya como aplazado por el propio Arquitecto. Sería una
  verificación programada (cron: llamadas en estado intermedio con timestamp
  viejo → marcar/alertar). No hace falta agente, es un script sin LLM.
  Aceptarlo ahora sería automatizar antes de tener el problema.
- Condición de activación: el worker en producción y **al menos una llamada
  real atascada sin que nadie se haya dado cuenta** (la regla de "se rompió en
  silencio y se descubrió tarde").
- Nota: el worker ya cubre el caso previsible — captura cualquier excepción y
  deja la llamada en `error`. Lo que este vigía cubriría es el caso en que el
  proceso muere sin poder capturar nada (crash duro, corte de energía).
- Procedencia: inferido de `db/migrations/004_estado_llamada.sql` — el enum
  tiene `error` explícito, pero nada lo dispara si el proceso simplemente
  muere.

## Descartados (evaluados, no propuestos)
- **Roles y permisos del dashboard**: es una decisión de RLS/políticas, no una
  pregunta de forma de agente — fuera del alcance de `seleccionar-forma`.
- **Carga de parámetros y archivos reales**: es trabajo manual de datos que
  hace el usuario a propósito, no un candidato a automatizar.
