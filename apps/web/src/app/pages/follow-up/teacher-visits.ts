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
  MAX_TEXTO_REVISION,
  TeacherVisit,
  TeacherVisitsData,
  VisitAssignment,
} from './teacher-review.model';

// Visitas del Docente Asesor a la institución donde el
// estudiante hace la práctica (CU7, BS3). Se registran y
// corrigen solo con la asignación EN_CURSO y el estudiante
// en el grupo; no se eliminan. El estudiante solo verá la
// fecha y la descripción.
@Component({
  selector: 'app-teacher-visits',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './teacher-visits.html',
  styleUrls: [
    './follow-up.scss',
    '../tutor/tutor-observations.scss',
    './teacher-visits.scss',
  ],
})
export class TeacherVisits implements OnInit {

  idGrupo = input.required<number>();
  idEstudiante = input.required<number>();

  assignment = signal<VisitAssignment | null>(null);
  visits = signal<TeacherVisit[]>([]);
  canRegister = signal(false);
  blockReason = signal<string | null>(null);
  minDate = signal<string | null>(null);
  maxDate = signal('');

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // null = nueva visita; id = corrección.
  editingId = signal<number | null>(null);
  fechaInput = signal('');
  descripcionInput = signal('');
  observacionesInput = signal('');

  readonly maxLength = MAX_TEXTO_REVISION;

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    void this.load();
  }

  private basePath() {
    return (
      `/teacher/follow-up/groups/${this.idGrupo()}` +
      `/students/${this.idEstudiante()}/visits`
    );
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{ data: TeacherVisitsData }>(
        this.basePath()
      );

      const data = response.data;

      this.assignment.set(data.asignacion);
      this.visits.set(data.visitas);
      this.canRegister.set(data.puede_registrar);
      this.blockReason.set(data.motivo_bloqueo);
      this.minDate.set(data.fecha_minima);
      this.maxDate.set(data.fecha_maxima ?? '');
      this.resetForm();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las visitas.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  resetForm() {
    this.editingId.set(null);
    this.fechaInput.set(this.maxDate());
    this.descripcionInput.set('');
    this.observacionesInput.set('');
  }

  edit(visit: TeacherVisit) {
    this.editingId.set(visit.id_visita);
    this.fechaInput.set(visit.fecha);
    this.descripcionInput.set(visit.descripcion);
    this.observacionesInput.set(visit.observaciones ?? '');
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  async save() {
    const fecha = this.fechaInput().trim();
    const descripcion = this.descripcionInput().trim();
    const observaciones = this.observacionesInput().trim();

    this.successMessage.set('');

    if (!fecha) {
      this.errorMessage.set('Seleccione la fecha de la visita.');
      return;
    }

    if (fecha > this.maxDate()) {
      this.errorMessage.set('La fecha de la visita no puede ser futura.');
      return;
    }

    const min = this.minDate();

    if (min && fecha < min) {
      this.errorMessage.set(
        'La fecha no puede ser anterior al inicio de la práctica.'
      );
      return;
    }

    if (!descripcion) {
      this.errorMessage.set('Describa la visita realizada.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const editingId = this.editingId();

    try {
      const body = { fecha, descripcion, observaciones };

      const response = editingId
        ? await this.api.put<{ message: string; data: TeacherVisit }>(
            `${this.basePath()}/${editingId}`,
            body
          )
        : await this.api.post<{ message: string; data: TeacherVisit }>(
            this.basePath(),
            body
          );

      // Mismo orden que el backend: fecha desc, id desc.
      this.visits.update((list) =>
        [
          response.data,
          ...list.filter((v) => v.id_visita !== response.data.id_visita),
        ].sort(
          (a, b) =>
            b.fecha.localeCompare(a.fecha) || b.id_visita - a.id_visita
        )
      );

      this.resetForm();
      this.successMessage.set(response.message);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la visita.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
