// ======================================================
// REPORTE DEL COORDINADOR POR PERÍODO ACADÉMICO
// Forma de GET /api/reports/period (API Gateway)
// ======================================================

import { EstadoAsignacion } from '../assignments/assignment.model';

export type ConteoEstados = Record<EstadoAsignacion, number>;

export interface ResumenPeriodo {
  total_asignaciones: number;
  por_estado: ConteoEstados;
  estudiantes_asignados: number;
  total_grupos: number;
  estudiantes_en_grupos: number;
}

export interface FilaInstitucion {
  id_institucion: number;
  institucion: string;
  total: number;
  estados: ConteoEstados;
}

export interface FilaPractica {
  id_practica: number;
  practica: string;
  total: number;
  estados: ConteoEstados;
  grupos: number;
  estudiantes_en_grupos: number;
}

export interface AvanceGrupo {
  actividades: number;
  actividades_abiertas: number;
  esperadas: number;
  entregadas: number;
  calificadas: number;
  no_entregadas: number;
  pendientes: number;
  promedio: number | null;
}

export interface GrupoReporte {
  id_grupo: number;
  nombre: string;
  estado: string;
  id_docente: number;
  docente: string | null;
  id_practica: number;
  practica: string;
  total_estudiantes: number;
  avance: AvanceGrupo | null;
}

interface IdentidadEstudiante {
  id_estudiante: number;
  estudiante: string | null;
  codigo_estudiante: string | null;
  estado_estudiante: string | null;
}

export interface EstudianteSinAsignacion
  extends IdentidadEstudiante {
  id_grupo: number;
  grupo: string;
  id_practica: number;
  practica: string;
}

export interface AsignacionReporte
  extends IdentidadEstudiante {
  id_asignacion: number;
  id_practica: number;
  practica: string;
  institucion: string;
  id_tutor: number | null;
  tutor?: string | null;
  estado: EstadoAsignacion;
  fecha_inicio: string | null;
}

export interface ReportePeriodo {
  periodo: string;
  periodos: string[];
  resumen: ResumenPeriodo;
  por_institucion: FilaInstitucion[];
  por_practica: FilaPractica[];
  grupos: GrupoReporte[];
  cruces: {
    en_grupo_sin_asignacion: EstudianteSinAsignacion[];
    asignacion_sin_grupo: AsignacionReporte[];
  };
  evaluaciones_tutor: {
    registradas: number;
    promedio: number | null;
    recomiendan_aprobacion: number;
    pendientes: AsignacionReporte[];
    sin_tutor: AsignacionReporte[];
  };
  avisos: string[];
}

export function nombreEnReporte(
  fila: IdentidadEstudiante
): string {
  return fila.estudiante ?? `Estudiante #${fila.id_estudiante}`;
}

// Porcentaje entero de entregas sobre las esperadas.
export function porcentajeEntregas(
  avance: AvanceGrupo
): number {
  return avance.esperadas
    ? Math.round((avance.entregadas / avance.esperadas) * 100)
    : 0;
}

// ======================================================
// GENERACIÓN DE REPORTES (CU "Generar Reportes")
// Formato común de vista previa y PDF. Los reportes nuevos
// llegan así desde GET /api/reports/generate/:tipo; el
// consolidado se adapta desde GET /api/reports/period.
// ======================================================

export type TipoReporte =
  | 'consolidado'
  | 'asignaciones'
  | 'horas'
  | 'desempeno'
  | 'seguimiento-docente';

export type FiltroReporte =
  | 'programa'
  | 'practica'
  | 'periodo'
  | 'estado'
  | 'docente'
  | 'grupo'
  | 'estudiante'
  | 'desde'
  | 'hasta';

export type FormatoValor =
  | 'texto'
  | 'entero'
  | 'horas'
  | 'nota'
  | 'fecha'
  | 'porcentaje'
  | 'estado';

export interface DefinicionReporte {
  tipo: TipoReporte;
  nombre: string;
  descripcion: string;
  filtros: FiltroReporte[];
  // A qué fecha se aplica el rango (si tiene)
  rango?: string;
}

export const REPORTES: DefinicionReporte[] = [
  {
    tipo: 'consolidado',
    nombre: 'Consolidado del período',
    descripcion:
      'Estados, instituciones, prácticas, avance por grupo, cruces y evaluación del tutor.',
    filtros: ['periodo'],
  },
  {
    tipo: 'asignaciones',
    nombre: 'Asignaciones de práctica',
    descripcion:
      'Dónde y con quién realiza la práctica cada estudiante, con horas y evaluación del tutor.',
    filtros: ['programa', 'practica', 'periodo', 'estado', 'desde', 'hasta'],
    rango: 'inicio de la práctica',
  },
  {
    tipo: 'horas',
    nombre: 'Horas de práctica',
    descripcion:
      'Horas registradas por estudiante, avance frente a las requeridas y detalle de registros.',
    filtros: ['programa', 'practica', 'periodo', 'estudiante', 'desde', 'hasta'],
    rango: 'fecha del registro',
  },
  {
    tipo: 'desempeno',
    nombre: 'Desempeño académico',
    descripcion:
      'Actividades, entregas, calificaciones y evidencias revisadas por estudiante y grupo.',
    filtros: ['periodo', 'docente', 'grupo', 'estudiante', 'desde', 'hasta'],
    rango: 'fecha límite de las actividades',
  },
  {
    tipo: 'seguimiento-docente',
    nombre: 'Seguimiento docente',
    descripcion:
      'Visitas, estudiantes sin visita, entregas sin calificar y evidencias por revisar.',
    filtros: ['periodo', 'docente', 'desde', 'hasta'],
    rango: 'fecha de visitas y actividades',
  },
];

