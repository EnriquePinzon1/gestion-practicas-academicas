import {
  Component,
  computed,
  signal,
} from '@angular/core';

import {
  ActivatedRoute,
  Router,
} from '@angular/router';

import { FormsModule } from '@angular/forms';

import { ApiService } from
  '../../core/services/api.service';

interface Question {
  id_pregunta: number;
  enunciado: string;
  orden: number;
}

interface Activity {
  id_actividad: number;
  id_grupo: number;
  id_docente: number;
  titulo: string;
  descripcion: string;
  fecha_limite: string;
  hora_limite: string;
  estado: string;
  creado_en: string;
  actualizado_en: string;
  preguntas: Question[];
}

interface Student {
  id_estudiante: number;
  id_usuario?: number;
  nombres?: string;
  apellidos?: string;
  correo?: string;
  codigo_estudiante?: string;
}

interface GroupDetail {
  id_grupo: number;
  nombre: string;
  practica: string;
  semestre: number | null;
  id_docente: number;
  estado: string;
  integrantes: Student[];
}

@Component({
  selector: 'app-activity-detail',
  standalone: true,
  imports: [
    FormsModule,
  ],
  templateUrl: './activity-detail.html',
  styleUrl: './activity-detail.scss',
})
export class ActivityDetail {

  activity = signal<Activity | null>(
    null
  );

  group = signal<GroupDetail | null>(
    null
  );

  loading = signal(false);
  closing = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  deliveryFilter =
    signal<'TODOS' | 'ENTREGADA' | 'PENDIENTE'>(
      'TODOS'
    );

  // CU05 todavía no registra entregas.
  // Mientras no exista una entrega, el
  // estudiante aparece como PENDIENTE.
  deliveries = computed(() => {
    const students =
      this.group()?.integrantes ?? [];

    return students.map(
      (student) => ({
        ...student,
        estadoEntrega:
          'PENDIENTE' as const,
      })
    );
  });

  filteredDeliveries =
    computed(() => {
      const filter =
        this.deliveryFilter();

      if (filter === 'TODOS') {
        return this.deliveries();
      }

      return this.deliveries().filter(
        (delivery) =>
          delivery.estadoEntrega ===
          filter
      );
    });

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    void this.loadActivity();
  }

  async loadActivity() {
    this.loading.set(true);
    this.errorMessage.set('');

    const idActividad = Number(
      this.route.snapshot.paramMap.get(
        'id'
      )
    );

    if (
      !Number.isInteger(idActividad) ||
      idActividad <= 0
    ) {
      this.errorMessage.set(
        'El identificador de la actividad no es válido.'
      );

      this.loading.set(false);
      return;
    }

    try {
      const activityResponse =
        await this.api.get<{
          data: Activity;
        }>(
          `/activities/${idActividad}`
        );

      this.activity.set(
        activityResponse.data
      );

      const groupResponse =
        await this.api.get<{
          data: GroupDetail;
        }>(
          `/teacher/groups/${activityResponse.data.id_grupo}`
        );

      this.group.set(
        groupResponse.data
      );

    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar la actividad.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  editActivity() {
    const current =
      this.activity();

    if (
      !current ||
      current.estado === 'CERRADA'
    ) {
      return;
    }

    void this.router.navigate([
      '/actividades',
      current.id_actividad,
      'editar',
    ]);
  }

  async closeActivity() {
    const current =
      this.activity();

    if (
      !current ||
      current.estado === 'CERRADA'
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        'Al cerrar la actividad los estudiantes no podrán realizar nuevas entregas. ¿Desea continuar?'
      );

    if (!confirmed) {
      return;
    }

    this.closing.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const response =
        await this.api.patch<{
          data: {
            id_actividad: number;
            titulo: string;
            estado: string;
          };
          message: string;
        }>(
          `/activities/${current.id_actividad}/status`,
          {}
        );

      this.activity.update(
        (activity) =>
          activity
            ? {
                ...activity,
                estado:
                  response.data.estado,
              }
            : activity
      );

      this.successMessage.set(
        response.message ??
          'Actividad cerrada correctamente.'
      );

    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cerrar la actividad.'
      );
    } finally {
      this.closing.set(false);
    }
  }

  back() {
    void this.router.navigate([
      '/actividades',
    ]);
  }

  formatDate(
    value: string
  ): string {
    return value
      ? value.substring(0, 10)
      : '-';
  }

  formatTime(
    value: string
  ): string {
    return value
      ? value.substring(0, 5)
      : '-';
  }

  studentName(
    student: Student
  ): string {
    const name =
      `${student.nombres ?? ''} ${student.apellidos ?? ''}`
        .trim();

    return (
      name ||
      student.codigo_estudiante ||
      `Estudiante ${student.id_estudiante}`
    );
  }
}
