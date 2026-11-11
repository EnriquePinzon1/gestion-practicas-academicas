import {
  Component,
  computed,
  signal,
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import {
  ActivatedRoute,
  Router,
} from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

interface TeacherGroup {
  id_grupo: number;
  nombre: string;
  semestre: number | null;
  estado: string;
  id_docente: number;
  id_practica: number;
  practica: string;
  periodo_academico: string;
  total_estudiantes: number;
}

interface ActivityQuestion {
  id_pregunta: number;
  enunciado: string;
  orden: number;
}

interface ActivityDetail {
  id_actividad: number;
  id_grupo: number;
  id_docente: number;
  titulo: string;
  descripcion: string;
  fecha_limite: string;
  hora_limite: string;
  estado: string;
  preguntas: ActivityQuestion[];
}

interface SavedActivity {
  id_actividad: number;
  titulo: string;
}

@Component({
  selector: 'app-activity-form',
  standalone: true,
  imports: [
    FormsModule,
  ],
  templateUrl: './activity-form.html',
  styleUrl: './activity-form.scss',
})
export class ActivityForm {

  groups = signal<TeacherGroup[]>([]);

  loading = signal(false);
  saving = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  activityId =
    signal<number | null>(null);

  activityState =
    signal<string>('ABIERTA');

  removingQuestionIndex = signal<number | null>(null);

  isEditMode = computed(
    () => this.activityId() !== null
  );

  selectedGroupId:
    number | null = null;

  title = '';
  description = '';
  deadlineDate = '';
  deadlineTime = '';

  questions = signal<string[]>([
    '',
  ]);

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {
    void this.initialize();
  }

  private async initialize() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await this.loadGroups();

      const idParam =
        this.route.snapshot
          .paramMap
          .get('id');

      const idActividad =
        idParam
          ? Number(idParam)
          : null;

      if (
        idActividad !== null &&
        Number.isInteger(idActividad) &&
        idActividad > 0
      ) {
        this.activityId.set(
          idActividad
        );

        await this.loadActivity(
          idActividad
        );

        return;
      }

      this.applyGroupFromQuery();

    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el formulario.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  private async loadGroups() {
    const response =
      await this.api.get<{
        data: TeacherGroup[];
      }>('/teacher/groups');

    this.groups.set(
      response.data ?? []
    );
  }

  private applyGroupFromQuery() {
    const activeGroups =
      this.groups().filter(
        (group) =>
          group.estado === 'ACTIVO'
      );

    const queryGroupId =
      Number(
        this.route.snapshot
          .queryParamMap
          .get('groupId')
      );

    if (
      Number.isInteger(queryGroupId) &&
      activeGroups.some(
        (group) =>
          group.id_grupo ===
          queryGroupId
      )
    ) {
      this.selectedGroupId =
        queryGroupId;

      return;
    }

    if (
      activeGroups.length === 1
    ) {
      this.selectedGroupId =
        activeGroups[0].id_grupo;
    }
  }

  private async loadActivity(
    idActividad: number
  ) {
    const response =
      await this.api.get<{
        data: ActivityDetail;
      }>(
        `/activities/${idActividad}`
      );

    const activity =
      response.data;

    this.activityState.set(
      activity.estado
    );

    this.selectedGroupId =
      activity.id_grupo;

    this.title =
      activity.titulo;

    this.description =
      activity.descripcion;

    this.deadlineDate =
      activity.fecha_limite
        .substring(0, 10);

    this.deadlineTime =
      activity.hora_limite
        .substring(0, 5);

    this.questions.set(
      activity.preguntas
        .sort(
          (a, b) =>
            a.orden - b.orden
        )
        .map(
          (question) =>
            question.enunciado
        )
    );

    if (
      activity.estado ===
      'CERRADA'
    ) {
      this.errorMessage.set(
        'No es posible modificar una actividad cerrada.'
      );
    }
  }

  availableGroups =
    computed(() => {
      if (this.isEditMode()) {
        return this.groups();
      }

      return this.groups().filter(
        (group) =>
          group.estado === 'ACTIVO'
      );
    });

  addQuestion() {
    this.questions.update(
      (questions) => [
        ...questions,
        '',
      ]
    );
  }

  updateQuestion(
    index: number,
    value: string
  ) {
    const updated = [
      ...this.questions(),
    ];

    updated[index] = value;

    this.questions.set(
      updated
    );
  }

  removeQuestion(
  index: number
) {
  if (
    this.questions().length === 1
  ) {
    this.errorMessage.set(
      'La actividad debe contener al menos una pregunta.'
    );

    return;
  }

  if (
    this.removingQuestionIndex()
      !== null
  ) {
    return;
  }

  this.removingQuestionIndex.set(
    index
  );

  window.setTimeout(
    () => {

      this.questions.update(
        (questions) =>
          questions.filter(
            (_, currentIndex) =>
              currentIndex !== index
          )
      );

      this.removingQuestionIndex.set(
        null
      );

    },
    160
  );
}

  private validateForm():
    string | null {

    if (
      this.activityState() ===
      'CERRADA'
    ) {
      return 'No es posible modificar una actividad cerrada.';
    }

    if (
      !this.selectedGroupId
    ) {
      return 'Debe seleccionar un grupo.';
    }

    if (!this.title.trim()) {
      return 'El título es obligatorio.';
    }

    if (
      !this.description.trim()
    ) {
      return 'La descripción es obligatoria.';
    }

    if (
      !this.deadlineDate ||
      !this.deadlineTime
    ) {
      return 'Debe seleccionar fecha y hora límite.';
    }

    const validQuestions =
      this.questions()
        .map(
          (question) =>
            question.trim()
        )
        .filter(Boolean);

    if (
      validQuestions.length === 0
    ) {
      return 'La actividad debe contener al menos una pregunta.';
    }

    if (
      validQuestions.length !==
      this.questions().length
    ) {
      return 'No puede dejar preguntas vacías.';
    }

    const normalized =
      validQuestions.map(
        (question) =>
          question.toLowerCase()
      );

    if (
      new Set(normalized).size !==
      normalized.length
    ) {
      return 'No puede registrar preguntas duplicadas.';
    }

    const deadline =
      new Date(
        `${this.deadlineDate}T${this.deadlineTime}:00`
      );

    if (
      Number.isNaN(
        deadline.getTime()
      )
    ) {
      return 'La fecha límite no es válida.';
    }

    if (
      deadline.getTime() <=
      Date.now()
    ) {
      return 'La fecha y hora límite deben ser posteriores al momento actual.';
    }

    return null;
  }

  async save() {
    this.errorMessage.set('');
    this.successMessage.set('');

    const validation =
      this.validateForm();

    if (validation) {
      this.errorMessage.set(
        validation
      );

      return;
    }

    this.saving.set(true);

    const body = {
      titulo:
        this.title.trim(),

      descripcion:
        this.description.trim(),

      fecha_limite:
        this.deadlineDate,

      hora_limite:
        this.deadlineTime,

      preguntas:
        this.questions().map(
          (question) =>
            question.trim()
        ),
    };

    try {
      const idActividad =
        this.activityId();

      if (idActividad) {
        const response =
          await this.api.patch<{
            data: SavedActivity;
            message: string;
          }>(
            `/activities/${idActividad}`,
            body
          );

        this.successMessage.set(
          response.message ??
            'Actividad actualizada correctamente.'
        );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              700
            )
        );

        await this.router.navigate([
          '/actividades',
          idActividad,
        ]);

        return;
      }

      const response =
        await this.api.post<{
          data: SavedActivity;
          message: string;
        }>(
          '/activities',
          {
            ...body,

            id_grupo:
              this.selectedGroupId,
          }
        );

      this.successMessage.set(
        response.message ??
          'Actividad publicada correctamente.'
      );

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            700
          )
      );

      await this.router.navigate([
        '/actividades',
        response.data.id_actividad,
      ]);

    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : this.isEditMode()
            ? 'No fue posible actualizar la actividad.'
            : 'No fue posible publicar la actividad.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  cancel() {
    if (
      !window.confirm(
        this.isEditMode()
          ? 'Los cambios no guardados se perderán. ¿Desea cancelar la edición?'
          : 'Los datos ingresados se perderán. ¿Desea cancelar la creación de la actividad?'
      )
    ) {
      return;
    }

    const idActividad =
      this.activityId();

    if (idActividad) {
      void this.router.navigate([
        '/actividades',
        idActividad,
      ]);

      return;
    }

    void this.router.navigate([
      '/actividades',
    ]);
  }
}
