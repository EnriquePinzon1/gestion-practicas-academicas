import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-form.html',
  styleUrl: './user-form.scss',
})
export class UserForm {
  rol = 'DOCENTE';

  nombres = '';
  apellidos = '';
  tipoDocumento = 'CC';
  numeroDocumento = '';
  correo = '';
  telefono = '';

  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {}

  async save() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (
      !this.rol ||
      !this.nombres.trim() ||
      !this.apellidos.trim() ||
      !this.tipoDocumento ||
      !this.numeroDocumento.trim() ||
      !this.correo.trim()
    ) {
      this.errorMessage.set(
        'Complete todos los campos obligatorios.'
      );
      return;
    }

    this.loading.set(true);

    try {
      await this.api.post('/users', {
        rol: this.rol,
        nombres: this.nombres,
        apellidos: this.apellidos,
        tipo_documento: this.tipoDocumento,
        numero_documento: this.numeroDocumento,
        correo: this.correo,
        telefono: this.telefono || null,
      });

      this.successMessage.set(
        'Usuario registrado correctamente.'
      );

      setTimeout(() => {
        this.router.navigate(['/usuarios']);
      }, 900);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible registrar el usuario.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/usuarios']);
  }
}
