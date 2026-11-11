import {
  Component,
  OnInit,
  input,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ApiService } from
  '../../core/services/api.service';

import {
  MAX_OBSERVACION,
  TutorObservation,
  TutorObservationsResponse,
} from './tutor.model';

// Bitácora de observaciones del Tutor Receptor sobre un
// practicante. Se registran y corrigen solo mientras la
// asignación está EN_CURSO; después queda en solo lectura.
@Component({
  selector: 'app-tutor-observations',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
  ],
  templateUrl: './tutor-observations.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    './tutor-observations.scss',
  ],
})
export class TutorObservations implements OnInit {

  idAsignacion = input.required<number>();

  observations = signal<TutorObservation[]>([]);
  canRegister = signal(false);
  minDate = signal<string | null>(null);
  maxDate = signal('');

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // null = nueva observación; id = corrección.
  editingId = signal<number | null>(null);
  fechaInput = signal('');
  descripcionInput = signal('');

  readonly maxLength = MAX_OBSERVACION;

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    void this.load();
  }

  private basePath() {
    return `/tutor/assignments/${this.idAsignacion()}/observations`;
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response =
        await this.api.get<TutorObservationsResponse>(
          this.basePath()
        );

      this.observations.set(response.data);
      this.canRegister.set(response.puede_registrar);
      this.minDate.set(response.fecha_minima);
      this.maxDate.set(response.fecha_maxima);
      this.resetForm();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las observaciones.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  resetForm() {
    this.editingId.set(null);
    this.fechaInput.set(this.maxDate());
    this.descripcionInput.set('');
  }

  edit(observation: TutorObservation) {
    this.editingId.set(observation.id_observacion);
    this.fechaInput.set(observation.fecha);
    this.descripcionInput.set(observation.descripcion);
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  async save() {
    const fecha = this.fechaInput().trim();
    const descripcion = this.descripcionInput().trim();

    this.successMessage.set('');

    if (!fecha) {
      this.errorMessage.set('Seleccione la fecha de la observación.');
      return;
    }

    if (fecha > this.maxDate()) {
      this.errorMessage.set('La fecha no puede ser futura.');
      return;
    }

    const min = this.minDate();

    if (min && fecha < min) {
      this.errorMessage.set(
        'La fecha no puede ser anterior al inicio de la práctica.'
      );
      return;
    }

    if (!descripcion) {
      this.errorMessage.set('Escriba la observación.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const editingId = this.editingId();

    try {
      const body = { fecha, descripcion };

      const response = editingId
        ? await this.api.put<{ message: string; data: TutorObservation }>(
            `${this.basePath()}/${editingId}`,
            body
          )
        : await this.api.post<{ message: string; data: TutorObservation }>(
            this.basePath(),
            body
          );

      // Reordenar igual que el backend: fecha desc, id desc.
      this.observations.update((list) =>
        [
          response.data,
          ...list.filter(
            (o) => o.id_observacion !== response.data.id_observacion
          ),
        ].sort(
          (a, b) =>
            b.fecha.localeCompare(a.fecha) ||
            b.id_observacion - a.id_observacion
        )
      );

      this.resetForm();
      this.successMessage.set(response.message);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la observación.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  wasEdited(observation: TutorObservation): boolean {
    return observation.actualizado_en !== observation.creado_en;
  }
}
