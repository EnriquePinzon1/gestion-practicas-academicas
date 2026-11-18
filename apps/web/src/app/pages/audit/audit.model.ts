// Registro de auditoría (Audit Service, MongoDB) visto por
// el Coordinador.

export interface AuditEvent {
  id: string;
  tipo: string;
  accion: string;
  modulo: string;
  entidad: {
    tipo: string;
    id: number | null;
  };
  actor: {
    id_usuario: number | null;
    nombre: string | null;
    correo: string | null;
    rol: string | null;
  };
  detalle: Record<string, unknown>;
  ocurrido_en: string;
}

export interface AuditPage {
  data: AuditEvent[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditOptions {
  modulos: string[];
  roles: string[];
  tipos: {
    tipo: string;
    accion: string;
    modulo: string;
    total: number;
  }[];
}

export const ETIQUETAS_MODULO: Record<string, string> = {
  USUARIOS: 'Usuarios',
  INSTITUCIONES: 'Instituciones',
  PRACTICAS: 'Prácticas',
  ASIGNACIONES: 'Asignaciones',
  GRUPOS: 'Grupos',
  ACTIVIDADES: 'Actividades',
  ENTREGAS: 'Entregas',
  SEGUIMIENTO: 'Seguimiento docente',
  TUTOR: 'Tutor receptor',
  HORAS: 'Horas de práctica',
};

export const ETIQUETAS_ROL: Record<string, string> = {
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente asesor',
  ESTUDIANTE: 'Estudiante',
  TUTOR_RECEPTOR: 'Tutor receptor',
};

// Entidad afectada y, si existe, la página donde consultarla.
export const ENTIDADES: Record<
  string,
  { etiqueta: string; ruta?: string }
> = {
  usuario: { etiqueta: 'Usuario', ruta: '/usuarios' },
  institucion: { etiqueta: 'Institución', ruta: '/instituciones' },
  practica: { etiqueta: 'Práctica', ruta: '/practicas' },
  asignacion: { etiqueta: 'Asignación', ruta: '/asignaciones' },
  grupo: { etiqueta: 'Grupo', ruta: '/grupos' },
  actividad: { etiqueta: 'Actividad' },
  entrega: { etiqueta: 'Entrega' },
  evidencia: { etiqueta: 'Evidencia' },
  visita: { etiqueta: 'Visita' },
};

export const ETIQUETAS_DETALLE: Record<string, string> = {
  estado: 'Estado',
  nombre: 'Nombre',
  correo: 'Correo',
  rol: 'Rol',
  campos: 'Campos modificados',
  id_tutor: 'Tutor',
  activo: 'Vínculo activo',
  horas_requeridas: 'Horas requeridas',
  id_estudiante: 'Estudiante',
  id_practica: 'Práctica',
  id_institucion: 'Institución',
  periodo_academico: 'Período',
  estudiantes: 'Estudiantes',
  operacion: 'Operación',
  titulo: 'Título',
  id_grupo: 'Grupo',
  fecha_limite: 'Fecha límite',
  id_actividad: 'Actividad',
  calificacion: 'Calificación',
  id_actividad_estudiante: 'Actividad asignada',
  archivo: 'Archivo',
  fecha: 'Fecha',
  id_observacion: 'Observación',
  recomienda_aprobacion: 'Recomienda aprobación',
  id_registro: 'Registro',
  horas: 'Horas',
};

const VALORES: Record<string, string> = {
  ADD: 'Agregar',
  REMOVE: 'Retirar',
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  ACTIVA: 'Activa',
  INACTIVA: 'Inactiva',
  ASIGNADA: 'Asignada',
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  CERRADO: 'Cerrado',
  CERRADA: 'Cerrada',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente asesor',
  ESTUDIANTE: 'Estudiante',
  TUTOR_RECEPTOR: 'Tutor receptor',
};

export interface DetailItem {
  etiqueta: string;
  valor: string;
}

function formatValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        key === 'campos'
          ? (ETIQUETAS_DETALLE[String(item)] ?? String(item))
          : String(item)
      )
      .join(', ');
  }

  if (typeof value === 'number') {
    if (key === 'calificacion' || key === 'horas') {
      return value.toLocaleString('es-CO', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    }

    return key.startsWith('id_') ? '#' + value : String(value);
  }

  const text = String(value);

  return VALORES[text] ?? text;
}

export function detailItems(event: AuditEvent): DetailItem[] {
  return Object.entries(event.detalle ?? {})
    .filter(
      ([, value]) =>
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
    )
    .map(([key, value]) => ({
      etiqueta: ETIQUETAS_DETALLE[key] ?? key,
      valor: formatValue(key, value),
    }));
}
