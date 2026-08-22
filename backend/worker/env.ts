import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// El .env vive en la RAÍZ del proyecto, no en backend/: lo comparten
// frontend, worker y agente (CLAUDE.md, "Variables de entorno"). dotenv por
// defecto busca en el cwd, que al correr `npm run worker` es backend/ — de
// ahí este módulo.
//
// Va en su propio archivo, y no como un `config()` suelto en index.ts,
// porque en ESM todos los imports se evalúan antes que el cuerpo del módulo:
// supabase.ts leería process.env antes de que dotenv corriera. Importando
// este módulo PRIMERO, el orden queda garantizado.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
