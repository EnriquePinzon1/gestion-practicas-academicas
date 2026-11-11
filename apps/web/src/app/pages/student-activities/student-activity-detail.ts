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

export const MAX_RESPUESTA = 10000;

@Component({
  selector: 'app-student-activity-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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

  back() {
    this.router.navigate(['/mis-actividades']);
  }
}
