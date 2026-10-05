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

    const response = await fetch(`${this.gatewayUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);

      throw new Error(
        body?.message ?? `Error HTTP ${response.status}`
      );
    }

    return response.json() as Promise<T>;
  }
}