export interface ColumnaReporte {
  clave: string;
  etiqueta: string;
  formato?: FormatoValor;
}

export interface SeccionReporte {
  titulo: string;
  descripcion?: string;
  columnas: ColumnaReporte[];
  filas: Record<string, unknown>[];
}

export interface IndicadorReporte {
  etiqueta: string;
  valor: number | string | null;
  formato?: FormatoValor;
}

export interface ReporteGenerado {
  tipo: TipoReporte;
  titulo: string;
  generado_en: string;
  total_registros: number;
  resumen: IndicadorReporte[];
  secciones: SeccionReporte[];
}

export interface CriterioReporte {
  etiqueta: string;
  valor: string;
}

// Opciones de filtros (GET /api/reports/options)
export interface OpcionesReporte {
  programas: { id_programa: number; nombre: string }[];
  practicas: { id_practica: number; nombre: string; id_programa: number }[];
  periodos: string[];
  estados: EstadoAsignacion[];
  grupos: {
    id_grupo: number;
    nombre: string;
    id_practica: number;
    id_programa: number;
    periodo_academico: string;
    id_docente: number;
    estado: string;
    estudiantes: number[];
  }[];
  docentes: { id_docente: number; nombre: string }[];
  estudiantes: {
    id_estudiante: number;
    estudiante: string;
    codigo: string;
    relaciones: {
      id_practica: number;
      id_programa: number;
      periodo_academico: string;
    }[];
  }[];
}

