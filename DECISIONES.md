# Decisiones

Registro de candidatos evaluados por el Arquitecto (agente `seleccionar-forma`):
aceptados, rechazados o aplazados, cada uno con su motivo y su condición de
activación.

<!-- Formato sugerido por entrada:

## <nombre del candidato>
- Estado: aceptado | rechazado | aplazado
- Fecha: AAAA-MM-DD
- Motivo:
- Condición de activación (si aplazado):
-->

## Agente evaluador automático (`backend/agent/`)
- Estado: aplazado
- Fecha: 2026-08-13
- Motivo: la calificación de la llamada **es automática** — la hace un
  agente/IA a partir de la transcripción, aplicando `parametros_calidad` de
  la plantilla. El evaluador humano no califica: solo lee el resultado ya
  calculado y reenvía el reporte al vendedor. `backend/agent/` es la pieza
  central del flujo, no un extra opcional — sigue aplazada únicamente porque
  falta definir su forma concreta con el Arquitecto (ver condición abajo), no
  porque el negocio la haya descartado.
- Nota de corrección: la primera versión de esta entrada decía lo contrario
  (que la calificación era manual). Se basó en una lectura errónea de
  `Documentación/CONTEXT.md`, corregida por el usuario el 2026-08-13. Ese
  archivo ya quedó actualizado.
- Por qué sigue en "aplazado" y no pasa directo a "aceptado": aceptar un
  candidato es decisión del usuario, idealmente pasando por el Arquitecto
  (`seleccionar-forma` en modo INCREMENTAL, ya que este DECISIONES.md ya
  existe) para definir la forma correcta — mecanismo (subagente vs. script
  SDK) y composición (agente único vs. orquestador), no solo confirmar que
  hace falta.
- Condición de activación: correr `seleccionar-forma` en modo INCREMENTAL con
  este contexto corregido, para que proponga la forma concreta del agente
  evaluador (toma transcripción → aplica `parametros_calidad` de la plantilla
  → calcula veredicto por categoría vía `calcular_veredicto_categoria()` →
  guarda en `calificaciones`/`calificacion_detalle`).
- Procedencia: manifiesto `estructura.yaml` de la skill `fullstack`; corregido
  por aclaración directa del usuario en esta sesión.
