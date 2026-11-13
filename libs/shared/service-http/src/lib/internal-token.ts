import { timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';

type Env = Record<string, string | undefined>;

/** Cabecera con la que el Gateway y los servicios se identifican entre sí. */
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

const MIN_TOKEN_LENGTH = 32;

/**
 * Lee el secreto compartido entre servicios. Es obligatorio:
 * en producción los servicios tienen URL pública y, sin este
 * secreto, cualquiera podría saltarse la autenticación del Gateway.
 */
export function readInternalToken(env: Env = process.env): string {
  const token = env['INTERNAL_API_TOKEN']?.trim();

  if (!token) {
    throw new Error('Falta INTERNAL_API_TOKEN');
  }

  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `INTERNAL_API_TOKEN debe tener al menos ${MIN_TOKEN_LENGTH} caracteres`
    );
  }

  return token;
}

function tokensMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  // timingSafeEqual exige la misma longitud; comparar longitudes
  // primero solo revela la longitud, no el contenido.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Middleware para los microservicios: solo atiende peticiones
 * que traen el secreto interno (enviadas por el Gateway u otro
 * servicio). Responde 401 en cualquier otro caso.
 */
export function requireInternalToken(expected: string): RequestHandler {
  return (req, res, next) => {
    const received = req.get(INTERNAL_TOKEN_HEADER);

    if (!received || !tokensMatch(received, expected)) {
      res.status(401).json({
        message: 'Acceso interno no autorizado',
      });
      return;
    }

    next();
  };
}

/**
 * fetch que agrega el secreto interno a cada petición,
 * conservando las cabeceras que ya traiga la llamada.
 */
export function createInternalFetch(
  token: string,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);

    headers.set(INTERNAL_TOKEN_HEADER, token);

    return baseFetch(input, { ...init, headers });
  };
}
