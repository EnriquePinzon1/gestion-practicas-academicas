import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  AccionEstado,
  Asignacion,
  ETIQUETAS_ESTADO,
  EstudianteDisponible,
  TutorDisponible,
  accionesDisponibles,
  formatearFecha,
  nombreEstudiante,
  nombreTutor,
} from './assignment.model';

@Component({
  selector: 'app-assignment-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './assignment-detail.html',
  styleUrl: './assignment-detail.scss',
})
export class AssignmentDetail
  implements OnInit
{
  asignacion = signal<Asignacion | null>(
    null
  );

  estudiantes = signal(
    new Map<number, EstudianteDisponible>()
  );

  tutores = signal(
    new Map<number, TutorDisponible>()
  );

  loading = signal(false);
  updating = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly formatearFecha = formatearFecha;

  acciones = computed<AccionEstado[]>(() => {
    const asignacion = this.asignacion();

    return asignacion
      ? accionesDisponibles(asignacion.estado)
      : [];
  });

  estudiante = computed(() => {
    const asignacion = this.asignacion();

    return asignacion
      ? this.estudiantes().get(
          asignacion.id_estudiante
        ) ?? null
      : null;
  });

  nombreEstudiante = computed(() => {
    const asignacion = this.asignacion();

    return asignacion
      ? nombreEstudiante(
          asignacion.id_estudiante,
          this.estudiantes()
        )
      : '';
  });

  nombreTutor = computed(() => {
    const asignacion = this.asignacion();

    return asignacion
      ? nombreTutor(
          asignacion.id_tutor,
          this.tutores()
        )
      : '';
  });

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    const id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (!Number.isInteger(id) || id <= 0) {
      this.errorMessage.set(
        'Asignación de práctica no válida.'
      );
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [
        assignmentResponse,
        studentsResponse,
        tutorsResponse,
      ] = await Promise.all([
        this.api.get<{
          data: Asignacion;
        }>('/practice-assignments/' + id),

        this.api.get<{
          data: EstudianteDisponible[];
        }>(
          '/practice-assignment-options/students'
        ),

        this.api.get<{
          data: TutorDisponible[];
        }>(
          '/practice-assignment-options/tutors'
        ),
      ]);

      this.asignacion.set(
        assignmentResponse.data
      );

      this.estudiantes.set(
        new Map(
          studentsResponse.data.map(
            (e) => [e.id_estudiante, e]
          )
        )
      );

      this.tutores.set(
        new Map(
          tutorsResponse.data.map(
            (t) => [t.id_tutor, t]
          )
        )
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar la asignación de práctica.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async changeStatus(accion: AccionEstado) {
    const asignacion = this.asignacion();

    if (!asignacion) {
      return;
    }

    if (!window.confirm(accion.confirmacion)) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.updating.set(true);

    try {
      const response =
        await this.api.patch<{
          message: string;
        }>(
          '/practice-assignments/' +
            asignacion.id_asignacion +
            '/status',
          {
            estado: accion.estado,
          }
        );

      this.successMessage.set(
        response.message ??
          'Estado de la asignación actualizado correctamente.'
      );

      await this.loadData();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible actualizar el estado de la asignación.'
      );
    } finally {
      this.updating.set(false);
    }
  }

  back() {
    this.router.navigate([
      '/asignaciones',
    ]);
  }
}
