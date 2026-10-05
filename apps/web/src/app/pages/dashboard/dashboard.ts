import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { supabase } from '../../core/supabase.client';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  result = signal('');
  errorMessage = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {}

  async testGateway() {
    this.result.set('');
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        authenticated: boolean;
        id: string;
        email: string;
      }>('/auth/me');

      this.result.set(
        `Autenticado correctamente: ${response.email}`
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Error desconocido'
      );
    }
  }

  async testUserService() {
    this.result.set('');
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        gateway: string;
        service: string;
        status: string;
      }>('/users/health');

      this.result.set(
        `Gateway: ${response.gateway} | Servicio: ${response.service} | Estado: ${response.status}`
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Error desconocido'
      );
    }
  }

  async testUsers() {
    this.result.set('');
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: Array<{
          id_usuario: number;
          nombres: string;
          apellidos: string;
          correo: string;
          estado: string;
          rol: string;
        }>;
      }>('/users');

      this.result.set(
        JSON.stringify(response.data, null, 2)
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Error desconocido'
      );
    }
  }

  async logout() {
    await supabase.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
