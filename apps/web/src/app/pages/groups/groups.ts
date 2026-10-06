import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Grupo {
  id_grupo: number;
  nombre: string;
  semestre: number | null;
  id_docente: number;
  estado: string;
  id_practica: number;
  practica: string;
  total_estudiantes: number;
}

interface Docente {
  id_docente: number;
  nombres: string;
  apellidos: string;
}

interface Practica {
  id_practica: number;
  nombre: string;
  estado: string;
}

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './groups.html',
  styleUrl: './groups.scss',
})
export class Groups {
  grupos = signal<Grupo[]>([]);
  docentes = signal<Docente[]>([]);
  practicas = signal<Practica[]>([]);

  loading = signal(false);
  errorMessage = signal('');

  search = signal('');
  practiceFilter = signal('');
  statusFilter = signal('');
  semesterFilter = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    this.loadData();
  }

  filteredGroups = computed(() => {
    const search = this.search().trim().toLowerCase();
    const practice = this.practiceFilter();
    const status = this.statusFilter();
    const semester = this.semesterFilter();

    return this.grupos().filter((grupo) => {
      const matchesSearch =
        !search ||
        grupo.nombre.toLowerCase().includes(search) ||
        grupo.practica.toLowerCase().includes(search);

      const matchesPractice =
        !practice ||
        grupo.id_practica === Number(practice);

      const matchesStatus =
        !status ||
        grupo.estado === status;

      const matchesSemester =
        !semester ||
        grupo.semestre === Number(semester);

      return (
        matchesSearch &&
        matchesPractice &&
        matchesStatus &&
        matchesSemester
      );
    });
  });

  async loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [groupsResponse, teachersResponse, practicesResponse] =
        await Promise.all([
          this.api.get<{ data: Grupo[] }>('/groups'),
          this.api.get<{ data: Docente[] }>('/group-options/teachers'),
          this.api.get<{ data: Practica[] }>('/practices'),
        ]);

      this.grupos.set(groupsResponse.data);
      this.docentes.set(teachersResponse.data);
      this.practicas.set(practicesResponse.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar los grupos.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  teacherName(idDocente: number) {
    const docente = this.docentes().find(
      (item) => item.id_docente === idDocente
    );

    return docente
      ? docente.nombres + ' ' + docente.apellidos
      : 'Docente #' + idDocente;
  }

  clearFilters() {
    this.search.set('');
    this.practiceFilter.set('');
    this.statusFilter.set('');
    this.semesterFilter.set('');
  }

  newGroup() {
    this.router.navigate(['/grupos/nuevo']);
  }

  viewGroup(grupo: Grupo) {
    this.router.navigate([
      '/grupos',
      grupo.id_grupo,
    ]);
  }

  editGroup(grupo: Grupo) {
    this.router.navigate([
      '/grupos',
      grupo.id_grupo,
      'editar',
    ]);
  }

  async closeGroup(grupo: Grupo) {
    const confirmed = window.confirm(
      '¿Está seguro de que desea cerrar el grupo "' +
        grupo.nombre +
        '"? Sus integrantes y datos históricos se conservarán.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await this.api.patch(
        '/groups/' + grupo.id_grupo + '/status',
        {
          estado: 'CERRADO',
        }
      );

      await this.loadData();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cerrar el grupo.'
      );
    }
  }
}
