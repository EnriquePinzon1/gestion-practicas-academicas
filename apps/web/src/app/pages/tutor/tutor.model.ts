import { EstadoAsignacion } from
  '../assignments/assignment.model';

import {
  FollowUpActivity,
  FollowUpSummary,
} from '../follow-up/follow-up.model';

// Asignación vista por el Tutor Receptor: dónde y con quién
// realiza la práctica el estudiante, más el grupo académico
// (misma práctica y período) que permite su seguimiento.
export interface TutorAssignment {
  id_asignacion: number;
  id_estudiante: number;
  id_practica: number;
  practica: string;
  id_institucion: number;
  institucion: string;
  periodo_academico: string;
  estado: EstadoAsignacion;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  creado_en: string;
  id_grupo: number | null;
  grupo: string | null;
  estado_grupo: string | null;
  estudiante: {
    id_estudiante: number;
    nombres: string | null;
    apellidos: string | null;
    correo: string | null;
    codigo_estudiante: string | null;
    semestre: number | null;
  };
  docente: {
    id_docente: number;
    nombres: string;
    apellidos: string;
    correo: string;
  } | null;
}

export interface TutorAssignmentDetail extends TutorAssignment {
  seguimiento: {
    resumen: FollowUpSummary;
    actividades: FollowUpActivity[];
  } | null;
  seguimiento_error?: string;
}

export function isCurrentAssignment(
  assignment: Pick<TutorAssignment, 'estado'>
): boolean {
  return (
    assignment.estado === 'ASIGNADA' ||
    assignment.estado === 'EN_CURSO'
  );
}
