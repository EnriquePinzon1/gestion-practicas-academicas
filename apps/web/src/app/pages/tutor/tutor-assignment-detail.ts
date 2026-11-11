import { Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

import {
  ETIQUETAS_ESTADO,
  EstadoAsignacion,
} from '../assignments/assignment.model';

import { studentName } from '../follow-up/follow-up.model';
import { FollowUpTimeline } from '../follow-up/follow-up-timeline';

import { TutorAssignmentDetail as Detail } from './tutor.model';

// Detalle de un practicante para el Tutor Receptor:
// datos de la asignación y seguimiento académico en solo
// lectura (sin respuestas ni evidencias).
@Component({
  selector: 'app-tutor-assignment-detail',
  standalone: true,
  imports: [
    DatePipe,
    FollowUpTimeline,
  ],
  templateUrl: './tutor-assignment-detail.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    './tutor.scss',
  ],
})
export class TutorAssignmentDetail {

  detail = signal<Detail | null>(null);
  loading = signal(false);
  errorMessage = signal('');

  readonly studentName = studentName;

  private readonly idAsignacion: number;

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.idAsignacion = Number(
      this.route.snapshot.paramMap.get('id')
    );

    void this.load();
  }

  async load() {
    if (
      !Number.isInteger(this.idAsignacion) ||
      this.idAsignacion <= 0
    ) {
      this.errorMessage.set('La asignación indicada no es válida.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{ data: Detail }>(
        `/tutor/assignments/${this.idAsignacion}`
      );

      this.detail.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el practicante.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  back() {
    void this.router.navigate(['/practicantes']);
  }

  statusLabel(status: EstadoAsignacion): string {
    return ETIQUETAS_ESTADO[status] ?? status;
  }

  formatGrade(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
  }
}
