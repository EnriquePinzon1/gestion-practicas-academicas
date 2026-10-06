import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Practica {
  id_practica: number;
  nombre: string;
  descripcion: string;
  id_programa: number;
  programa: string;
  id_institucion: number;
  institucion: string;
  periodo_academico: string;
  horas_requeridas: number;
  estado: string;
}

interface Programa {
  id_programa: number;
  nombre: string;
}

interface Institucion {
  id_institucion: number;
  nombre: string;
}

@Component({
  selector: 'app-practices',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './practices.html',
  styleUrl: './practices.scss',
})
export class Practices {
  practicas = signal<Practica[]>([]);
  programas = signal<Programa[]>([]);
  instituciones = signal<Institucion[]>([]);

  loading = signal(false);
  errorMessage = signal('');

  search = signal('');
  programFilter = signal('');
  institutionFilter = signal('');
  periodFilter = signal('');
  statusFilter = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    this.loadData();
  }

  filteredPractices = computed(() => {
    const search = this.search().trim().toLowerCase();
    const program = this.programFilter();
    const institution = this.institutionFilter();
    const period = this.periodFilter().trim().toLowerCase();
    const status = this.statusFilter();

    return this.practicas().filter((practica) => {
      const matchesSearch =
        !search ||
        practica.nombre.toLowerCase().includes(search) ||
        practica.descripcion.toLowerCase().includes(search);

      const matchesProgram =
        !program ||
        practica.id_programa === Number(program);

      const matchesInstitution =
        !institution ||
        practica.id_institucion === Number(institution);

      const matchesPeriod =
        !period ||
        practica.periodo_academico.toLowerCase().includes(period);

      const matchesStatus =
        !status ||
        practica.estado === status;

      return (
        matchesSearch &&
        matchesProgram &&
        matchesInstitution &&
        matchesPeriod &&
        matchesStatus
      );
    });
  });

  async loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [practicesResponse, programsResponse, institutionsResponse] =
        await Promise.all([
          this.api.get<{ data: Practica[] }>('/practices'),
          this.api.get<{ data: Programa[] }>('/programs'),
          this.api.get<{ data: Institucion[] }>('/institutions'),
        ]);

      this.practicas.set(practicesResponse.data);
      this.programas.set(programsResponse.data);
      this.instituciones.set(institutionsResponse.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar las prácticas académicas.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters() {
    this.search.set('');
    this.programFilter.set('');
    this.institutionFilter.set('');
    this.periodFilter.set('');
    this.statusFilter.set('');
  }

  newPractice() {
    this.router.navigate(['/practicas/nueva']);
  }

  viewPractice(practica: Practica) {
    this.router.navigate([
      '/practicas',
      practica.id_practica,
    ]);
  }

  editPractice(practica: Practica) {
    this.router.navigate([
      '/practicas',
      practica.id_practica,
      'editar',
    ]);
  }

  async closePractice(practica: Practica) {
    const confirmed = window.confirm(
      '¿Está seguro de que desea cerrar la práctica "' +
        practica.nombre +
        '"? Esta acción conservará su información histórica.'
    );

    if (!confirmed) {
      return;
    }

    this.errorMessage.set('');

    try {
      await this.api.patch(
        '/practices/' + practica.id_practica + '/status',
        {
          estado: 'CERRADA',
        }
      );

      await this.loadData();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cerrar la práctica.'
      );
    }
  }
}
