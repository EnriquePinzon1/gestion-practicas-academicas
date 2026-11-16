import type { Request, Response } from 'express';
import {
  INTERNAL_TOKEN_HEADER,
  createCors,
  createInternalFetch,
  readAllowedOrigins,
  readInternalToken,
  requireInternalToken,
  resolveServiceUrl,
} from '../index';

const TOKEN = 'a'.repeat(40);

function mockRequest(
  headers: Record<string, string> = {},
  method = 'GET'
): Request {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  return {
    method,
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
}

function mockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    varied: [] as string[],
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    sendStatus(code: number) {
      res.statusCode = code;
      return res;
    },
    header(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
    vary(name: string) {
      res.varied.push(name);
      return res;
    },
  };

  return res;
}

describe('resolveServiceUrl', () => {
  it('usa el valor por defecto si la variable no existe', () => {
    expect(
      resolveServiceUrl('USER_SERVICE_URL', 'http://localhost:3334', {})
    ).toBe('http://localhost:3334');
  });

  it('usa la variable y quita la barra final', () => {
    expect(
      resolveServiceUrl('USER_SERVICE_URL', 'http://localhost:3334', {
        USER_SERVICE_URL: ' https://users.onrender.com/ ',
      })
    ).toBe('https://users.onrender.com');
  });

  it('rechaza URLs inválidas o con otro protocolo', () => {
    expect(() =>
      resolveServiceUrl('X_URL', 'http://localhost', { X_URL: 'nada' })
    ).toThrow('X_URL no es una URL válida');

    expect(() =>
      resolveServiceUrl('X_URL', 'http://localhost', {
        X_URL: 'ftp://servidor',
      })
    ).toThrow('debe usar http o https');
  });
});

describe('readInternalToken', () => {
  it('exige el secreto', () => {
    expect(() => readInternalToken({})).toThrow('Falta INTERNAL_API_TOKEN');
  });

  it('exige una longitud mínima', () => {
    expect(() =>
      readInternalToken({ INTERNAL_API_TOKEN: 'corto' })
    ).toThrow('al menos 32');
  });

  it('devuelve el secreto sin espacios', () => {
    expect(readInternalToken({ INTERNAL_API_TOKEN: ` ${TOKEN} ` })).toBe(
      TOKEN
    );
  });
});

