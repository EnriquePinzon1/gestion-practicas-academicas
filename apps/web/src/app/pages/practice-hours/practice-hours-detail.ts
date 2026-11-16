import {
  Component,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

import {
  ETIQUETAS_ESTADO,
  EstadoAsignacion,
} from '../assignments/assignment.model';

import { HoursProgress } from './hours-progress';

import {
  CoordinatorHoursDetail,
  HoursRecord,
  HoursSummary,
  MAX_OBSERVACION_HORAS,
  formatHours,
  personName,
  wasEdited,
} from './practice-hours.model';

interface HoursMutationResponse {
  message: string;
  data: {
    registro?: HoursRecord;
    resumen: HoursSummary;
  };
}

// Registro de horas de una asignación (Coordinador): resumen
// de avance, formulario y historial. Se registra, corrige y
// elimina solo mientras la asignación está EN_CURSO.
@Component({
  selector: 'app-practice-hours-detail',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    HoursProgress,
  ],
  templateUrl: './practice-hours-detail.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    '../tutor/tutor.scss',
    '../tutor/tutor-observations.scss',
    './practice-hours.scss',
    './practice-hours-detail.scss',
  ],
})
export class PracticeHoursDetail {

  detail = signal<CoordinatorHoursDetail | null>(null);
  loading = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  formError = signal('');
  successMessage = signal('');

  // null = nuevo registro; id = corrección.
  editingId = signal<number | null>(null);
  fechaInput = signal('');
  horasInput = signal<number | null>(null);
  observacionInput = signal('');

  readonly maxLength = MAX_OBSERVACION_HORAS;
  readonly format = formatHours;
  readonly wasEdited = wasEdited;

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

  private basePath() {
    return `/practice-hours/${this.idAsignacion}`;
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: CoordinatorHoursDetail;
      }>(this.basePath());

      this.detail.set(response.data);
      this.resetForm();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las horas de la asignación.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  studentName(d: CoordinatorHoursDetail): string {
    return personName(
      d.estudiante,
      `Estudiante #${d.id_estudiante}`
    );
  }

  tutorName(d: CoordinatorHoursDetail): string {
    return personName(d.tutor, 'Sin tutor asignado');
  }

  statusLabel(status: EstadoAsignacion): string {
    return ETIQUETAS_ESTADO[status] ?? status;
  }

  resetForm() {
    this.editingId.set(null);
    this.fechaInput.set(this.detail()?.fecha_maxima ?? '');
    this.horasInput.set(null);
    this.observacionInput.set('');
    this.formError.set('');
  }

  edit(record: HoursRecord) {
    this.editingId.set(record.id_registro);
    this.fechaInput.set(record.fecha);
    this.horasInput.set(record.horas);
    this.observacionInput.set(record.observacion ?? '');
    this.formError.set('');
    this.successMessage.set('');

    document
      .querySelector('.hours-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async save() {
    const detail = this.detail();

    if (!detail) {
      return;
    }

    const fecha = this.fechaInput().trim();
    const horas = Number(this.horasInput());
    const observacion = this.observacionInput().trim();

    this.successMessage.set('');

    if (!fecha) {
      this.formError.set('Seleccione la fecha del registro.');
      return;
    }

    if (fecha > detail.fecha_maxima) {
      this.formError.set('La fecha no puede ser futura.');
      return;
    }

    if (fecha < detail.fecha_minima) {
      this.formError.set(
        'La fecha no puede ser anterior al inicio de la práctica.'
      );
      return;
    }

    if (
      this.horasInput() === null ||
      !Number.isFinite(horas) ||
      horas <= 0
    ) {
      this.formError.set(
        'Ingrese una cantidad de horas mayor que cero.'
      );
      return;
    }

    if (Math.abs(horas * 10 - Math.round(horas * 10)) > 1e-9) {
      this.formError.set(
        'La cantidad de horas admite como máximo un decimal.'
      );
      return;
    }

    if (horas > detail.horas_maximas_registro) {
      this.formError.set(
        `Un registro no puede superar las ${detail.horas_maximas_registro} horas requeridas de la práctica.`
      );
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    const editingId = this.editingId();
    const body = { fecha, horas, observacion };

    try {
      const response = editingId
        ? await this.api.put<HoursMutationResponse>(
            `${this.basePath()}/records/${editingId}`,
            body
          )
        : await this.api.post<HoursMutationResponse>(
            this.basePath(),
            body
          );

      this.applyMutation(response);
      this.resetForm();
      this.successMessage.set(response.message);
    } catch (error) {
      this.formError.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el registro de horas.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  async remove(record: HoursRecord) {
    const confirmed = window.confirm(
      `¿Eliminar el registro de ${this.format(record.horas)} h del ` +
        `${record.fecha.split('-').reverse().join('/')}? ` +
        'Las horas se descontarán del acumulado.'
    );

    if (!confirmed) {
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.successMessage.set('');

    try {
      const response = await this.api.delete<HoursMutationResponse>(
        `${this.basePath()}/records/${record.id_registro}`
      );

      this.detail.update(
        (d) =>
          d && {
            ...d,
            ...response.data.resumen,
            registros: d.registros.filter(
              (r) => r.id_registro !== record.id_registro
            ),
          }
      );

      if (this.editingId() === record.id_registro) {
        this.resetForm();
      }

      this.successMessage.set(response.message);
    } catch (error) {
      this.formError.set(
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar el registro de horas.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  // Actualiza resumen e historial (fecha desc, id desc, igual
  // que el backend) sin volver a consultar.
  private applyMutation(response: HoursMutationResponse) {
    const record = response.data.registro;

    this.detail.update((d) => {
      if (!d || !record) {
        return d;
      }

      return {
        ...d,
        ...response.data.resumen,
        registros: [
          record,
          ...d.registros.filter(
            (r) => r.id_registro !== record.id_registro
          ),
        ].sort(
          (a, b) =>
            b.fecha.localeCompare(a.fecha) ||
            b.id_registro - a.id_registro
        ),
      };
    });
  }

  back() {
    void this.router.navigate(['/horas']);
  }
}
