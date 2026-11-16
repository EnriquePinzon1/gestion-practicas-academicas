import { Injectable, computed, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly gatewayUrl = environment.apiUrl;

  // Peticiones que llevan más de SLOW_REQUEST_MS esperando.
  private readonly slowRequests = signal(0);

  // true mientras alguna petición espera a que el servidor despierte.
  readonly serverWaking = computed(() => this.slowRequests() > 0);

  private lastWakeAt = 0;

  constructor() {
    // Al abrir la app se despiertan los servicios internos, para
    // que estén listos cuando el Gateway los consulte.
    this.wakeServices();
  }

  // En Render gratuito un servicio dormido solo despierta con una
  // petición externa: el navegador consulta el health público de
  // cada servicio (sin esperar la respuesta). Como mucho una vez
  // por minuto y solo mientras alguien usa la aplicación.
  private wakeServices() {
    const now = Date.now();

    if (now - this.lastWakeAt < WAKE_INTERVAL_MS) {
      return;
    }

    this.lastWakeAt = now;

    for (const url of environment.serviceWakeUrls) {
      fetch(url, { mode: 'no-cors', cache: 'no-store' }).catch(
        () => undefined
      );
    }
  }

  private async getToken(): Promise<string> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      throw new Error('No existe una sesión autenticada.');
    }

    return session.access_token;
  }

  async get<T>(endpoint: string): Promise<T> {
    const token = await this.getToken();

    const response = await this.send(
      `${this.gatewayUrl}${endpoint}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return this.handleResponse<T>(response);
  }

  async post<T>(
    endpoint: string,
    body: unknown
  ): Promise<T> {
    const token = await this.getToken();

    const response = await this.send(
      `${this.gatewayUrl}${endpoint}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    return this.handleResponse<T>(response);
  }

async patch<T>(
  endpoint: string,
  body: unknown
): Promise<T> {
  const token = await this.getToken();

  const response = await this.send(
    `${this.gatewayUrl}${endpoint}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  return this.handleResponse<T>(response);
}

  async put<T>(
    endpoint: string,
    body: unknown
  ): Promise<T> {
    const token = await this.getToken();

    const response = await this.send(
      `${this.gatewayUrl}${endpoint}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string): Promise<T> {
    const token = await this.getToken();

    const response = await this.send(
      `${this.gatewayUrl}${endpoint}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return this.handleResponse<T>(response);
  }

  // Sube un archivo como binario; el nombre original va
  // en ?nombre= (el backend valida tipo y tamaño).
  async upload<T>(
    endpoint: string,
    file: File
  ): Promise<T> {
    const token = await this.getToken();

    const separator = endpoint.includes('?') ? '&' : '?';

    const response = await this.send(
      `${this.gatewayUrl}${endpoint}${separator}nombre=${encodeURIComponent(file.name)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      }
    );

    return this.handleResponse<T>(response);
  }

  // Envía la petición al Gateway. En el plan gratuito de Render
  // el servidor se duerme tras 15 min sin uso y tarda hasta ~1 min
  // en despertar: se avisa al usuario (serverWaking) y se reintenta
  // solo cuando es seguro hacerlo.
  private async send(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const deadline = Date.now() + WAKE_TIMEOUT_MS;

    let markedSlow = false;

    const slowTimer = setTimeout(() => {
      markedSlow = true;
      this.slowRequests.update((n) => n + 1);
      // Algún servicio pudo dormirse con la app abierta.
      this.wakeServices();
    }, SLOW_REQUEST_MS);

    try {
      for (let attempt = 1; ; attempt++) {
        const delay = Math.min(attempt * 1000, 5000);
        const canWait = Date.now() + delay <= deadline;

        let response: Response;

        try {
          response = await fetch(url, init);
        } catch {
          // Sin respuesta legible (red caída o proxy de Render sin
          // cabeceras CORS). Solo se repiten las consultas: un envío
          // pudo haber llegado y no debe duplicarse.
          if (method !== 'GET' || !canWait) {
            throw new Error(
              'No fue posible conectar con el servidor. Verifica tu conexión e intenta de nuevo.'
            );
          }

          await wait(delay);
          continue;
        }

        if (!isWakeUpResponse(response) || !canWait) {
          return response;
        }

        // Respuesta del proxy mientras el servidor despierta: la
        // aplicación no recibió la petición, repetirla es seguro.
        await response.body?.cancel().catch(() => undefined);
        await wait(delay);
      }
    } finally {
      clearTimeout(slowTimer);

      if (markedSlow) {
        this.slowRequests.update((n) => n - 1);
      }
    }
  }

  private async handleResponse<T>(
    response: Response
  ): Promise<T> {
    const body = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      if (WAKE_UP_STATUSES.has(response.status)) {
        throw new Error(
          'El servicio no está disponible en este momento. Intenta de nuevo en unos segundos.'
        );
      }

      throw new Error(
        body?.message ?? `Error HTTP ${response.status}`
      );
    }

    return body as T;
  }
}

// Tras este tiempo se muestra el aviso "el servidor se está iniciando".
const SLOW_REQUEST_MS = 5000;
// Mínimo entre dos intentos de despertar los servicios.
const WAKE_INTERVAL_MS = 60000;
// Render (plan gratuito) puede tardar más de un minuto en despertar.
const WAKE_TIMEOUT_MS = 100000;
const WAKE_UP_STATUSES = new Set([502, 503, 504]);

// El Gateway siempre responde JSON. Una respuesta que no es JSON la
// generó la plataforma (p. ej. la página de Render mientras despierta).
// El 404 HTML de Express (ruta inexistente) no se reintenta.
function isWakeUpResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? '';

  return (
    !contentType.includes('application/json') &&
    response.status !== 404
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
