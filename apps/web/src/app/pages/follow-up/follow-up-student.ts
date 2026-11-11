import { Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

import {
  FOLLOW_UP_LABELS,
  FollowUpState,
  StudentFollowUp,
  studentName,
} from './follow-up.model';

// Historial de seguimiento de un estudiante en un grupo:
// todas las actividades que recibió (snapshot), con su
// entrega, evidencias y retroalimentación.
@Component({
  selector: 'app-follow-up-student',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './follow-up-student.html',
  styleUrls: [
    './follow-up.scss',
    './follow-up-student.scss',
  ],
})
export class FollowUpStudent {

  history = signal<StudentFollowUp | null>(null);
  loading = signal(false);
  errorMessage = signal('');

  readonly studentName = studentName;

  private readonly idGrupo: number;
  private readonly idEstudiante: number;

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    const params = this.route.snapshot.paramMap;

    this.idGrupo = Number(params.get('idGrupo'));
    this.idEstudiante = Number(params.get('idEstudiante'));

    void this.load();
  }

  async load() {
    if (
      !Number.isInteger(this.idGrupo) ||
      this.idGrupo <= 0 ||
      !Number.isInteger(this.idEstudiante) ||
      this.idEstudiante <= 0
    ) {
      this.errorMessage.set('La ruta del historial no es válida.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: StudentFollowUp;
      }>(
        `/teacher/follow-up/groups/${this.idGrupo}` +
          `/students/${this.idEstudiante}`
      );

      this.history.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el historial.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  back() {
    void this.router.navigate(['/seguimiento'], {
      queryParams: { grupo: this.idGrupo },
    });
  }

  viewActivity(idActividad: number) {
    void this.router.navigate(['/actividades', idActividad]);
  }

  stateLabel(state: FollowUpState): string {
    return FOLLOW_UP_LABELS[state] ?? state;
  }

  formatGrade(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
  }

  formatDate(value: string): string {
    return value ? value.substring(0, 10) : '-';
  }

  formatTime(value: string): string {
    return value ? value.substring(0, 5) : '-';
  }
}
