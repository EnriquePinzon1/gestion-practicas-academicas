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
 * Si el servicio destino está dormido (plan gratuito de Render),
 * espera a que despierte en lugar de fallar de inmediato.
 */
export function createInternalFetch(
  token: string,
  baseFetch: typeof fetch = fetch,
  options: InternalFetchOptions = {}
): typeof fetch {
  const wakeTimeoutMs = options.wakeTimeoutMs ?? DEFAULT_WAKE_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  return async (input, init) => {
    const headers = new Headers(init?.headers);

    headers.set(INTERNAL_TOKEN_HEADER, token);

    const request = { ...init, headers };
    const method = (init?.method ?? 'GET').toUpperCase();
    const started = now();
    const deadline = started + wakeTimeoutMs;

    for (let attempt = 1; ; attempt++) {
      const delay = Math.min(attempt * 1000, MAX_RETRY_DELAY_MS);
      const canWait = now() + delay <= deadline;

      let response: Response;

      try {
        response = await baseFetch(input, request);
      } catch (error) {
        // Error de red: la petición pudo llegar al servicio, así
        // que solo se repite si no modifica datos (GET/HEAD).
        if (
          !IDEMPOTENT_METHODS.has(method) ||
          attempt > MAX_NETWORK_RETRIES ||
          !canWait
        ) {
          throw error;
        }

        await sleep(delay);
        continue;
      }

      // Página de la plataforma (Render) mientras el servicio despierta:
      // la aplicación no recibió la petición, así que repetirla es
      // seguro incluso para POST/PUT/PATCH.
      if (!isWakeUpResponse(response)) {
        if (attempt > 1) {
          console.warn(
            `Servicio interno disponible tras ${Math.round((now() - started) / 1000)} s: ${String(input)}`
          );
        }

        return response;
      }

      if (!canWait) {
        console.warn(
          `Servicio interno sin despertar tras ${Math.round((now() - started) / 1000)} s: ${String(input)}`
        );
        return response;
      }

      if (attempt === 1) {
        // Se registra qué respondió la plataforma, para diagnóstico.
        const preview = await response
          .text()
          .then((text) => text.slice(0, 120).replace(/\s+/g, ' '))
          .catch(() => '');

        console.warn(
          `Servicio interno iniciándose (HTTP ${response.status}, ${response.headers.get('content-type') ?? 'sin content-type'}), reintentando: ${String(input)} | ${preview}`
        );
      } else {
        await response.body?.cancel().catch(() => undefined);
      }

      await sleep(delay);
    }
  };
}

export interface InternalFetchOptions {
  /** Tiempo máximo esperando a que un servicio dormido despierte. */
  wakeTimeoutMs?: number;
  /** Inyectables para las pruebas. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

// Render (plan gratuito) puede tardar más de un minuto en despertar
// un servicio dormido.
const DEFAULT_WAKE_TIMEOUT_MS = 100_000;
const MAX_RETRY_DELAY_MS = 5_000;
const MAX_NETWORK_RETRIES = 2;
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);
/**
 * Nuestros servicios siempre responden JSON desde Express. Una
 * respuesta que no es JSON ni viene de Express (p. ej. la página HTML
 * que muestra Render mientras despierta un servicio) la generó la
 * plataforma: la aplicación nunca recibió la petición.
 * Un 404 HTML de Express (ruta inexistente) no cuenta.
 */
export function isWakeUpResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? '';
  const poweredBy = response.headers.get('x-powered-by') ?? '';

  return (
    !contentType.includes('application/json') &&
    !poweredBy.includes('Express')
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
