import {
  Component,
  computed,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

import {
  GroupFollowUp,
  studentName,
} from './follow-up.model';

interface TeacherGroup {
  id_grupo: number;
  nombre: string;
  estado: string;
  practica: string;
  periodo_academico: string;
}

// Seguimiento del Docente Asesor: resumen por estudiante
// de un grupo y acceso al historial individual.
@Component({
  selector: 'app-follow-up',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
  ],
  templateUrl: './follow-up.html',
  styleUrl: './follow-up.scss',
})
export class FollowUp {

  groups = signal<TeacherGroup[]>([]);
  selectedGroup = signal<number | null>(null);
  followUp = signal<GroupFollowUp | null>(null);

  loadingGroups = signal(false);
  loading = signal(false);
  errorMessage = signal('');

  searchTerm = signal('');

  readonly studentName = studentName;

  filteredStudents = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const students = this.followUp()?.estudiantes ?? [];

    if (!search) {
      return students;
    }

    return students.filter((student) =>
      [
        studentName(student),
        student.codigo_estudiante ?? '',
        student.correo ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  });

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    void this.loadGroups();
  }

  async loadGroups() {
    this.loadingGroups.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: TeacherGroup[];
      }>('/teacher/groups');

      const groups = response.data ?? [];
      this.groups.set(groups);

      // Grupo de la URL; si no, el primer grupo activo.
      const fromUrl = Number(
        this.route.snapshot.queryParamMap.get('grupo')
      );

      const initial =
        groups.find((g) => g.id_grupo === fromUrl) ??
        groups.find((g) => g.estado === 'ACTIVO') ??
        groups[0];

      if (initial) {
        await this.selectGroup(initial.id_grupo);
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar los grupos.'
      );
    } finally {
      this.loadingGroups.set(false);
    }
  }

  async selectGroup(value: number | string) {
    const idGrupo = Number(value);

    if (!idGrupo) {
      return;
    }

    this.selectedGroup.set(idGrupo);
    this.searchTerm.set('');

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { grupo: idGrupo },
      replaceUrl: true,
    });

    this.loading.set(true);
    this.errorMessage.set('');
    this.followUp.set(null);

    try {
      const response = await this.api.get<{
        data: GroupFollowUp;
      }>(`/teacher/follow-up/groups/${idGrupo}`);

      this.followUp.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el seguimiento del grupo.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  viewStudent(idEstudiante: number) {
    const idGrupo = this.selectedGroup();

    if (!idGrupo) {
      return;
    }

    void this.router.navigate([
      '/seguimiento',
      idGrupo,
      'estudiantes',
      idEstudiante,
    ]);
  }

  formatGrade(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
  }
}
