import { createClient } from '@supabase/supabase-js';

// Cliente con la clave de servicio: solo se usa en el
// backend. El bucket es privado y el navegador nunca
// accede a él directamente; descarga con URLs firmadas.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_SECRET_KEY'
  );
}

export const EVIDENCE_BUCKET = 'evidencias';

export const storage = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
    },
  }
).storage;
