// ======================================================
// ACTIVIDADES DEL ESTUDIANTE Y ENTREGAS
// Tipos y reglas de presentación compartidas
// ======================================================

import { Evidencia } from './evidence.model';

export interface ActividadEstudiante {
  id_actividad_estudiante: number;
  id_actividad: number;
  estado_entrega: 'PENDIENTE' | 'ENTREGADA';
  asignado_en: string;
  titulo: string;
  descripcion: string;
  fecha_limite: string;
  hora_limite: string;
  estado_actividad: 'ABIERTA' | 'CERRADA';
  vencida: boolean;
  total_preguntas: number;
  id_entrega: number | null;
  entregado_en: string | null;
  entrega_actualizada_en: string | null;
  puede_entregar: boolean;
}

export interface PreguntaConRespuesta {
  id_pregunta: number;
  enunciado: string;
  orden: number;
  respuesta: string | null;
}

export interface ActividadEstudianteDetalle
  extends ActividadEstudiante {
  preguntas: PreguntaConRespuesta[];
  evidencias: Evidencia[];
}

export type EstadoVisible =
  | 'ENTREGADA'
  | 'PENDIENTE'
  | 'NO_ENTREGADA';

// ENTREGADA: tiene entrega registrada.
// PENDIENTE: aún puede entregarse.
// NO_ENTREGADA: cerrada o vencida sin entrega.
export function estadoVisible(
  a: ActividadEstudiante
): EstadoVisible {
  if (a.estado_entrega === 'ENTREGADA') {
    return 'ENTREGADA';
  }

  return a.puede_entregar
    ? 'PENDIENTE'
    : 'NO_ENTREGADA';
}

export const ETIQUETAS_ESTADO_VISIBLE: Record<
  EstadoVisible,
  string
> = {
  ENTREGADA: 'Entregada',
  PENDIENTE: 'Pendiente',
  NO_ENTREGADA: 'No entregada',
};

// fecha_limite es DATE y hora_limite TIME (hora de Bogotá).
// Se formatea sin convertir zona horaria.
export function formatearFechaLimite(
  fecha: string,
  hora: string
): string {
  const [anio, mes, dia] = String(fecha)
    .substring(0, 10)
    .split('-');

  return `${dia}/${mes}/${anio}, ${String(hora).substring(0, 5)}`;
}
