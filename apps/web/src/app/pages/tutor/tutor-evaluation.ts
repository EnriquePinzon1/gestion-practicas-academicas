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
  TutorEvaluation as Evaluation,
  TutorEvaluationResponse,
} from './tutor.model';

// Evaluación final del Tutor Receptor sobre el practicante.
// Se registra y corrige mientras la asignación está EN_CURSO;
// después queda en solo lectura. Es requisito para que el
// coordinador finalice la práctica.
@Component({
  selector: 'app-tutor-evaluation',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
  ],
  templateUrl: './tutor-evaluation.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    './tutor-observations.scss',
    './tutor-evaluation.scss',
  ],
})
export class TutorEvaluation implements OnInit {

  idAsignacion = input.required<number>();

  evaluation = signal<Evaluation | null>(null);
  canEvaluate = signal(false);

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  gradeInput = signal('');
  conceptoInput = signal('');
  // null = aún no elegido.
  recommendInput = signal<boolean | null>(null);

  readonly maxLength = MAX_OBSERVACION;

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    void this.load();
  }

  private path() {
    return `/tutor/assignments/${this.idAsignacion()}/evaluation`;
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response =
        await this.api.get<TutorEvaluationResponse>(this.path());

      this.evaluation.set(response.data);
      this.canEvaluate.set(response.puede_evaluar);
      this.fillForm(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar la evaluación.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  private fillForm(evaluation: Evaluation | null) {
    this.gradeInput.set(
      evaluation ? evaluation.calificacion.toFixed(1) : ''
    );
    this.conceptoInput.set(evaluation?.concepto ?? '');
    this.recommendInput.set(
      evaluation?.recomienda_aprobacion ?? null
    );
  }

  async save() {
    const raw = this.gradeInput().trim().replace(',', '.');
    const calificacion = Number(raw);
    const concepto = this.conceptoInput().trim();
    const recomienda = this.recommendInput();

    this.successMessage.set('');

    if (
      !/^\d(\.\d)?$/.test(raw) ||
      calificacion < 0 ||
      calificacion > 5
    ) {
      this.errorMessage.set(
        'La calificación debe estar entre 0.0 y 5.0 con máximo un decimal.'
      );
      return;
    }

    if (!concepto) {
      this.errorMessage.set('Escriba el concepto sobre el practicante.');
      return;
    }

    if (recomienda === null) {
      this.errorMessage.set(
        'Indique si recomienda aprobar la práctica.'
      );
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.put<{
        message: string;
        data: Evaluation;
      }>(this.path(), {
        calificacion,
        concepto,
        recomienda_aprobacion: recomienda,
      });

      this.evaluation.set(response.data);
      this.fillForm(response.data);
      this.successMessage.set(response.message);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la evaluación.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
