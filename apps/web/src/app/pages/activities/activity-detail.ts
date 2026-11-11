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

import { DatePipe } from '@angular/common';

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

// Una fila por estudiante del snapshot actividad_estudiante
interface Submission {
  id_actividad_estudiante: number;
  id_estudiante: number;
  estado_entrega: 'PENDIENTE' | 'ENTREGADA';
  id_entrega: number | null;
  entregado_en: string | null;
  entrega_actualizada_en: string | null;
  nombres: string | null;
  apellidos: string | null;
  codigo_estudiante: string | null;
  respuestas: {
    id_pregunta: number;
    contenido: string;
  }[];
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
    DatePipe,
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

  submissions = signal<Submission[]>([]);

  expandedId = signal<number | null>(null);

  // Entregas según el snapshot actividad_estudiante
  // (estudiantes del grupo al publicar la actividad).
  // Los integrantes del grupo solo completan el nombre
  // si User Service no lo devolvió (estudiante inactivo).
  deliveries = computed(() => {
    const members = new Map(
      (this.group()?.integrantes ?? []).map(
        (m) => [Number(m.id_estudiante), m]
      )
    );

    return this.submissions().map((s) => {
      const member = members.get(
        Number(s.id_estudiante)
      );

      return {
        ...s,
        nombres: s.nombres ?? member?.nombres,
        apellidos: s.apellidos ?? member?.apellidos,
        codigo_estudiante:
          s.codigo_estudiante ??
          member?.codigo_estudiante,
        correo: member?.correo,
        estadoEntrega: s.estado_entrega,
      };
    });
  });

  totalEntregadas = computed(
    () =>
      this.submissions().filter(
        (s) => s.estado_entrega === 'ENTREGADA'
      ).length
  );

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

      const submissionsResponse =
        await this.api.get<{
          data: {
            estudiantes: Submission[];
          };
        }>(
          `/activities/${idActividad}/submissions`
        );

      this.submissions.set(
        submissionsResponse.data.estudiantes
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

  toggleAnswers(id: number) {
    this.expandedId.set(
      this.expandedId() === id ? null : id
    );
  }

  answerFor(
    respuestas: Submission['respuestas'],
    idPregunta: number
  ): string {
    return (
      respuestas.find(
        (r) => r.id_pregunta === idPregunta
      )?.contenido ?? 'Sin respuesta'
    );
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
