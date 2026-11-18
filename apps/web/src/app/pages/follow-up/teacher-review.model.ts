// ======================================================
// CU7 BLOQUE 2: revisión de evidencias y visitas del
// Docente Asesor. Las reglas se validan en el backend.
// ======================================================

export const MAX_TEXTO_REVISION = 2000;

// Evidencia de un estudiante en una actividad del grupo
export interface TeacherEvidence {
  id_evidencia: number;
  nombre_archivo: string;
  tipo_mime: string;
  tamano_bytes: number;
  subido_en: string;
  id_actividad: number;
  titulo: string;
  estado_actividad: string;
  entregado_en: string;
  // Entrega definitiva: actividad cerrada o plazo vencido
  puede_revisar: boolean;
  revisada: boolean;
  observacion_revision: string | null;
  revisada_en: string | null;
}

export interface TeacherEvidencesResponse {
  data: TeacherEvidence[];
  resumen: {
    total: number;
    revisadas: number;
    pendientes: number;
  };
}

export interface TeacherVisit {
  id_visita: number;
  id_docente: number;
  fecha: string;
  descripcion: string;
  observaciones: string | null;
  creado_en: string;
  actualizado_en: string;
  editada: boolean;
  propia: boolean;
  // Solo en la vista del coordinador
  docente?: string | null;
}

export interface VisitAssignment {
  id_asignacion: number;
  estado: string;
  practica: string;
  institucion: string;
  periodo_academico: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface TeacherVisitsData {
  asignacion: VisitAssignment | null;
  en_grupo: boolean;
  puede_registrar: boolean;
  motivo_bloqueo: string | null;
  fecha_minima: string | null;
  fecha_maxima: string | null;
  visitas: TeacherVisit[];
}

// Lo que ve el estudiante: solo fecha y descripción
export interface StudentVisit {
  id_visita: number;
  fecha: string;
  descripcion: string;
}