const ETIQUETAS_ESTADO_REPORTE: Record<string, string> = {
  ASIGNADA: 'Asignada',
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

// Valor presentable (sin identificadores internos).
export function formatearValor(
  valor: unknown,
  formato: FormatoValor = 'texto'
): string {
  if (valor === null || valor === undefined || valor === '') {
    return '—';
  }

  if (typeof valor === 'number') {
    switch (formato) {
      case 'horas':
        return (
          valor.toLocaleString('es-CO', { maximumFractionDigits: 1 }) +
          ' h'
        );
      case 'nota':
        return valor.toFixed(1);
      case 'porcentaje':
        return valor + ' %';
      default:
        return valor.toLocaleString('es-CO');
    }
  }

  const texto = String(valor);

  if (formato === 'fecha') {
    const [anio, mes, dia] = texto.substring(0, 10).split('-');

    return dia ? `${dia}/${mes}/${anio}` : texto;
  }

  if (formato === 'estado') {
    return ETIQUETAS_ESTADO_REPORTE[texto] ?? texto;
  }

  return texto;
}

// ¿Columna numérica? (alineada a la derecha)
export function esNumerica(formato?: FormatoValor): boolean {
  return (
    formato === 'entero' ||
    formato === 'horas' ||
    formato === 'nota' ||
    formato === 'porcentaje'
  );
}

// Adapta el reporte por período al formato común.
export function consolidadoGenerado(r: ReportePeriodo): ReporteGenerado {
  const est = r.resumen.por_estado;
  const columnasEstado: ColumnaReporte[] = [
    { clave: 'total', etiqueta: 'Total', formato: 'entero' },
    { clave: 'ASIGNADA', etiqueta: 'Asignadas', formato: 'entero' },
    { clave: 'EN_CURSO', etiqueta: 'En curso', formato: 'entero' },
    { clave: 'FINALIZADA', etiqueta: 'Finalizadas', formato: 'entero' },
    { clave: 'CANCELADA', etiqueta: 'Canceladas', formato: 'entero' },
  ];

  const identidad = (fila: IdentidadEstudiante) => ({
    estudiante: nombreEnReporte(fila),
    codigo: fila.codigo_estudiante ?? '—',
  });

  const secciones: SeccionReporte[] = [
    {
      titulo: 'Asignaciones por institución',
      columnas: [{ clave: 'institucion', etiqueta: 'Institución' }, ...columnasEstado],
      filas: r.por_institucion.map((f) => ({
        institucion: f.institucion,
        total: f.total,
        ...f.estados,
      })),
    },
    {
      titulo: 'Asignaciones por práctica',
      columnas: [
        { clave: 'practica', etiqueta: 'Práctica' },
        ...columnasEstado,
        { clave: 'grupos', etiqueta: 'Grupos', formato: 'entero' },
        { clave: 'en_grupos', etiqueta: 'En grupos', formato: 'entero' },
      ],
      filas: r.por_practica.map((f) => ({
        practica: f.practica,
        total: f.total,
        ...f.estados,
        grupos: f.grupos,
        en_grupos: f.estudiantes_en_grupos,
      })),
    },
    {
      titulo: 'Avance académico por grupo',
      columnas: [
        { clave: 'grupo', etiqueta: 'Grupo' },
        { clave: 'docente', etiqueta: 'Docente asesor' },
        { clave: 'practica', etiqueta: 'Práctica' },
        { clave: 'estudiantes', etiqueta: 'Estudiantes', formato: 'entero' },
        { clave: 'actividades', etiqueta: 'Actividades', formato: 'entero' },
        { clave: 'entregas', etiqueta: 'Entregas' },
        { clave: 'no_entregadas', etiqueta: 'No entregadas', formato: 'entero' },
        { clave: 'calificadas', etiqueta: 'Calificadas', formato: 'entero' },
        { clave: 'promedio', etiqueta: 'Promedio', formato: 'nota' },
      ],
      filas: r.grupos.map((g) => ({
        grupo: g.nombre,
        docente: g.docente ?? '—',
        practica: g.practica,
        estudiantes: g.total_estudiantes,
        actividades: g.avance?.actividades ?? null,
        entregas: g.avance
          ? `${g.avance.entregadas} / ${g.avance.esperadas} (${porcentajeEntregas(g.avance)} %)`
          : null,
        no_entregadas: g.avance?.no_entregadas ?? null,
        calificadas: g.avance?.calificadas ?? null,
        promedio: g.avance?.promedio ?? null,
      })),
    },
    {
      titulo: 'En grupo sin asignación',
      descripcion:
        'Estudiantes de un grupo sin asignación vigente para la misma práctica y período.',
      columnas: [
        { clave: 'estudiante', etiqueta: 'Estudiante' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'grupo', etiqueta: 'Grupo' },
        { clave: 'practica', etiqueta: 'Práctica' },
      ],
      filas: r.cruces.en_grupo_sin_asignacion.map((f) => ({
        ...identidad(f),
        grupo: f.grupo,
        practica: f.practica,
      })),
    },
    {
      titulo: 'Asignación sin grupo',
      descripcion: 'Asignaciones sin grupo de seguimiento de la misma práctica y período.',
      columnas: [
        { clave: 'estudiante', etiqueta: 'Estudiante' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'practica', etiqueta: 'Práctica' },
        { clave: 'institucion', etiqueta: 'Institución' },
        { clave: 'estado', etiqueta: 'Estado', formato: 'estado' },
      ],
      filas: r.cruces.asignacion_sin_grupo.map((f) => ({
        ...identidad(f),
        practica: f.practica,
        institucion: f.institucion,
        estado: f.estado,
      })),
    },
    {
      titulo: 'Evaluación del tutor pendiente',
      descripcion: 'Prácticas en curso con tutor que aún no registra la evaluación final.',
      columnas: [
        { clave: 'estudiante', etiqueta: 'Estudiante' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'practica', etiqueta: 'Práctica' },
        { clave: 'institucion', etiqueta: 'Institución' },
        { clave: 'tutor', etiqueta: 'Tutor receptor' },
        { clave: 'fecha_inicio', etiqueta: 'Inicio', formato: 'fecha' },
      ],
      filas: r.evaluaciones_tutor.pendientes.map((f) => ({
        ...identidad(f),
        practica: f.practica,
        institucion: f.institucion,
        tutor: f.tutor ?? '—',
        fecha_inicio: f.fecha_inicio,
      })),
    },
    {
      titulo: 'Prácticas vigentes sin tutor',
      columnas: [
        { clave: 'estudiante', etiqueta: 'Estudiante' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'practica', etiqueta: 'Práctica' },
        { clave: 'institucion', etiqueta: 'Institución' },
        { clave: 'estado', etiqueta: 'Estado', formato: 'estado' },
      ],
      filas: r.evaluaciones_tutor.sin_tutor.map((f) => ({
        ...identidad(f),
        practica: f.practica,
        institucion: f.institucion,
        estado: f.estado,
      })),
    },
  ];

  return {
    tipo: 'consolidado',
    titulo: 'Reporte consolidado del período ' + r.periodo,
    generado_en: new Date().toISOString(),
    total_registros: r.resumen.total_asignaciones + r.resumen.total_grupos,
    resumen: [
      { etiqueta: 'Asignaciones', valor: r.resumen.total_asignaciones, formato: 'entero' },
      { etiqueta: 'Estudiantes asignados', valor: r.resumen.estudiantes_asignados, formato: 'entero' },
      { etiqueta: 'En curso', valor: est.EN_CURSO, formato: 'entero' },
      { etiqueta: 'Finalizadas', valor: est.FINALIZADA, formato: 'entero' },
      { etiqueta: 'Grupos', valor: r.resumen.total_grupos, formato: 'entero' },
      { etiqueta: 'Estudiantes en grupos', valor: r.resumen.estudiantes_en_grupos, formato: 'entero' },
      { etiqueta: 'Evaluaciones del tutor', valor: r.evaluaciones_tutor.registradas, formato: 'entero' },
      { etiqueta: 'Promedio evaluación', valor: r.evaluaciones_tutor.promedio, formato: 'nota' },
    ],
    secciones,
  };
}
