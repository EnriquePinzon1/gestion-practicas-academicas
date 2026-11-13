// Producción (nx build web → Vercel).
// apiUrl apunta al API Gateway desplegado en Render
// (se confirma al crear el servicio en Render).
// La clave publicable de Supabase es pública por diseño: el
// frontend solo la usa para Auth; los datos pasan por el Gateway.
export const environment = {
  production: true,
  apiUrl: 'https://gestion-practicas-api-gateway.onrender.com/api',
  supabaseUrl: 'https://rsxafehaakmxqambbdbz.supabase.co',
  supabasePublishableKey: 'sb_publishable_sDBJqtS5XEMOcL4C3dr0_g_NsCdijwO',
};
