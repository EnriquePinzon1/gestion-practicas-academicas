import {
  Component,
  computed,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

import {
  ETIQUETAS_ESTADO,
  EstadoAsignacion,
} from '../assignments/assignment.model';

import { studentName } from '../follow-up/follow-up.model';

import {
  TutorAssignment,
  isCurrentAssignment,
} from './tutor.model';

// Panel del Tutor Receptor: practicantes a su cargo según
// las asignaciones individuales de práctica.
@Component({
  selector: 'app-tutor-assignments',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
  ],
  templateUrl: './tutor-assignments.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    './tutor.scss',
  ],
})
export class TutorAssignments {

  assignments = signal<TutorAssignment[]>([]);
  loading = signal(false);
  errorMessage = signal('');

  searchTerm = signal('');
  // VIGENTES = ASIGNADA o EN_CURSO
  statusFilter = signal('VIGENTES');

  readonly studentName = studentName;

  current = computed(() =>
    this.assignments().filter(isCurrentAssignment)
  );

  inProgress = computed(
    () =>
      this.assignments().filter((a) => a.estado === 'EN_CURSO')
        .length
  );

  finished = computed(
    () =>
      this.assignments().filter((a) => a.estado === 'FINALIZADA')
        .length
  );

  filtered = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.assignments().filter((assignment) => {
      const matchesStatus =
        status === 'TODAS' ||
        (status === 'VIGENTES' &&
          isCurrentAssignment(assignment)) ||
        assignment.estado === status;

      const matchesSearch =
        !search ||
        [
          studentName(assignment.estudiante),
          assignment.estudiante.codigo_estudiante ?? '',
          assignment.practica,
          assignment.institucion,
          assignment.periodo_academico,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search);

      return matchesStatus && matchesSearch;
    });
  });

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: TutorAssignment[];
      }>('/tutor/assignments');

      this.assignments.set(response.data ?? []);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar tus practicantes.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  view(idAsignacion: number) {
    void this.router.navigate(['/practicantes', idAsignacion]);
  }

  statusLabel(status: EstadoAsignacion): string {
    return ETIQUETAS_ESTADO[status] ?? status;
  }

  clearFilters() {
    this.searchTerm.set('');
    this.statusFilter.set('VIGENTES');
  }
}
