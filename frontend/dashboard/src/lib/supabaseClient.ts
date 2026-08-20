import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copiá .env.example a .env en la raíz del proyecto y completá los valores reales.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
