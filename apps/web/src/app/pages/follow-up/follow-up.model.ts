// Historial de seguimiento (derivado del snapshot
// actividad_estudiante + entregas + retroalimentación).

export type FollowUpState =
  | 'PENDIENTE'
  | 'ENTREGADA'
  | 'NO_ENTREGADA'
  | 'CALIFICADA';

export interface FollowUpGroupInfo {
  id_grupo: number;
  nombre: string;
  estado: string;
  practica: string;
  periodo_academico: string;
}

export interface FollowUpSummary {
  total: number;
  pendientes: number;
  entregadas: number;
  no_entregadas: number;
  calificadas: number;
  promedio: number | null;
  ultima_entrega: string | null;
}

export interface FollowUpStudentIdentity {
  id_estudiante: number;
  nombres: string | null;
  apellidos: string | null;
  correo: string | null;
  codigo_estudiante: string | null;
  estado_usuario: string | null;
  en_grupo: boolean;
}

export interface FollowUpStudentRow
  extends FollowUpStudentIdentity {
  resumen: FollowUpSummary;
}

export interface GroupFollowUp {
  grupo: FollowUpGroupInfo;
  total_actividades: number;
  actividades_abiertas: number;
  promedio_grupo: number | null;
  estudiantes: FollowUpStudentRow[];
}

export interface FollowUpActivity {
  id_actividad_estudiante: number;
  id_actividad: number;
  titulo: string;
  fecha_limite: string;
  hora_limite: string;
  estado_actividad: string;
  asignado_en: string;
  id_entrega: number | null;
  entregado_en: string | null;
  entrega_actualizada_en: string | null;
  total_evidencias: number;
  calificacion: number | null;
  comentario_docente: string | null;
  calificado_en: string | null;
  estado_seguimiento: FollowUpState;
}

export interface StudentFollowUp {
  grupo: FollowUpGroupInfo;
  estudiante: FollowUpStudentIdentity;
  resumen: FollowUpSummary;
  actividades: FollowUpActivity[];
}

export const FOLLOW_UP_LABELS: Record<FollowUpState, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADA: 'Entregada',
  NO_ENTREGADA: 'No entregada',
  CALIFICADA: 'Calificada',
};

export function studentName(
  student: Pick<
    FollowUpStudentIdentity,
    'id_estudiante' | 'nombres' | 'apellidos'
  >
): string {
  const name = [student.nombres, student.apellidos]
    .filter(Boolean)
    .join(' ');

  return name || `Estudiante #${student.id_estudiante}`;
}
