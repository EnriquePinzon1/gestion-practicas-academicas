import {
  Component,
  computed,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ApiService } from
  '../../core/services/api.service';

import {
  ETIQUETAS_ESTADO,
  EstadoAsignacion,
} from '../assignments/assignment.model';

import { HoursProgress } from
  '../practice-hours/hours-progress';

import {
  StudentHours,
  formatHours,
} from '../practice-hours/practice-hours.model';

// Mi Seguimiento (Estudiante): progreso de las horas de su
// práctica y el detalle de los registros. Solo lectura; el id
// del estudiante sale del token en el Gateway.
@Component({
  selector: 'app-student-follow-up',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    HoursProgress,
  ],
  templateUrl: './student-follow-up.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    '../tutor/tutor.scss',
    '../practice-hours/practice-hours-detail.scss',
    './student-follow-up.scss',
  ],
})
export class StudentFollowUp {

  // El backend las ordena: en curso, asignadas, finalizadas.
  practices = signal<StudentHours[]>([]);
  selectedId = signal<number | null>(null);
  loading = signal(false);
  errorMessage = signal('');

  readonly format = formatHours;

  selected = computed(
    () =>
      this.practices().find(
        (p) => p.id_asignacion === this.selectedId()
      ) ?? null
  );

  constructor(private readonly api: ApiService) {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: StudentHours[];
      }>('/student/follow-up');

      const practices = response.data ?? [];

      this.practices.set(practices);
      this.selectedId.set(practices[0]?.id_asignacion ?? null);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar tu seguimiento.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  select(id: string | number) {
    this.selectedId.set(Number(id));
  }

  optionLabel(p: StudentHours): string {
    return `${p.practica} · ${p.periodo_academico} · ${this.statusLabel(p.estado)}`;
  }

  statusLabel(status: EstadoAsignacion): string {
    return ETIQUETAS_ESTADO[status] ?? status;
  }
}
