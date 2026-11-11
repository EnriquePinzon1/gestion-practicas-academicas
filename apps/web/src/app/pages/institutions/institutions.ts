import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Institucion {
  id_institucion: number;
  nombre: string;
}

@Component({
  selector: 'app-institutions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './institutions.html',
  styleUrl: './institutions.scss',
})
export class Institutions {
  instituciones = signal<Institucion[]>([]);

  loading = signal(false);
  saving = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  search = signal('');
  nuevoNombre = '';

  filteredInstitutions = computed(() => {
    const search =
      this.search().trim().toLowerCase();

    return this.instituciones().filter(
      (institucion) =>
        !search ||
        institucion.nombre
          .toLowerCase()
          .includes(search)
    );
  });

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response =
        await this.api.get<{
          data: Institucion[];
        }>('/institutions');

      this.instituciones.set(
        response.data
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar las instituciones receptoras.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async createInstitution() {
    this.errorMessage.set('');
    this.successMessage.set('');

    const nombre = this.nuevoNombre.trim();

    if (!nombre) {
      this.errorMessage.set(
        'El nombre de la institución es obligatorio.'
      );
      return;
    }

    this.saving.set(true);

    try {
      await this.api.post(
        '/institutions',
        { nombre }
      );

      this.successMessage.set(
        'Institución "' +
          nombre +
          '" registrada correctamente.'
      );

      this.nuevoNombre = '';

      await this.loadData();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible registrar la institución.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  viewInstitution(
    institucion: Institucion
  ) {
    this.router.navigate([
      '/instituciones',
      institucion.id_institucion,
    ]);
  }
}
