import {
  Component,
  computed,
  signal,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

interface TeacherGroup {
  id_grupo: number;
  nombre: string;
  semestre: number | null;
  estado: string;
  id_docente: number;
  id_practica: number;
  practica: string;
  periodo_academico: string;
  total_estudiantes: number;
}

interface ActivityGroup {
  id_grupo: number;
  nombre: string;
  practica: string;
  semestre: number | null;
  estado: string;
}

interface Activity {
  id_actividad: number;
  id_grupo: number;
  id_docente: number;
  titulo: string;
  descripcion: string;
  fecha_limite: string;
  hora_limite: string;
  estado: string;
  total_preguntas: number;
  creado_en: string;
  actualizado_en: string;
  grupo: ActivityGroup | null;
}

@Component({
  selector: 'app-activities',
  standalone: true,
  imports: [
    FormsModule,
  ],
  templateUrl: './activities.html',
  styleUrl: './activities.scss',
})
export class Activities {

  groups = signal<TeacherGroup[]>([]);
  activities = signal<Activity[]>([]);

  loading = signal(false);
  errorMessage = signal('');

  searchTerm = signal('');
  statusFilter = signal('TODAS');
  groupFilter = signal('TODOS');

  activeGroups = computed(
    () =>
      this.groups().filter(
        (group) =>
          group.estado === 'ACTIVO'
      )
  );

  filteredActivities = computed(() => {
    const search =
      this.searchTerm()
        .trim()
        .toLowerCase();

    const status =
      this.statusFilter();

    const group =
      this.groupFilter();

    return this.activities().filter(
      (activity) => {

        const matchesSearch =
          !search ||
          activity.titulo
            .toLowerCase()
            .includes(search) ||
          activity.descripcion
            .toLowerCase()
            .includes(search) ||
          (
            activity.grupo?.nombre ?? ''
          )
            .toLowerCase()
            .includes(search);

        const matchesStatus =
          status === 'TODAS' ||
          activity.estado === status;

        const matchesGroup =
          group === 'TODOS' ||
          Number(group) ===
            activity.id_grupo;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesGroup
        );
      }
    );
  });

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    void this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [
        groupsResponse,
        activitiesResponse,
      ] = await Promise.all([
        this.api.get<{
          data: TeacherGroup[];
        }>('/teacher/groups'),

        this.api.get<{
          data: Activity[];
        }>('/activities'),
      ]);

      this.groups.set(
        groupsResponse.data ?? []
      );

      this.activities.set(
        activitiesResponse.data ?? []
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las actividades.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  newActivity() {
    const selectedGroup =
      this.groupFilter();

    if (
      selectedGroup !== 'TODOS'
    ) {
      const group =
        this.groups().find(
          (item) =>
            item.id_grupo ===
            Number(selectedGroup)
        );

      if (
        group &&
        group.estado === 'ACTIVO'
      ) {
        void this.router.navigate(
          ['/actividades/nueva'],
          {
            queryParams: {
              groupId:
                group.id_grupo,
            },
          }
        );

        return;
      }
    }

    void this.router.navigate([
      '/actividades/nueva',
    ]);
  }

  viewActivity(
    idActividad: number
  ) {
    void this.router.navigate([
      '/actividades',
      idActividad,
    ]);
  }

  editActivity(
    idActividad: number
  ) {
    void this.router.navigate([
      '/actividades',
      idActividad,
      'editar',
    ]);
  }

  clearFilters() {
    this.searchTerm.set('');
    this.statusFilter.set('TODAS');
    this.groupFilter.set('TODOS');
  }

  formatDate(
    value: string
  ): string {
    if (!value) {
      return '-';
    }

    return value.substring(0, 10);
  }

  formatTime(
    value: string
  ): string {
    if (!value) {
      return '-';
    }

    return value.substring(0, 5);
  }
}
