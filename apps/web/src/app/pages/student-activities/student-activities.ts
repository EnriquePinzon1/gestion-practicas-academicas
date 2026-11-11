import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  ActividadEstudiante,
  ETIQUETAS_ESTADO_VISIBLE,
  EstadoVisible,
  estadoVisible,
  formatearFechaLimite,
} from './student-activity.model';

@Component({
  selector: 'app-student-activities',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-activities.html',
  styleUrl: './student-activities.scss',
})
export class StudentActivities {
  actividades = signal<ActividadEstudiante[]>([]);

  loading = signal(false);
  errorMessage = signal('');

  filtro = signal<EstadoVisible | ''>('');

  readonly etiquetas = ETIQUETAS_ESTADO_VISIBLE;
  readonly estado = estadoVisible;
  readonly fechaLimite = formatearFechaLimite;

  conteo = computed(() => {
    const total: Record<EstadoVisible, number> = {
      PENDIENTE: 0,
      ENTREGADA: 0,
      NO_ENTREGADA: 0,
    };

    for (const a of this.actividades()) {
      total[estadoVisible(a)]++;
    }

    return total;
  });

  filtradas = computed(() => {
    const filtro = this.filtro();

    return this.actividades().filter(
      (a) => !filtro || estadoVisible(a) === filtro
    );
  });

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response =
        await this.api.get<{
          data: ActividadEstudiante[];
        }>('/student/activities');

      this.actividades.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar tus actividades.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  setFiltro(filtro: EstadoVisible | '') {
    this.filtro.set(
      this.filtro() === filtro ? '' : filtro
    );
  }

  open(actividad: ActividadEstudiante) {
    this.router.navigate([
      '/mis-actividades',
      actividad.id_actividad_estudiante,
    ]);
  }
}
