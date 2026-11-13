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
