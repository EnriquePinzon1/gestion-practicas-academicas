import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { supabase } from '../../core/supabase.client';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';

  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  constructor(private router: Router) {}

  async login() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (!this.email || !this.password) {
      this.errorMessage.set('Debe ingresar correo y contraseña.');
      return;
    }

    this.loading.set(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: this.email.trim(),
        password: this.password,
      });

      if (error) {
        this.errorMessage.set(
          `No fue posible iniciar sesión: ${error.message}`
        );
        return;
      }

      if (!data.session) {
        this.errorMessage.set('No se pudo crear una sesión.');
        return;
      }

      this.successMessage.set('Inicio de sesión correcto.');

      console.log('Usuario autenticado:', data.user);
      console.log('Sesión creada correctamente');

      await this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error de conexión con Supabase:', error);

      this.errorMessage.set(
        'No fue posible comunicarse con el servicio de autenticación.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
