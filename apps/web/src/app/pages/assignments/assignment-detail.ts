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
  accionesDisponibles,
  estudianteInactivo,
  formatearFecha,
  nombreEstudiante,
  nombreTutor,
  tutorInactivo,
} from './assignment.model';
import { TutorRecordView } from '../tutor/tutor-record-view';

@Component({
  selector: 'app-assignment-detail',
  standalone: true,
  imports: [CommonModule, TutorRecordView],
  templateUrl: './assignment-detail.html',
  styleUrl: './assignment-detail.scss',
})
export class AssignmentDetail
  implements OnInit
{
  asignacion = signal<Asignacion | null>(
    null
  );

  loading = signal(false);
  updating = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly formatearFecha = formatearFecha;
  readonly estudianteInactivo = estudianteInactivo;
  readonly tutorInactivo = tutorInactivo;

  acciones = computed<AccionEstado[]>(() => {
    const asignacion = this.asignacion();

    return asignacion
      ? accionesDisponibles(asignacion.estado)
      : [];
  });

  estudiante = computed(
    () => this.asignacion()?.estudiante ?? null
  );

  nombreEstudiante = computed(() => {
    const asignacion = this.asignacion();

    return asignacion ? nombreEstudiante(asignacion) : '';
  });

  nombreTutor = computed(() => {
    const asignacion = this.asignacion();

    return asignacion ? nombreTutor(asignacion) : '';
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
      // Estudiante y tutor vienen resueltos por el
      // Gateway (incluye usuarios inactivos).
      const response = await this.api.get<{
        data: Asignacion;
      }>('/practice-assignments/' + id);

      this.asignacion.set(response.data);
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
