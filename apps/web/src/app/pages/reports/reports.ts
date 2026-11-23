import {
  Component,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { exportarReportePdf } from './report-pdf';
import {
  CriterioReporte,
  DefinicionReporte,
  FiltroReporte,
  OpcionesReporte,
  REPORTES,
  ReporteGenerado,
  ReportePeriodo,
  TipoReporte,
  consolidadoGenerado,
  esNumerica,
  formatearValor,
} from './report.model';

type Filtros = Partial<Record<FiltroReporte, string>>;

const SIN_DATOS =
  'No se encontraron datos para generar el reporte solicitado';
const ERROR_GENERAR =
  'No fue posible generar el reporte. Intente nuevamente';
const ERROR_FECHAS =
  'La fecha inicial no puede ser posterior a la fecha final';

// Generación de reportes del Coordinador (CU "Generar
// Reportes"): tipo → filtros aplicables → vista previa →
// exportar PDF.
@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  readonly reportes = REPORTES;
  readonly formatear = formatearValor;
  readonly numerica = esNumerica;

  opciones = signal<OpcionesReporte | null>(null);
  loadingOptions = signal(false);

  tipo = signal<TipoReporte | null>(null);
  filtros = signal<Filtros>({});

  reporte = signal<ReporteGenerado | null>(null);
  criterios = signal<CriterioReporte[]>([]);
  avisos = signal<string[]>([]);

  generating = signal(false);
  exporting = signal(false);
  errorMessage = signal('');
  infoMessage = signal('');
  exportError = signal('');
  invalidRange = signal(false);

  definicion = computed<DefinicionReporte | null>(
    () => REPORTES.find((r) => r.tipo === this.tipo()) ?? null
  );

  // ---------- Opciones dependientes (BS1-B2) ----------

  practicas = computed(() => {
    const o = this.opciones();
    const programa = Number(this.filtros().programa) || null;

    return (o?.practicas ?? []).filter(
      (p) => programa === null || p.id_programa === programa
    );
  });

  grupos = computed(() => {
    const o = this.opciones();
    const f = this.filtros();

    return (o?.grupos ?? []).filter(
      (g) =>
        (!f.periodo || g.periodo_academico === f.periodo) &&
        (!f.docente || g.id_docente === Number(f.docente))
    );
  });

  estudiantes = computed(() => {
    const o = this.opciones();
    const f = this.filtros();
    const grupo = f.grupo
      ? (o?.grupos ?? []).find((g) => g.id_grupo === Number(f.grupo))
      : null;

    return (o?.estudiantes ?? []).filter(
      (e) =>
        (!grupo || grupo.estudiantes.includes(e.id_estudiante)) &&
        e.relaciones.some(
          (r) =>
            (!f.programa || r.id_programa === Number(f.programa)) &&
            (!f.practica || r.id_practica === Number(f.practica)) &&
            (!f.periodo || r.periodo_academico === f.periodo)
        )
    );
  });

  constructor(private readonly api: ApiService) {
    void this.loadOptions();
  }

  async loadOptions() {
    this.loadingOptions.set(true);

    try {
      const response = await this.api.get<{
        data: OpcionesReporte;
        avisos?: string[];
      }>('/reports/options');

      this.opciones.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las opciones de los reportes.'
      );
    } finally {
      this.loadingOptions.set(false);
    }
  }

  aplica(filtro: FiltroReporte): boolean {
    return this.definicion()?.filtros.includes(filtro) ?? false;
  }

  // BS1-B5: conserva solo los filtros aplicables al nuevo tipo
  selectType(tipo: TipoReporte) {
    if (tipo === this.tipo()) {
      return;
    }

    const aplicables = REPORTES.find((r) => r.tipo === tipo)!.filtros;
    const actuales = this.filtros();
    const conservados: Filtros = {};

    for (const key of aplicables) {
      if (actuales[key]) {
        conservados[key] = actuales[key];
      }
    }

    this.tipo.set(tipo);
    this.filtros.set(conservados);
    this.prune();
    this.resetResult();
  }

  setFilter(key: FiltroReporte, value: string) {
    this.filtros.update((f) => ({ ...f, [key]: value || undefined }));
    this.prune();
    this.invalidRange.set(false);
  }

  // Quita selecciones que ya no están entre las opciones
  // dependientes (p. ej. una práctica de otro programa).
  private prune() {
    const f = { ...this.filtros() };
    let changed = false;

    if (f.practica && !this.practicas().some((p) => p.id_practica === Number(f.practica))) {
      delete f.practica;
      changed = true;
    }

    if (changed) {
      this.filtros.set(f);
    }

    const g = { ...this.filtros() };

    if (g.grupo && !this.grupos().some((x) => x.id_grupo === Number(g.grupo))) {
      delete g.grupo;
      this.filtros.set(g);
    }

    const e = { ...this.filtros() };

    if (
      e.estudiante &&
      !this.estudiantes().some((x) => x.id_estudiante === Number(e.estudiante))
    ) {
      delete e.estudiante;
      this.filtros.set(e);
    }
  }

  // BS1-B4
  clearFilters() {
    this.filtros.set({});
    this.invalidRange.set(false);
    this.resetResult();
  }

  private resetResult() {
    this.reporte.set(null);
    this.criterios.set([]);
    this.avisos.set([]);
    this.errorMessage.set('');
    this.infoMessage.set('');
    this.exportError.set('');
  }

  async generate() {
    const tipo = this.tipo();
    const f = this.filtros();

    if (!tipo) {
      return;
    }

    this.errorMessage.set('');
    this.infoMessage.set('');
    this.exportError.set('');

    // BS1-E2
    if (f.desde && f.hasta && f.desde > f.hasta) {
      this.invalidRange.set(true);
      this.errorMessage.set(ERROR_FECHAS);
      return;
    }

    this.invalidRange.set(false);
    this.generating.set(true);

    try {
      let reporte: ReporteGenerado;
      let avisos: string[] = [];
      let periodoUsado = f.periodo;

      if (tipo === 'consolidado') {
        const response = await this.api.get<{ data: ReportePeriodo }>(
          '/reports/period' +
            (f.periodo ? '?periodo=' + encodeURIComponent(f.periodo) : '')
        );

        reporte = consolidadoGenerado(response.data);
        avisos = response.data.avisos ?? [];
        periodoUsado = response.data.periodo;
      } else {
        const params = new URLSearchParams();

        for (const key of this.definicion()!.filtros) {
          if (f[key]) {
            params.set(key, f[key]!);
          }
        }

        const query = params.toString();
        const response = await this.api.get<{
          data: ReporteGenerado;
          avisos?: string[];
        }>('/reports/generate/' + tipo + (query ? '?' + query : ''));

        reporte = response.data;
        avisos = response.avisos ?? [];
      }

      // BS1-E1: sin datos no hay vista previa ni documento
      if (reporte.total_registros === 0) {
        this.reporte.set(null);
        this.infoMessage.set(SIN_DATOS);
        return;
      }

      this.reporte.set(reporte);
      this.avisos.set(avisos);
      this.criterios.set(this.buildCriteria(tipo === 'consolidado' ? { ...f, periodo: periodoUsado } : f));
    } catch (error) {
      // BS1-E3: se conservan los filtros
      this.reporte.set(null);
      this.errorMessage.set(
        error instanceof Error && error.message
          ? error.message
          : ERROR_GENERAR
      );
    } finally {
      this.generating.set(false);
    }
  }

  // Criterios con nombres (sin identificadores internos)
  private buildCriteria(f: Filtros): CriterioReporte[] {
    const o = this.opciones();
    const def = this.definicion();
    const criterios: CriterioReporte[] = [];
    const add = (etiqueta: string, valor?: string | null) => {
      if (valor) {
        criterios.push({ etiqueta, valor });
      }
    };

    add('Programa', o?.programas.find((p) => p.id_programa === Number(f.programa))?.nombre);
    add('Práctica', o?.practicas.find((p) => p.id_practica === Number(f.practica))?.nombre);
    add('Período', f.periodo);
    add('Estado', f.estado ? formatearValor(f.estado, 'estado') : null);
    add('Docente asesor', o?.docentes.find((d) => d.id_docente === Number(f.docente))?.nombre);
    add('Grupo', o?.grupos.find((g) => g.id_grupo === Number(f.grupo))?.nombre);

    const estudiante = o?.estudiantes.find((e) => e.id_estudiante === Number(f.estudiante));
    add('Estudiante', estudiante ? `${estudiante.estudiante} (${estudiante.codigo})` : null);

    if (f.desde || f.hasta) {
      add(
        'Rango (' + (def?.rango ?? 'fechas') + ')',
        `${f.desde ? formatearValor(f.desde, 'fecha') : 'inicio'} a ${
          f.hasta ? formatearValor(f.hasta, 'fecha') : 'hoy'
        }`
      );
    }

    return criterios;
  }

  // BS1 pasos 18-20; BS1-E4: la vista previa se conserva
  async exportPdf() {
    const reporte = this.reporte();

    if (!reporte) {
      return;
    }

    this.exporting.set(true);
    this.exportError.set('');

    try {
      await exportarReportePdf(reporte, this.criterios());
    } catch (error) {
      console.error('Error exportando el reporte:', error);
      this.exportError.set(
        'No fue posible exportar el PDF. La consulta sigue disponible; intente nuevamente.'
      );
    } finally {
      this.exporting.set(false);
    }
  }

  fechaGeneracion(iso: string): string {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}
