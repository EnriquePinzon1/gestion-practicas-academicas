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
  // Health público (GET /api) de los servicios internos. En el plan
  // gratuito de Render solo una petición externa despierta un
  // servicio dormido (las del Gateway no lo hacen): el navegador
  // los despierta al abrir la app o cuando una petición tarda.
  serviceWakeUrls: [
    'https://gestion-practicas-user-service.onrender.com/api',
    'https://gestion-practicas-practice-service.onrender.com/api',
    'https://gestion-practicas-activity-service.onrender.com/api',
    'https://gestion-practicas-audit-service.onrender.com/api',
  ],
};
