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
  ETIQUETAS_ESTADO,
  EstadoAsignacion,
  formatearFecha,
} from '../assignments/assignment.model';
import {
  ReportePeriodo,
  nombreEnReporte,
  porcentajeEntregas,
} from './report.model';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  reporte = signal<ReportePeriodo | null>(null);

  loading = signal(false);
  errorMessage = signal('');

  readonly estados: EstadoAsignacion[] = [
    'ASIGNADA',
    'EN_CURSO',
    'FINALIZADA',
    'CANCELADA',
  ];

  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly formatearFecha = formatearFecha;
  readonly nombre = nombreEnReporte;
  readonly porcentaje = porcentajeEntregas;

  // Alertas que requieren acción del coordinador.
  totalAlertas = computed(() => {
    const r = this.reporte();

    return r
      ? r.cruces.en_grupo_sin_asignacion.length +
          r.cruces.asignacion_sin_grupo.length +
          r.evaluaciones_tutor.pendientes.length
      : 0;
  });

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    this.loadReport();
  }

  // Sin período el backend elige el vigente (o el más
  // reciente con datos).
  async loadReport(periodo = '') {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: ReportePeriodo;
      }>(
        '/reports/period' +
          (periodo
            ? '?periodo=' + encodeURIComponent(periodo)
            : '')
      );

      this.reporte.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible generar el reporte del período.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  changePeriod(periodo: string) {
    this.loadReport(periodo);
  }

  viewAssignment(idAsignacion: number) {
    this.router.navigate(['/asignaciones', idAsignacion]);
  }

  viewGroup(idGrupo: number) {
    this.router.navigate(['/grupos', idGrupo]);
  }

  newAssignment() {
    this.router.navigate(['/asignaciones/nueva']);
  }
}
