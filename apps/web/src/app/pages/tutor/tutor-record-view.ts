import {
  Component,
  OnInit,
  input,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';

import { ApiService } from
  '../../core/services/api.service';

import { TutorRecord } from './tutor.model';

// Bitácora y evaluación final del Tutor Receptor en solo
// lectura. Compartido por el Coordinador (detalle de la
// asignación) y el Docente Asesor (historial del estudiante).
// Carga el registro desde el endpoint que recibe.
@Component({
  selector: 'app-tutor-record-view',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './tutor-record-view.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    './tutor-observations.scss',
    './tutor-evaluation.scss',
  ],
})
export class TutorRecordView implements OnInit {

  endpoint = input.required<string>();

  // El docente necesita ver a qué asignación corresponde.
  showAssignment = input(false);

  record = signal<TutorRecord | null>(null);
  loaded = signal(false);
  errorMessage = signal('');

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: TutorRecord | null;
      }>(this.endpoint());

      this.record.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el registro del tutor.'
      );
    } finally {
      this.loaded.set(true);
    }
  }

  tutorName(record: TutorRecord): string {
    const tutor = record.tutor;

    if (!tutor) {
      return 'Sin tutor asignado';
    }

    const name = [tutor.nombres, tutor.apellidos]
      .filter(Boolean)
      .join(' ');

    return name || `Tutor #${tutor.id_tutor} (inactivo)`;
  }

  wasEdited(item: { creado_en: string; actualizado_en: string }) {
    return item.actualizado_en !== item.creado_en;
  }
}
