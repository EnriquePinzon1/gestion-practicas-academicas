import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  ActividadEstudianteDetalle,
  ETIQUETAS_ESTADO_VISIBLE,
  estadoVisible,
  formatearFechaLimite,
} from './student-activity.model';
import { EvidenceList } from './evidence-list';
import {
  EVIDENCIA_ACCEPT,
  EVIDENCIA_FORMATOS,
  Evidencia,
  MAX_EVIDENCIAS,
  MAX_EVIDENCIA_BYTES,
} from './evidence.model';

export const MAX_RESPUESTA = 10000;

@Component({
  selector: 'app-student-activity-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EvidenceList,
  ],
  templateUrl: './student-activity-detail.html',
  styleUrl: './student-activity-detail.scss',
})
export class StudentActivityDetail
  implements OnInit
{
  id = 0;

  actividad =
    signal<ActividadEstudianteDetalle | null>(
      null
    );

  // Borrador de respuestas por id_pregunta
  respuestas: Record<number, string> = {};

  loading = signal(false);
  saving = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  readonly etiquetas = ETIQUETAS_ESTADO_VISIBLE;
  readonly maxRespuesta = MAX_RESPUESTA;

  // Evidencias
  uploading = signal(false);
  busyEvidence = signal<number | null>(null);

  readonly evidenceAccept = EVIDENCIA_ACCEPT;
  readonly evidenceFormats = EVIDENCIA_FORMATOS;
  readonly maxEvidencias = MAX_EVIDENCIAS;

  canAddEvidence = computed(() => {
    const a = this.actividad();

    return (
      !!a?.puede_entregar &&
      !!a.id_entrega &&
      a.evidencias.length < MAX_EVIDENCIAS
    );
  });

  estado = computed(() => {
    const a = this.actividad();

    return a ? estadoVisible(a) : null;
  });

  fechaLimite = computed(() => {
    const a = this.actividad();

    return a
      ? formatearFechaLimite(
          a.fecha_limite,
          a.hora_limite
        )
      : '';
  });

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (!Number.isInteger(this.id) || this.id <= 0) {
      this.errorMessage.set('Actividad no válida.');
      return;
    }

    this.loadData();
  }

  // keepDrafts: conserva lo que el estudiante escribió
  // (se usa tras un error para no perder su trabajo).
  async loadData(keepDrafts = false) {
    this.loading.set(true);

    try {
      const response =
        await this.api.get<{
          data: ActividadEstudianteDetalle;
        }>('/student/activities/' + this.id);

      this.actividad.set(response.data);

      const drafts = this.respuestas;

      this.respuestas = Object.fromEntries(
        response.data.preguntas.map((p) => [
          p.id_pregunta,
          keepDrafts && drafts[p.id_pregunta] !== undefined
            ? drafts[p.id_pregunta]
            : p.respuesta ?? '',
        ])
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar la actividad.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    const actividad = this.actividad();

    if (!actividad?.puede_entregar) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');

    const sinResponder = actividad.preguntas.filter(
      (p) => !this.respuestas[p.id_pregunta]?.trim()
    );

    if (sinResponder.length > 0) {
      this.errorMessage.set(
        'Responde todas las preguntas antes de entregar. Falta: pregunta ' +
          sinResponder.map((p) => p.orden).join(', ') +
          '.'
      );
      return;
    }

    this.saving.set(true);

    try {
      const response =
        await this.api.put<{
          message: string;
        }>(
          '/student/activities/' +
            this.id +
            '/submission',
          {
            respuestas: actividad.preguntas.map(
              (p) => ({
                id_pregunta: p.id_pregunta,
                contenido:
                  this.respuestas[p.id_pregunta],
              })
            ),
          }
        );

      // Se recarga antes de avisar: las respuestas quedan
      // sincronizadas con lo guardado y los campos siguen
      // bloqueados (saving) hasta terminar.
      await this.loadData();

      this.successMessage.set(response.message);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible registrar la entrega.'
      );

      // El plazo o el estado pudieron cambiar; se
      // refresca sin perder las respuestas escritas.
      await this.loadData(true);
    } finally {
      this.saving.set(false);
    }
  }

  async uploadEvidence(event: Event) {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];

    // Permite volver a elegir el mismo archivo
    inputEl.value = '';

    if (!file || !this.canAddEvidence()) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');

    if (file.size === 0) {
      this.errorMessage.set('El archivo está vacío.');
      return;
    }

    if (file.size > MAX_EVIDENCIA_BYTES) {
      this.errorMessage.set(
        'El archivo supera el tamaño máximo de 10 MB.'
      );
      return;
    }

    this.uploading.set(true);

    try {
      const response = await this.api.upload<{
        message: string;
      }>(
        '/student/activities/' + this.id + '/evidences',
        file
      );

      await this.loadData(true);

      this.successMessage.set(response.message);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible adjuntar la evidencia.'
      );

      await this.loadData(true);
    } finally {
      this.uploading.set(false);
    }
  }

  async removeEvidence(ev: Evidencia) {
    if (
      !window.confirm(
        '¿Eliminar la evidencia "' +
          ev.nombre_archivo +
          '"? Esta acción no se puede deshacer.'
      )
    ) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.busyEvidence.set(ev.id_evidencia);

    try {
      const response = await this.api.delete<{
        message: string;
      }>(
        '/student/activities/' +
          this.id +
          '/evidences/' +
          ev.id_evidencia
      );

      await this.loadData(true);

      this.successMessage.set(response.message);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar la evidencia.'
      );

      await this.loadData(true);
    } finally {
      this.busyEvidence.set(null);
    }
  }

  // La URL firmada caduca en pocos minutos; se pide en el
  // momento de descargar y el navegador la abre como
  // adjunto (no navega fuera de la aplicación).
  async downloadEvidence(ev: Evidencia) {
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: { url: string };
      }>('/student/evidences/' + ev.id_evidencia + '/url');

      window.location.assign(response.data.url);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible descargar la evidencia.'
      );
    }
  }

  back() {
    this.router.navigate(['/mis-actividades']);
  }
}
