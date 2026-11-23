import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';

// ========================================================
// AUDITORÍA DE EVENTOS DE NEGOCIO
// Cada ruta que modifica datos declara su evento. Tras una
// respuesta 2xx, el Gateway lo envía al Audit Service sin
// esperar: si el registro falla, la operación del usuario
// no se ve afectada (solo se deja constancia en el log).
// ========================================================

type Body = Record<string, any> | undefined;

interface AuditContext {
  req: Request;
  /** `data` de la respuesta del servicio, si existe. */
  data: Body;
  status: number;
}

export interface AuditDefinition {
  tipo: string;
  accion: string;
  /** Tipo y acción cuando un upsert corrige (200) en vez de crear (201). */
  correccion?: { tipo: string; accion: string };
  modulo: string;
  entidad: string;
  /** Id de la entidad: campo de `data` o parámetro de la ruta. */
  idData?: string;
  idParam?: string;
  /** Solo valores simples; nunca archivos, respuestas ni textos largos. */
  detalle?: (ctx: AuditContext) => Record<string, unknown>;
}

export type AuditSender = (event: Record<string, unknown>) => Promise<void>;

function positiveInt(value: unknown): number | null {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : null;
}

function actorFrom(res: Response) {
  const profile =
    res.locals.profile ??
    res.locals.teacher ??
    res.locals.student ??
    res.locals.tutor ??
    {};
  const user = res.locals.user ?? {};

  const nombre = [profile.nombres, profile.apellidos]
    .filter(Boolean)
    .join(' ');

  return {
    id_usuario: positiveInt(profile.id_usuario),
    auth_user_id: user.id ?? profile.auth_user_id ?? null,
    nombre: nombre || null,
    correo: profile.correo ?? user.email ?? null,
    rol: profile.rol ?? null,
  };
}

export function createAudit(send: AuditSender) {
  return (definition: AuditDefinition): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      let responseBody: unknown;

      const originalJson = res.json.bind(res);

      res.json = (body: unknown) => {
        responseBody = body;
        return originalJson(body);
      };

      res.on('finish', () => {
        const status = res.statusCode;

        if (status < 200 || status > 299) {
          return;
        }

        try {
          const data =
            responseBody && typeof responseBody === 'object'
              ? ((responseBody as Record<string, any>)['data'] as Body)
              : undefined;
          const ctx: AuditContext = { req, data, status };

          const corrected = status === 200 && definition.correccion;

          const id =
            (definition.idData
              ? positiveInt(data?.[definition.idData])
              : null) ??
            (definition.idParam
              ? positiveInt(req.params[definition.idParam])
              : null);

          const event = {
            tipo: corrected ? definition.correccion!.tipo : definition.tipo,
            accion: corrected
              ? definition.correccion!.accion
              : definition.accion,
            modulo: definition.modulo,
            entidad: { tipo: definition.entidad, id },
            actor: actorFrom(res),
            detalle: definition.detalle?.(ctx) ?? {},
            http: {
              metodo: req.method,
              // Ruta declarada (sin valores), p. ej. /api/groups/:id
              ruta: req.baseUrl + (req.route?.path ?? req.path),
              estado: status,
            },
            ocurrido_en: new Date().toISOString(),
          };

          send(event).catch((error) =>
            console.error(
              `No fue posible registrar el evento ${event.tipo}:`,
              error
            )
          );
        } catch (error) {
          console.error('Error construyendo evento de auditoría:', error);
        }
      });

      next();
    };
}

// ========================================================
// CATÁLOGO DE EVENTOS
// ========================================================

const body = (ctx: AuditContext) => ctx.req.body ?? {};

// Nombres de los campos modificados (sin sus valores).
const camposModificados = (ctx: AuditContext) => ({
  campos: Object.keys(body(ctx)).filter((key) => key !== 'id_docente'),
});

const soloEstado = (ctx: AuditContext) => ({
  estado: body(ctx).estado ?? ctx.data?.estado ?? null,
});

const param = (ctx: AuditContext, name: string) =>
  positiveInt(ctx.req.params[name]);

