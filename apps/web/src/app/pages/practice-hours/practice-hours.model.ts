import { StudentVisit } from '../follow-up/teacher-review.model';

import { EstadoAsignacion } from
  '../assignments/assignment.model';

// Avance de horas de una asignación (CU "Realizar Seguimiento
// de Prácticas"). Requeridas = horas de la práctica curricular;
// realizadas = suma de los registros del Coordinador.
export interface HoursSummary {
  id_asignacion: number;
  id_estudiante: number;
  id_practica: number;
  practica: string;
  id_institucion: number;
  institucion: string;
  id_tutor: number | null;
  periodo_academico: string;
  estado: EstadoAsignacion;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  horas_requeridas: number;
  horas_realizadas: number;
  horas_pendientes: number;
  porcentaje: number;
  completadas: boolean;
  total_registros: number;
  ultima_fecha: string | null;
}

export interface HoursRecord {
  id_registro: number;
  id_asignacion: number;
  fecha: string;
  horas: number;
  observacion: string | null;
  creado_en: string;
  actualizado_en: string;
}

// Vista del Coordinador: con estudiante y tutor resueltos.
export interface CoordinatorHours extends HoursSummary {
  estudiante: {
    nombres: string | null;
    apellidos: string | null;
    correo: string | null;
    codigo_estudiante: string | null;
    estado: string;
  } | null;
  tutor: {
    nombres: string | null;
    apellidos: string | null;
    cargo: string | null;
    estado: string;
  } | null;
}

export interface CoordinatorHoursDetail extends CoordinatorHours {
  registros: HoursRecord[];
  puede_registrar: boolean;
  fecha_minima: string;
  fecha_maxima: string;
  horas_maximas_registro: number;
}

// Mi Seguimiento (Estudiante).
export interface StudentHours extends HoursSummary {
  registros: HoursRecord[];
  // Visitas del docente asesor: solo fecha y descripción
  visitas: StudentVisit[];
}

export const MAX_OBSERVACION_HORAS = 2000;

// 21.5 → "21,5"; 200 → "200".
export function formatHours(value: number): string {
  return value.toLocaleString('es-CO', {
    maximumFractionDigits: 1,
  });
}

export function personName(
  person: { nombres: string | null; apellidos: string | null } | null,
  fallback: string
): string {
  const name = [person?.nombres, person?.apellidos]
    .filter(Boolean)
    .join(' ');

  return name || fallback;
}

export function wasEdited(record: HoursRecord): boolean {
  return record.actualizado_en !== record.creado_en;
}
