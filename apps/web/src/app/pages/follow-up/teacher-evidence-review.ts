import {
  Component,
  OnInit,
  computed,
  input,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ApiService } from
  '../../core/services/api.service';

import { formatearTamano } from
  '../student-activities/evidence.model';

import {
  MAX_TEXTO_REVISION,
  TeacherEvidence,
  TeacherEvidencesResponse,
} from './teacher-review.model';

type EvidenceFilter = 'TODAS' | 'PENDIENTES' | 'REVISADAS';

// Revisión de evidencias del estudiante por el Docente
// Asesor (CU7, BS2): ver el archivo, dejar una observación
// opcional y finalizar la revisión. Solo con la entrega
// definitiva (actividad cerrada o plazo vencido).
@Component({
  selector: 'app-teacher-evidence-review',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './teacher-evidence-review.html',
  styleUrls: [
    './follow-up.scss',
    '../tutor/tutor-observations.scss',
    './teacher-evidence-review.scss',
  ],
})
export class TeacherEvidenceReview implements OnInit {

  idGrupo = input.required<number>();
  idEstudiante = input.required<number>();

  evidences = signal<TeacherEvidence[]>([]);
  filter = signal<EvidenceFilter>('TODAS');

  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // Evidencia con el formulario de revisión abierto
  reviewingId = signal<number | null>(null);
  observacionInput = signal('');
  saving = signal(false);
  downloadingId = signal<number | null>(null);

  readonly maxLength = MAX_TEXTO_REVISION;
  readonly tamano = formatearTamano;

  readonly counts = computed(() => {
    const list = this.evidences();
    const revisadas = list.filter((e) => e.revisada).length;

    return {
      total: list.length,
      revisadas,
      pendientes: list.length - revisadas,
    };
  });

  // Evidencias filtradas, agrupadas por actividad
  readonly groups = computed(() => {
    const filter = this.filter();
    const groups: {
      id_actividad: number;
      titulo: string;
      items: TeacherEvidence[];
    }[] = [];

    for (const ev of this.evidences()) {
      if (
        (filter === 'PENDIENTES' && ev.revisada) ||
        (filter === 'REVISADAS' && !ev.revisada)
      ) {
        continue;
      }

      let group = groups.find((g) => g.id_actividad === ev.id_actividad);

      if (!group) {
        group = { id_actividad: ev.id_actividad, titulo: ev.titulo, items: [] };
        groups.push(group);
      }

      group.items.push(ev);
    }

    return groups;
  });

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<TeacherEvidencesResponse>(
        `/teacher/follow-up/groups/${this.idGrupo()}` +
          `/students/${this.idEstudiante()}/evidences`
      );

      this.evidences.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las evidencias.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(filter: EvidenceFilter) {
    this.filter.set(filter);
    this.cancelReview();
  }

  async download(ev: TeacherEvidence) {
    this.errorMessage.set('');
    this.downloadingId.set(ev.id_evidencia);

    try {
      const response = await this.api.get<{ data: { url: string } }>(
        `/activities/${ev.id_actividad}/evidences/${ev.id_evidencia}/url`
      );

      window.location.assign(response.data.url);
    } catch (error) {
      // BS2-E1: el archivo no está disponible
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible abrir la evidencia.'
      );
    } finally {
      this.downloadingId.set(null);
    }
  }

  startReview(ev: TeacherEvidence) {
    this.reviewingId.set(ev.id_evidencia);
    this.observacionInput.set(ev.observacion_revision ?? '');
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  cancelReview() {
    this.reviewingId.set(null);
    this.observacionInput.set('');
  }

  async saveReview(ev: TeacherEvidence) {
    const observacion = this.observacionInput().trim();

    if (observacion.length > this.maxLength) {
      this.errorMessage.set(
        `La observación no puede superar ${this.maxLength} caracteres.`
      );
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const response = await this.api.put<{
        message: string;
        data: {
          revisada: boolean;
          observacion_revision: string | null;
          revisada_en: string;
        };
      }>(`/teacher/evidences/${ev.id_evidencia}/review`, { observacion });

      this.evidences.update((list) =>
        list.map((item) =>
          item.id_evidencia === ev.id_evidencia
            ? {
                ...item,
                revisada: true,
                observacion_revision: response.data.observacion_revision,
                revisada_en: response.data.revisada_en,
              }
            : item
        )
      );

      this.cancelReview();
      this.successMessage.set(response.message);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible registrar la revisión.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
