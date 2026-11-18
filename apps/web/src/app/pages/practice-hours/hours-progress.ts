import { Component, input } from '@angular/core';

import {
  HoursSummary,
  formatHours,
} from './practice-hours.model';

// Indicador de avance de horas: requeridas, realizadas,
// pendientes y barra de progreso. Lo comparten el Coordinador
// (registro de horas), el Estudiante (Mi Seguimiento) y el
// detalle de la asignación.
@Component({
  selector: 'app-hours-progress',
  standalone: true,
  template: `
    <div class="hours-progress" [class.compact]="compact()">
      <div class="hours-cards">
        <article>
          <span>Horas requeridas</span>
          <strong>{{ format(summary().horas_requeridas) }} h</strong>
        </article>
        <article>
          <span>Horas realizadas</span>
          <strong>{{ format(summary().horas_realizadas) }} h</strong>
        </article>
        <article>
          <span>Horas pendientes</span>
          <strong>{{ format(summary().horas_pendientes) }} h</strong>
        </article>
      </div>

      <div
        class="bar"
        role="progressbar"
        aria-label="Avance de horas"
        [attr.aria-valuenow]="summary().porcentaje"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="bar-fill"
          [class.done]="summary().completadas"
          [style.width.%]="summary().porcentaje"
        ></div>
      </div>

      <p class="bar-caption">
        @if (summary().completadas) {
          <span class="done-label">✓ Horas completadas</span>
        } @else {
          {{ summary().porcentaje }}% de avance
        }
      </p>
    </div>
  `,
  styles: `
    .hours-progress {
      display: grid;
      gap: 14px;
    }

    .hours-cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;

      article {
        padding: 16px 18px;
        border: 1px solid #dfe5ec;
        border-radius: 12px;
        background: #ffffff;
        min-width: 0;
      }

      span {
        display: block;
        margin-bottom: 6px;
        color: #718096;
        font-size: 15px;
      }

      strong {
        color: #10233f;
        font-size: 26px;
      }
    }

    .compact .hours-cards strong {
      font-size: 20px;
    }

    .bar {
      height: 14px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: inherit;
      background: #1d5d91;
      transition: width 260ms ease;

      &.done {
        background: #16a34a;
      }
    }

    .bar-caption {
      margin: 0;
      color: #64748b;
      font-size: 15px;
      font-weight: 600;
    }

    .done-label {
      color: #166534;
    }

    @media (max-width: 700px) {
      .hours-cards {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class HoursProgress {
  summary = input.required<HoursSummary>();
  compact = input(false);

  readonly format = formatHours;
}