describe('requireInternalToken', () => {
  const middleware = requireInternalToken(TOKEN);

  it('deja pasar la petición con el secreto correcto', () => {
    const res = mockResponse();
    const next = vi.fn();

    middleware(
      mockRequest({ [INTERNAL_TOKEN_HEADER]: TOKEN }),
      res as unknown as Response,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ['sin cabecera', {}],
    ['con otro secreto', { [INTERNAL_TOKEN_HEADER]: 'b'.repeat(40) }],
    ['con otra longitud', { [INTERNAL_TOKEN_HEADER]: 'a' }],
  ])('responde 401 %s', (_caso, headers) => {
    const res = mockResponse();
    const next = vi.fn();

    middleware(mockRequest(headers), res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe('createInternalFetch', () => {
  it('agrega el secreto y conserva las cabeceras de la llamada', async () => {
    const baseFetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    );
    const internalFetch = createInternalFetch(
      TOKEN,
      baseFetch as unknown as typeof fetch
    );

    await internalFetch('http://localhost:3334/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const [url, init] = baseFetch.mock.calls[0];
    const headers = init.headers as Headers;

    expect(url).toBe('http://localhost:3334/api/users');
    expect(init.method).toBe('POST');
    expect(headers.get(INTERNAL_TOKEN_HEADER)).toBe(TOKEN);
    expect(headers.get('content-type')).toBe('application/json');
  });
});

describe('createInternalFetch: servicio dormido', () => {
  const URL_PRACTICAS = 'https://practice.onrender.com/api/practices';

  // Reloj simulado: sleep avanza el tiempo sin esperar de verdad.
  function fakeClock() {
    let t = 0;
    const waits: number[] = [];

    return {
      waits,
      now: () => t,
      sleep: async (ms: number) => {
        waits.push(ms);
        t += ms;
      },
    };
  }

  const wakeUp = () =>
    new Response('<html>Service waking up</html>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });

  const ok = () =>
    new Response('{"data":[]}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  it('reintenta mientras el proxy responde 502/503/504 sin JSON', async () => {
    const clock = fakeClock();
    const baseFetch = vi
      .fn()
      .mockResolvedValueOnce(wakeUp())
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(ok());
    const internalFetch = createInternalFetch(
      TOKEN,
      baseFetch as unknown as typeof fetch,
      { sleep: clock.sleep, now: clock.now }
    );

    const response = await internalFetch(URL_PRACTICAS);

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(3);
    expect(clock.waits).toEqual([1000, 2000]);
  });

  it('reintenta un POST: el proxy no entregó la petición', async () => {
    const clock = fakeClock();
    const baseFetch = vi
      .fn()
      .mockResolvedValueOnce(wakeUp())
      .mockResolvedValueOnce(ok());
    const internalFetch = createInternalFetch(
      TOKEN,
      baseFetch as unknown as typeof fetch,
      { sleep: clock.sleep, now: clock.now }
    );

    await internalFetch(URL_PRACTICAS, { method: 'POST', body: '{"a":1}' });

    expect(baseFetch).toHaveBeenCalledTimes(2);
    expect(baseFetch.mock.calls[1][1].body).toBe('{"a":1}');
  });

  it('reintenta una página HTML de la plataforma aunque venga con 200', async () => {
    const clock = fakeClock();
    const baseFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<!DOCTYPE html><title>Waking up</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      )
      .mockResolvedValueOnce(ok());
    const internalFetch = createInternalFetch(
      TOKEN,
      baseFetch as unknown as typeof fetch,
      { sleep: clock.sleep, now: clock.now }
    );

    const response = await internalFetch(URL_PRACTICAS);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it('no reintenta un 404 HTML de Express: la ruta no existe', async () => {
    const clock = fakeClock();
    const baseFetch = vi.fn().mockResolvedValue(
      new Response('<!DOCTYPE html><pre>Cannot GET /api/x</pre>', {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Powered-By': 'Express',
        },
      })
    );
    const internalFetch = createInternalFetch(
      TOKEN,
      baseFetch as unknown as typeof fetch,
      { sleep: clock.sleep, now: clock.now }
    );

    const response = await internalFetch(URL_PRACTICAS);

    expect(response.status).toBe(404);
    expect(baseFetch).toHaveBeenCalledOnce();
  });

  it('no reintenta un 503 en JSON: lo respondió la aplicación', async () => {
    const clock = fakeClock();
    const baseFetch = vi.fn().mockResolvedValue(
      new Response('{"message":"Practice Service no disponible"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    );
    const internalFetch = createInternalFetch(
      TOKEN,
      baseFetch as unknown as typeof fetch,
      { sleep: clock.sleep, now: clock.now }
    );

    const response = await internalFetch(URL_PRACTICAS);

    expect(response.status).toBe(503);
    expect(baseFetch).toHaveBeenCalledOnce();
  });

  it('se rinde al agotar el tiempo y devuelve la última respuesta', async () => {
    const clock = fakeClock();
    const baseFetch = vi.fn().mockImplementation(async () => wakeUp());
    const internalFetch = createInternalFetch(
      TOKEN,
      baseFetch as unknown as typeof fetch,
      { sleep: clock.sleep, now: clock.now, wakeTimeoutMs: 10_000 }
    );

    const response = await internalFetch(URL_PRACTICAS);

    expect(response.status).toBe(503);
    expect(clock.now()).toBeLessThanOrEqual(10_000);
    expect(clock.waits).toEqual([1000, 2000, 3000, 4000]);
  });

  it('error de red: reintenta un GET pocas veces, nunca un POST', async () => {
    const clock = fakeClock();
    const failing = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const internalFetch = createInternalFetch(
      TOKEN,
      failing as unknown as typeof fetch,
      { sleep: clock.sleep, now: clock.now }
    );

    await expect(internalFetch(URL_PRACTICAS)).rejects.toThrow('fetch failed');
    expect(failing).toHaveBeenCalledTimes(3);

    failing.mockClear();

    await expect(
      internalFetch(URL_PRACTICAS, { method: 'POST', body: '{}' })
    ).rejects.toThrow('fetch failed');
    expect(failing).toHaveBeenCalledOnce();
  });
});

describe('CORS', () => {
  it('lee varios orígenes separados por coma', () => {
    expect(
      readAllowedOrigins({
        CORS_ALLOWED_ORIGINS: 'https://app.vercel.app/, http://localhost:4200',
      })
    ).toEqual(['https://app.vercel.app', 'http://localhost:4200']);
  });

  it('por defecto permite el Angular local', () => {
    expect(readAllowedOrigins({})).toEqual(['http://localhost:4200']);
  });

  const cors = createCors(['https://app.vercel.app']);

  it('refleja un origen autorizado', () => {
    const res = mockResponse();
    const next = vi.fn();

    cors(
      mockRequest({ Origin: 'https://app.vercel.app' }),
      res as unknown as Response,
      next
    );

    expect(res.headers['Access-Control-Allow-Origin']).toBe(
      'https://app.vercel.app'
    );
    expect(res.varied).toContain('Origin');
    expect(next).toHaveBeenCalledOnce();
  });

  it('no autoriza un origen desconocido', () => {
    const res = mockResponse();

    cors(
      mockRequest({ Origin: 'https://otro.com' }),
      res as unknown as Response,
      vi.fn()
    );

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('responde la verificación OPTIONS con 204', () => {
    const res = mockResponse();
    const next = vi.fn();

    cors(
      mockRequest({ Origin: 'https://app.vercel.app' }, 'OPTIONS'),
      res as unknown as Response,
      next
    );

    expect(res.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });
});
