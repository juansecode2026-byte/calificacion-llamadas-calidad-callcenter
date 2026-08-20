# Estructura del proyecto — Sistema de evaluación de calidad de llamadas

**Avance:** 16 de 19 carpetas con contenido.

Generado por `scripts/estructura.py`. No editar a mano: se sobrescribe.

| | Carpeta | Para |
|---|---|---|
| ✅ | `docs/` | Documentación de negocio y técnica (CONTEXT.md, agent_system_prompt.md, capturas de referencia) — ya contiene CONTEXT.md |
| ✅ | `db/` | Todo lo relacionado con la base de datos — 000_schema_inicial.sql (Supabase/Postgres) y README.md con el orden de ejecución viven acá |
| ✅ | `db/migrations/` | Migraciones incrementales del schema, en orden cronológico (a partir de 000_schema_inicial.sql) |
| ✅ | `db/policies/` | Políticas RLS, en archivos separados del schema y de las migraciones (STACK.md lo exige) — ver 001_baseline.sql |
| ✅ | `backend/` | Capa de servidor completa |
| ⬜ | `backend/functions/` | Edge Functions — incluye la carga manual de llamadas (recibe el audio, calcula duración, crea el registro) |
| ⬜ | `backend/worker/` | Orquestador asíncrono del pipeline (transcripción con Whisper/faster-whisper — falta decidir diarización —, cálculo de veredictos, notificación). La ingesta es carga manual vía Edge Function, no pasa por acá. |
| ✅ | `backend/agent/` | Agente evaluador — system_prompt.md y output_schema.json ya definidos (Structured Outputs, valor 0/2/n-a). Faltan client.ts y parser.ts. Forma concreta (subagente vs. script SDK) aplazada en DECISIONES.md, pendiente de seleccionar-forma. |
| ✅ | `frontend/` | Capa de cliente completa |
| ✅ | `frontend/dashboard/` | App React con la landing pública y el dashboard tras login |
| ✅ | `frontend/dashboard/src/` | Código fuente de la app |
| ✅ | `frontend/dashboard/src/pages/` | Páginas de nivel superior (Landing, Dashboard, Formulario de calificación/scorecard) |
| ✅ | `frontend/dashboard/src/components/` | Componentes reutilizables de UI, incluyendo el scorecard digital (parametros_calidad por categoría) |
| ✅ | `frontend/dashboard/src/charts/` | Wrappers de Recharts para los indicadores del dashboard (veredictos por categoría, % probabilidad de éxito, etc.) |
| ⬜ | `frontend/dashboard/src/hooks/` | Hooks de React, incluyendo la suscripción a Supabase Realtime |
| ✅ | `frontend/dashboard/src/lib/` | Clientes y utilidades compartidas (supabaseClient, helpers) |
| ✅ | `frontend/dashboard/src/services/` | Funciones async simples para llamadas a Supabase y APIs externas, un archivo por sistema externo (STACK.md lo exige) — ver authService.ts |
| ✅ | `frontend/dashboard/src/stores/` | Stores de Zustand, un dominio por archivo, sin middleware salvo justificación puntual — ver authStore.ts |
| ✅ | `frontend/dashboard/public/` | Assets estáticos servidos tal cual |

✅ con contenido · ⬜ vacía, pendiente · ❌ no existe en disco

Las carpetas vacías se dejan a propósito: sostienen la estructura completa
del full stack. Cada una lleva un `_VACIA.md` que la mantiene visible en el
explorador y versionada en Git. El marcador desaparece solo al agregar el
primer archivo real y volver a correr el script.
