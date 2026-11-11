// ======================================================
// ASIGNACIONES INDIVIDUALES DE PRÁCTICA
// Tipos y reglas compartidas por listado, detalle y formulario
// ======================================================

export type EstadoAsignacion =
  | 'ASIGNADA'
  | 'EN_CURSO'
  | 'FINALIZADA'
  | 'CANCELADA';

export interface Asignacion {
  id_asignacion: number;
  id_estudiante: number;
  id_practica: number;
  practica: string;
  id_programa: number;
  id_institucion: number;
  institucion: string;
  id_tutor: number | null;
  periodo_academico: string;
  estado: EstadoAsignacion;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface EstudianteDisponible {
  id_estudiante: number;
  id_usuario: number;
  nombres: string;
  apellidos: string;
  numero_documento: string;
  correo: string;
  codigo_estudiante: string;
  semestre: number;
  id_programa: number;
}

export interface TutorDisponible {
  id_tutor: number;
  id_usuario: number;
  nombres: string;
  apellidos: string;
  numero_documento: string;
  correo: string;
  cargo: string | null;
}

export interface AccionEstado {
  estado: EstadoAsignacion;
  etiqueta: string;
  confirmacion: string;
  peligrosa: boolean;
}

export const ETIQUETAS_ESTADO: Record<
  EstadoAsignacion,
  string
> = {
  ASIGNADA: 'Asignada',
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

// Mismas transiciones que valida practice-service.
// FINALIZADA y CANCELADA son estados finales.
const TRANSICIONES: Record<
  EstadoAsignacion,
  AccionEstado[]
> = {
  ASIGNADA: [
    {
      estado: 'EN_CURSO',
      etiqueta: 'Iniciar',
      confirmacion:
        '¿Desea iniciar esta práctica? La fecha de inicio quedará registrada con la fecha de hoy.',
      peligrosa: false,
    },
    {
      estado: 'CANCELADA',
      etiqueta: 'Cancelar',
      confirmacion:
        '¿Desea cancelar esta asignación? Esta acción no se puede revertir.',
      peligrosa: true,
    },
  ],
  EN_CURSO: [
    {
      estado: 'FINALIZADA',
      etiqueta: 'Finalizar',
      confirmacion:
        '¿Desea finalizar esta práctica? La fecha de finalización quedará registrada con la fecha de hoy y la asignación no podrá modificarse.',
      peligrosa: false,
    },
    {
      estado: 'CANCELADA',
      etiqueta: 'Cancelar',
      confirmacion:
        '¿Desea cancelar esta práctica en curso? Esta acción no se puede revertir.',
      peligrosa: true,
    },
  ],
  FINALIZADA: [],
  CANCELADA: [],
};

export function accionesDisponibles(
  estado: EstadoAsignacion
): AccionEstado[] {
  return TRANSICIONES[estado] ?? [];
}

// Las columnas fecha_inicio / fecha_fin son DATE.
// Se toma solo AAAA-MM-DD para no desplazar el día
// al convertir a la zona horaria del navegador.
export function formatearFecha(
  valor: string | null
): string {
  if (!valor) {
    return '—';
  }

  const [anio, mes, dia] = valor
    .substring(0, 10)
    .split('-');

  return `${dia}/${mes}/${anio}`;
}

export function nombreEstudiante(
  idEstudiante: number,
  estudiantes: Map<number, EstudianteDisponible>
): string {
  const estudiante =
    estudiantes.get(idEstudiante);

  return estudiante
    ? `${estudiante.nombres} ${estudiante.apellidos}`
    : `Estudiante #${idEstudiante}`;
}

export function nombreTutor(
  idTutor: number | null,
  tutores: Map<number, TutorDisponible>
): string {
  if (idTutor === null) {
    return 'Sin tutor asignado';
  }

  const tutor = tutores.get(idTutor);

  return tutor
    ? `${tutor.nombres} ${tutor.apellidos}`
    : `Tutor #${idTutor}`;
}
