import {
  Component,
  input,
  output,
} from '@angular/core';

import { DatePipe } from '@angular/common';

import {
  FOLLOW_UP_LABELS,
  FollowUpActivity,
  FollowUpState,
} from './follow-up.model';

// Línea de tiempo de seguimiento de un estudiante.
// Compartida por el Docente Asesor (con enlace a la
// actividad) y el Tutor Receptor (solo lectura).
@Component({
  selector: 'app-follow-up-timeline',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './follow-up-timeline.html',
  styleUrls: [
    './follow-up.scss',
    './follow-up-timeline.scss',
  ],
})
export class FollowUpTimeline {

  activities = input.required<FollowUpActivity[]>();
  showActivityLink = input(false);

  openActivity = output<number>();

  stateLabel(state: FollowUpState): string {
    return FOLLOW_UP_LABELS[state] ?? state;
  }

  formatGrade(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
  }

  formatDate(value: string): string {
    return value ? value.substring(0, 10) : '-';
  }

  formatTime(value: string): string {
    return value ? value.substring(0, 5) : '-';
  }
}
