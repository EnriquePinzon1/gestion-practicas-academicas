import {
  Component,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { supabase } from
  '../../core/supabase.client';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  password = '';
  confirmPassword = '';

  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  constructor(
    private readonly router: Router
  ) {}

  async updatePassword() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (
      !this.password ||
      !this.confirmPassword
    ) {
      this.errorMessage.set(
        'Debe completar ambos campos.'
      );
      return;
    }

    if (this.password.length < 8) {
      this.errorMessage.set(
        'La contraseña debe tener al menos 8 caracteres.'
      );
      return;
    }

    if (
      this.password !==
      this.confirmPassword
    ) {
      this.errorMessage.set(
        'Las contraseñas no coinciden.'
      );
      return;
    }

    this.loading.set(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        this.errorMessage.set(
          'El enlace de recuperación no es válido o ha expirado. Solicite uno nuevo.'
        );
        return;
      }

      const { error } =
        await supabase.auth.updateUser({
          password: this.password,
        });

      if (error) {
        this.errorMessage.set(
          `No fue posible actualizar la contraseña: ${error.message}`
        );
        return;
      }

      this.successMessage.set(
        'Contraseña actualizada correctamente.'
      );

      await new Promise(
        (resolve) =>
          setTimeout(resolve, 1200)
      );

      await supabase.auth.signOut();

      await this.router.navigate([
        '/login',
      ]);
    } catch (error) {
      console.error(
        'Error actualizando contraseña:',
        error
      );

      this.errorMessage.set(
        'No fue posible actualizar la contraseña.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
