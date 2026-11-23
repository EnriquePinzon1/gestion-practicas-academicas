import type { RequestHandler } from 'express';

type Env = Record<string, string | undefined>;

/**
 * Orígenes del frontend autorizados a llamar al Gateway, separados
 * por coma en CORS_ALLOWED_ORIGINS. Por defecto, el Angular local.
 */
export function readAllowedOrigins(env: Env = process.env): string[] {
  const raw =
    env['CORS_ALLOWED_ORIGINS']?.trim() || 'http://localhost:4200';

  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * CORS del Gateway: refleja el origen solo si está autorizado
 * y responde directamente las peticiones de verificación (OPTIONS).
 */
export function createCors(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return (req, res, next) => {
    const origin = req.get('origin');

    // La respuesta cambia según el origen: los cachés deben saberlo.
    res.vary('Origin');

    if (origin && allowed.has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
      res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      );
      res.header('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  };
}
