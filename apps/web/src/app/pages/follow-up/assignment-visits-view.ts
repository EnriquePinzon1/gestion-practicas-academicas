import {
  Component,
  OnInit,
  input,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';

import { ApiService } from
  '../../core/services/api.service';

import { TeacherVisit } from './teacher-review.model';

// Visitas del Docente Asesor a una asignación, en solo
// lectura para el Coordinador (incluye observaciones).
@Component({
  selector: 'app-assignment-visits-view',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="panel">
      <div class="panel-heading">
        <h2>Visitas del docente asesor</h2>
        <p>Registradas por el docente del grupo; solo lectura.</p>
      </div>

      <div class="observations-body">
        @if (errorMessage()) {
          <div class="alert error">{{ errorMessage() }}</div>
        } @else if (!loaded()) {
          <p class="muted ui-loader">Cargando visitas...</p>
        } @else if (visits().length === 0) {
          <div class="empty-state compact">
            <h3>Sin visitas</h3>
            <p>El docente aún no ha registrado visitas.</p>
          </div>
        } @else {
          <ol class="observation-list">
            @for (v of visits(); track v.id_visita) {
              <li>
                <div class="observation-head">
                  <strong>{{ v.fecha | date: 'dd/MM/yyyy' : 'UTC' }}</strong>
                  <small>
                    {{ v.docente ?? 'Docente #' + v.id_docente }}
                    ·
                    @if (v.editada) {
                      Corregida {{ v.actualizado_en | date: 'dd/MM/yyyy, HH:mm' }}
                    } @else {
                      Registrada {{ v.creado_en | date: 'dd/MM/yyyy, HH:mm' }}
                    }
                  </small>
                </div>

                <p>{{ v.descripcion }}</p>

                @if (v.observaciones) {
                  <p class="internal-note">
                    <span>Observaciones internas:</span> {{ v.observaciones }}
                  </p>
                }
              </li>
            }
          </ol>
        }
      </div>
    </section>
  `,
  styleUrls: [
    './follow-up.scss',
    '../tutor/tutor-observations.scss',
    './teacher-visits.scss',
  ],
})
export class AssignmentVisitsView implements OnInit {

  idAsignacion = input.required<number>();

  visits = signal<TeacherVisit[]>([]);
  loaded = signal(false);
  errorMessage = signal('');

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      const response = await this.api.get<{ data: TeacherVisit[] }>(
        `/practice-assignments/${this.idAsignacion()}/visits`
      );

      this.visits.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las visitas.'
      );
    } finally {
      this.loaded.set(true);
    }
  }
}
