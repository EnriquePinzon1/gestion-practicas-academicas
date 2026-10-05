import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly gatewayUrl = 'http://localhost:3333/api';

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

    const response = await fetch(
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

    const response = await fetch(
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

  const response = await fetch(
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

  private async handleResponse<T>(
    response: Response
  ): Promise<T> {
    const body = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      throw new Error(
        body?.message ?? `Error HTTP ${response.status}`
      );
    }

    return body as T;
  }
}
