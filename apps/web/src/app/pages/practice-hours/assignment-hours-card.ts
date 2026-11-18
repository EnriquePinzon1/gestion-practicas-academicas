import {
  Component,
  OnInit,
  input,
  signal,
} from '@angular/core';

import { RouterLink } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

import { HoursProgress } from './hours-progress';
import { HoursSummary } from './practice-hours.model';

// Avance de horas dentro del detalle de una asignación
// (Coordinador), con acceso al registro de horas.
@Component({
  selector: 'app-assignment-hours-card',
  standalone: true,
  imports: [HoursProgress, RouterLink],
  template: `
    <section class="hours-card">
      <div class="hours-card-heading">
        <div>
          <h2>Horas de práctica</h2>
          <p>Avance de las horas requeridas por la práctica.</p>
        </div>

        <a [routerLink]="['/horas', idAsignacion()]">
          @if (summary()?.estado === 'EN_CURSO') {
            Registrar horas →
          } @else {
            Ver registro de horas →
          }
        </a>
      </div>

      @if (loading()) {
        <p class="ui-loader">Cargando horas...</p>
      } @else if (errorMessage()) {
        <p class="error">{{ errorMessage() }}</p>
      } @else if (summary(); as s) {
        <app-hours-progress [summary]="s" [compact]="true" />
      }
    </section>
  `,
  styles: `
    .hours-card {
      display: grid;
      gap: 18px;
      padding: 24px;
      background: #ffffff;
      border: 1px solid #dfe5ec;
      border-radius: 14px;
    }

    .hours-card-heading {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;

      h2 {
        margin: 0 0 4px;
        color: #10233f;
        font-size: 20px;
      }

      p {
        margin: 0;
        color: #64748b;
        font-size: 15px;
      }

      a {
        color: #1d5d91;
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .error {
      margin: 0;
      color: #991b1b;
    }
  `,
})
export class AssignmentHoursCard implements OnInit {
  idAsignacion = input.required<number>();

  summary = signal<HoursSummary | null>(null);
  loading = signal(false);
  errorMessage = signal('');

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{ data: HoursSummary }>(
        `/practice-hours/${this.idAsignacion()}`
      );

      this.summary.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las horas de práctica.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