export const AUDIT_EVENTS = {
  // ---------------- USUARIOS ----------------
  usuarioCreado: {
    tipo: 'USUARIO_CREADO',
    accion: 'Registro de usuario',
    modulo: 'USUARIOS',
    entidad: 'usuario',
    idData: 'id_usuario',
    detalle: (ctx) => ({
      rol: ctx.data?.rol ?? null,
      nombre:
        [ctx.data?.nombres, ctx.data?.apellidos].filter(Boolean).join(' ') ||
        null,
      correo: ctx.data?.correo ?? null,
    }),
  },
  usuarioEstado: {
    tipo: 'USUARIO_ESTADO',
    accion: 'Cambio de estado de usuario',
    modulo: 'USUARIOS',
    entidad: 'usuario',
    idParam: 'id',
    detalle: (ctx) => ({
      estado: body(ctx).estado ?? null,
      nombre:
        [ctx.data?.nombres, ctx.data?.apellidos].filter(Boolean).join(' ') ||
        null,
    }),
  },
  usuarioActualizado: {
    tipo: 'USUARIO_ACTUALIZADO',
    accion: 'Actualización de usuario',
    modulo: 'USUARIOS',
    entidad: 'usuario',
    idParam: 'id',
    detalle: camposModificados,
  },

  // ---------------- INSTITUCIONES ----------------
  institucionCreada: {
    tipo: 'INSTITUCION_CREADA',
    accion: 'Registro de institución',
    modulo: 'INSTITUCIONES',
    entidad: 'institucion',
    idData: 'id_institucion',
    detalle: (ctx) => ({ nombre: ctx.data?.nombre ?? null }),
  },
  tutorVinculado: {
    tipo: 'TUTOR_VINCULADO',
    accion: 'Vinculación de tutor a institución',
    modulo: 'INSTITUCIONES',
    entidad: 'institucion',
    idParam: 'id',
    detalle: (ctx) => ({ id_tutor: positiveInt(body(ctx).id_tutor) }),
  },
  vinculoTutorEstado: {
    tipo: 'TUTOR_VINCULO_ESTADO',
    accion: 'Cambio de vínculo institución-tutor',
    modulo: 'INSTITUCIONES',
    entidad: 'institucion',
    idParam: 'id',
    detalle: (ctx) => ({
      id_tutor: param(ctx, 'idTutor'),
      activo: typeof body(ctx).activo === 'boolean' ? body(ctx).activo : null,
    }),
  },

  // ---------------- PRÁCTICAS ----------------
  practicaCreada: {
    tipo: 'PRACTICA_CREADA',
    accion: 'Registro de práctica',
    modulo: 'PRACTICAS',
    entidad: 'practica',
    idData: 'id_practica',
    detalle: (ctx) => ({
      nombre: ctx.data?.nombre ?? null,
      horas_requeridas: ctx.data?.horas_requeridas ?? null,
    }),
  },
  practicaActualizada: {
    tipo: 'PRACTICA_ACTUALIZADA',
    accion: 'Actualización de práctica',
    modulo: 'PRACTICAS',
    entidad: 'practica',
    idParam: 'id',
    detalle: camposModificados,
  },
  practicaEstado: {
    tipo: 'PRACTICA_ESTADO',
    accion: 'Cambio de estado de práctica',
    modulo: 'PRACTICAS',
    entidad: 'practica',
    idParam: 'id',
    detalle: soloEstado,
  },

  // ---------------- ASIGNACIONES ----------------
  asignacionCreada: {
    tipo: 'ASIGNACION_CREADA',
    accion: 'Registro de asignación',
    modulo: 'ASIGNACIONES',
    entidad: 'asignacion',
    idData: 'id_asignacion',
    detalle: (ctx) => ({
      id_estudiante: ctx.data?.id_estudiante ?? null,
      id_practica: ctx.data?.id_practica ?? null,
      id_institucion: ctx.data?.id_institucion ?? null,
      id_tutor: ctx.data?.id_tutor ?? null,
      periodo_academico: ctx.data?.periodo_academico ?? null,
    }),
  },
  asignacionEstado: {
    tipo: 'ASIGNACION_ESTADO',
    accion: 'Cambio de estado de asignación',
    modulo: 'ASIGNACIONES',
    entidad: 'asignacion',
    idParam: 'id',
    detalle: soloEstado,
  },

  // ---------------- GRUPOS ----------------
  grupoCreado: {
    tipo: 'GRUPO_CREADO',
    accion: 'Registro de grupo',
    modulo: 'GRUPOS',
    entidad: 'grupo',
    idData: 'id_grupo',
    detalle: (ctx) => ({
      nombre: ctx.data?.nombre ?? null,
      periodo_academico: ctx.data?.periodo_academico ?? null,
      estudiantes: Array.isArray(ctx.data?.estudiantes)
        ? ctx.data!.estudiantes.length
        : null,
    }),
  },
  grupoActualizado: {
    tipo: 'GRUPO_ACTUALIZADO',
    accion: 'Actualización de grupo',
    modulo: 'GRUPOS',
    entidad: 'grupo',
    idParam: 'id',
    detalle: camposModificados,
  },
  grupoIntegrantes: {
    tipo: 'GRUPO_INTEGRANTES',
    accion: 'Cambio de integrantes de grupo',
    modulo: 'GRUPOS',
    entidad: 'grupo',
    idParam: 'id',
    detalle: (ctx) => ({
      id_estudiante: positiveInt(body(ctx).id_estudiante),
      operacion: body(ctx).action ?? null,
    }),
  },
  grupoEstado: {
    tipo: 'GRUPO_ESTADO',
    accion: 'Cambio de estado de grupo',
    modulo: 'GRUPOS',
    entidad: 'grupo',
    idParam: 'id',
    detalle: soloEstado,
  },

  // ---------------- ACTIVIDADES (Docente) ----------------
  actividadCreada: {
    tipo: 'ACTIVIDAD_CREADA',
    accion: 'Registro de actividad',
    modulo: 'ACTIVIDADES',
    entidad: 'actividad',
    idData: 'id_actividad',
    detalle: (ctx) => ({
      titulo: ctx.data?.titulo ?? null,
      id_grupo: ctx.data?.id_grupo ?? null,
      fecha_limite: ctx.data?.fecha_limite
        ? String(ctx.data.fecha_limite).slice(0, 10)
        : null,
    }),
  },
  actividadActualizada: {
    tipo: 'ACTIVIDAD_ACTUALIZADA',
    accion: 'Actualización de actividad',
    modulo: 'ACTIVIDADES',
    entidad: 'actividad',
    idParam: 'id',
    detalle: camposModificados,
  },
  actividadCerrada: {
    tipo: 'ACTIVIDAD_CERRADA',
    accion: 'Cierre de actividad',
    modulo: 'ACTIVIDADES',
    entidad: 'actividad',
    idParam: 'id',
  },
  calificacion: {
    tipo: 'CALIFICACION_REGISTRADA',
    accion: 'Calificación de entrega',
    correccion: {
      tipo: 'CALIFICACION_CORREGIDA',
      accion: 'Corrección de calificación',
    },
    modulo: 'ACTIVIDADES',
    entidad: 'entrega',
    idParam: 'idEntrega',
    detalle: (ctx) => ({
      id_actividad: param(ctx, 'id'),
      calificacion:
        ctx.data?.calificacion !== undefined
          ? Number(ctx.data.calificacion)
          : null,
    }),
  },

  // ---------------- ENTREGAS (Estudiante) ----------------
  entrega: {
    tipo: 'ENTREGA_REGISTRADA',
    accion: 'Entrega de actividad',
    correccion: {
      tipo: 'ENTREGA_CORREGIDA',
      accion: 'Corrección de entrega',
    },
    modulo: 'ENTREGAS',
    entidad: 'entrega',
    idData: 'id_entrega',
    detalle: (ctx) => ({
      id_actividad_estudiante: param(ctx, 'id'),
    }),
  },
  evidenciaAdjuntada: {
    tipo: 'EVIDENCIA_ADJUNTADA',
    accion: 'Carga de evidencia',
    modulo: 'ENTREGAS',
    entidad: 'evidencia',
    idData: 'id_evidencia',
    detalle: (ctx) => ({
      id_actividad_estudiante: param(ctx, 'id'),
      archivo:
        typeof ctx.req.query['nombre'] === 'string'
          ? ctx.req.query['nombre']
          : null,
    }),
  },
  evidenciaEliminada: {
    tipo: 'EVIDENCIA_ELIMINADA',
    accion: 'Eliminación de evidencia',
    modulo: 'ENTREGAS',
    entidad: 'evidencia',
    idParam: 'idEvidencia',
    detalle: (ctx) => ({
      id_actividad_estudiante: param(ctx, 'id'),
    }),
  },

  // ---------------- SEGUIMIENTO (Docente) ----------------
  revisionEvidencia: {
    tipo: 'EVIDENCIA_REVISADA',
    accion: 'Revisión de evidencia',
    correccion: {
      tipo: 'EVIDENCIA_REVISION_CORREGIDA',
      accion: 'Corrección de revisión de evidencia',
    },
    modulo: 'SEGUIMIENTO',
    entidad: 'evidencia',
    idParam: 'idEvidencia',
  },
  visitaRegistrada: {
    tipo: 'VISITA_REGISTRADA',
    accion: 'Registro de visita',
    modulo: 'SEGUIMIENTO',
    entidad: 'visita',
    idData: 'id_visita',
    detalle: (ctx) => ({
      id_grupo: param(ctx, 'idGrupo'),
      id_estudiante: param(ctx, 'idEstudiante'),
      fecha: body(ctx).fecha ?? null,
    }),
  },
  visitaCorregida: {
    tipo: 'VISITA_CORREGIDA',
    accion: 'Corrección de visita',
    modulo: 'SEGUIMIENTO',
    entidad: 'visita',
    idParam: 'idVisita',
    detalle: (ctx) => ({
      id_grupo: param(ctx, 'idGrupo'),
      id_estudiante: param(ctx, 'idEstudiante'),
      fecha: body(ctx).fecha ?? null,
    }),
  },

  // ---------------- TUTOR RECEPTOR ----------------
  observacionRegistrada: {
    tipo: 'OBSERVACION_TUTOR_REGISTRADA',
    accion: 'Registro de observación del tutor',
    modulo: 'TUTOR',
    entidad: 'asignacion',
    idParam: 'id',
    detalle: (ctx) => ({
      id_observacion: positiveInt(ctx.data?.id_observacion),
      fecha: body(ctx).fecha ?? null,
    }),
  },
  observacionCorregida: {
    tipo: 'OBSERVACION_TUTOR_CORREGIDA',
    accion: 'Corrección de observación del tutor',
    modulo: 'TUTOR',
    entidad: 'asignacion',
    idParam: 'id',
    detalle: (ctx) => ({
      id_observacion: param(ctx, 'idObservacion'),
      fecha: body(ctx).fecha ?? null,
    }),
  },
  evaluacionTutor: {
    tipo: 'EVALUACION_TUTOR_REGISTRADA',
    accion: 'Evaluación final del tutor',
    correccion: {
      tipo: 'EVALUACION_TUTOR_CORREGIDA',
      accion: 'Corrección de evaluación del tutor',
    },
    modulo: 'TUTOR',
    entidad: 'asignacion',
    idParam: 'id',
    detalle: (ctx) => ({
      calificacion:
        body(ctx).calificacion !== undefined
          ? Number(body(ctx).calificacion)
          : null,
      recomienda_aprobacion:
        typeof body(ctx).recomienda_aprobacion === 'boolean'
          ? body(ctx).recomienda_aprobacion
          : null,
    }),
  },

  // ---------------- HORAS (Coordinador) ----------------
  horasRegistradas: {
    tipo: 'HORAS_REGISTRADAS',
    accion: 'Registro de horas',
    modulo: 'HORAS',
    entidad: 'asignacion',
    idParam: 'id',
    detalle: (ctx) => ({
      id_registro: positiveInt(ctx.data?.registro?.id_registro),
      fecha: body(ctx).fecha ?? null,
      horas: Number(body(ctx).horas) || null,
    }),
  },
  horasCorregidas: {
    tipo: 'HORAS_CORREGIDAS',
    accion: 'Corrección de registro de horas',
    modulo: 'HORAS',
    entidad: 'asignacion',
    idParam: 'id',
    detalle: (ctx) => ({
      id_registro: param(ctx, 'idRegistro'),
      fecha: body(ctx).fecha ?? null,
      horas: Number(body(ctx).horas) || null,
    }),
  },
  horasEliminadas: {
    tipo: 'HORAS_ELIMINADAS',
    accion: 'Eliminación de registro de horas',
    modulo: 'HORAS',
    entidad: 'asignacion',
    idParam: 'id',
    detalle: (ctx) => ({
      id_registro: param(ctx, 'idRegistro'),
    }),
  },
} satisfies Record<string, AuditDefinition>;
