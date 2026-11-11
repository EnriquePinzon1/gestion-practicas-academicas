import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  AccionEstado,
  Asignacion,
  ETIQUETAS_ESTADO,
  EstadoAsignacion,
  EstudianteDisponible,
  TutorDisponible,
  accionesDisponibles,
  formatearFecha,
  nombreEstudiante,
  nombreTutor,
} from './assignment.model';

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './assignments.html',
  styleUrl: './assignments.scss',
})
export class Assignments {
  asignaciones = signal<Asignacion[]>([]);

  estudiantes = signal(
    new Map<number, EstudianteDisponible>()
  );

  tutores = signal(
    new Map<number, TutorDisponible>()
  );

  loading = signal(false);
  updatingId = signal<number | null>(null);

  errorMessage = signal('');
  successMessage = signal('');

  search = signal('');
  periodFilter = signal('');
  statusFilter = signal('');

  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly formatearFecha = formatearFecha;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    this.loadData();
  }

  periodos = computed(() =>
    [
      ...new Set(
        this.asignaciones().map(
          (a) => a.periodo_academico
        )
      ),
    ].sort().reverse()
  );

  filteredAssignments = computed(() => {
    const search =
      this.search().trim().toLowerCase();

    const period = this.periodFilter();
    const status = this.statusFilter();

    return this.asignaciones().filter(
      (asignacion) => {
        const texto = [
          this.estudiante(asignacion),
          asignacion.practica,
          asignacion.institucion,
          this.tutor(asignacion),
        ]
          .join(' ')
          .toLowerCase();

        return (
          (!search ||
            texto.includes(search)) &&
          (!period ||
            asignacion.periodo_academico ===
              period) &&
          (!status ||
            asignacion.estado === status)
        );
      }
    );
  });

  async loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [
        assignmentsResponse,
        studentsResponse,
        tutorsResponse,
      ] = await Promise.all([
        this.api.get<{
          data: Asignacion[];
        }>('/practice-assignments'),

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

      this.asignaciones.set(
        assignmentsResponse.data
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
          : 'No fue posible consultar las asignaciones de práctica.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  estudiante(asignacion: Asignacion) {
    return nombreEstudiante(
      asignacion.id_estudiante,
      this.estudiantes()
    );
  }

  tutor(asignacion: Asignacion) {
    return nombreTutor(
      asignacion.id_tutor,
      this.tutores()
    );
  }

  acciones(
    estado: EstadoAsignacion
  ): AccionEstado[] {
    return accionesDisponibles(estado);
  }

  clearFilters() {
    this.search.set('');
    this.periodFilter.set('');
    this.statusFilter.set('');
  }

  newAssignment() {
    this.router.navigate([
      '/asignaciones/nueva',
    ]);
  }

  viewAssignment(
    asignacion: Asignacion
  ) {
    this.router.navigate([
      '/asignaciones',
      asignacion.id_asignacion,
    ]);
  }

  async changeStatus(
    asignacion: Asignacion,
    accion: AccionEstado
  ) {
    const confirmed = window.confirm(
      accion.confirmacion +
        '\n\n' +
        this.estudiante(asignacion) +
        ' · ' +
        asignacion.practica +
        ' · ' +
        asignacion.periodo_academico
    );

    if (!confirmed) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.updatingId.set(
      asignacion.id_asignacion
    );

    try {
      await this.api.patch(
        '/practice-assignments/' +
          asignacion.id_asignacion +
          '/status',
        {
          estado: accion.estado,
        }
      );

      this.successMessage.set(
        'La asignación de ' +
          this.estudiante(asignacion) +
          ' quedó en estado ' +
          this.etiquetas[accion.estado] +
          '.'
      );

      await this.loadData();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible actualizar el estado de la asignación.'
      );
    } finally {
      this.updatingId.set(null);
    }
  }
}
