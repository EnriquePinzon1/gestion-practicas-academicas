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

import {
  CoordinatorHours,
  formatHours,
  personName,
} from './practice-hours.model';

// Horas de práctica (Coordinador): avance de horas de cada
// asignación; desde aquí se entra a registrar horas.
@Component({
  selector: 'app-practice-hours',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
  ],
  templateUrl: './practice-hours.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    '../tutor/tutor.scss',
    './practice-hours.scss',
  ],
})
export class PracticeHours {

  assignments = signal<CoordinatorHours[]>([]);
  loading = signal(false);
  errorMessage = signal('');

  searchTerm = signal('');
  periodFilter = signal('TODOS');
  statusFilter = signal('EN_CURSO');
  // TODOS | PENDIENTES | COMPLETADAS
  progressFilter = signal('TODOS');

  readonly format = formatHours;

  periods = computed(() =>
    [...new Set(
      this.assignments().map((a) => a.periodo_academico)
    )].sort((a, b) => b.localeCompare(a))
  );

  inProgress = computed(() =>
    this.assignments().filter((a) => a.estado === 'EN_CURSO')
  );

  inProgressCompleted = computed(
    () => this.inProgress().filter((a) => a.completadas).length
  );

  hoursInProgress = computed(() =>
    this.inProgress().reduce(
      (total, a) => total + a.horas_realizadas,
      0
    )
  );

  withoutRecords = computed(
    () =>
      this.inProgress().filter((a) => a.total_registros === 0)
        .length
  );

  filtered = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const period = this.periodFilter();
    const status = this.statusFilter();
    const progress = this.progressFilter();

    return this.assignments().filter((a) => {
      const matchesPeriod =
        period === 'TODOS' || a.periodo_academico === period;

      const matchesStatus =
        status === 'TODAS' || a.estado === status;

      const matchesProgress =
        progress === 'TODOS' ||
        (progress === 'COMPLETADAS' && a.completadas) ||
        (progress === 'PENDIENTES' && !a.completadas);

      const matchesSearch =
        !search ||
        [
          this.studentName(a),
          a.estudiante?.codigo_estudiante ?? '',
          a.practica,
          a.institucion,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search);

      return (
        matchesPeriod &&
        matchesStatus &&
        matchesProgress &&
        matchesSearch
      );
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
        data: CoordinatorHours[];
      }>('/practice-hours');

      this.assignments.set(response.data ?? []);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las horas de práctica.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  studentName(a: CoordinatorHours): string {
    return personName(
      a.estudiante,
      `Estudiante #${a.id_estudiante}`
    );
  }

  statusLabel(status: EstadoAsignacion): string {
    return ETIQUETAS_ESTADO[status] ?? status;
  }

  view(idAsignacion: number) {
    void this.router.navigate(['/horas', idAsignacion]);
  }

  clearFilters() {
    this.searchTerm.set('');
    this.periodFilter.set('TODOS');
    this.statusFilter.set('EN_CURSO');
    this.progressFilter.set('TODOS');
  }
}
