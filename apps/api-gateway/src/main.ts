import 'dotenv/config';

import express, {
  NextFunction,
  Request,
  Response,
} from 'express';

import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  createCors,
  createInternalFetch,
  isWakeUpResponse,
  readAllowedOrigins,
  readInternalToken,
  resolveServiceUrl,
} from '@gestion-practicas/service-http';
import { AUDIT_EVENTS, createAudit } from './audit';

// ========================================================
// MICROSERVICIOS
// En local usan localhost; en producción, sus URLs públicas.
// Toda llamada lleva el secreto interno (INTERNAL_API_TOKEN).
// ========================================================

const USER_SERVICE_URL = resolveServiceUrl(
  'USER_SERVICE_URL',
  'http://localhost:3334'
);
const PRACTICE_SERVICE_URL = resolveServiceUrl(
  'PRACTICE_SERVICE_URL',
  'http://localhost:3335'
);
const ACTIVITY_SERVICE_URL = resolveServiceUrl(
  'ACTIVITY_SERVICE_URL',
  'http://localhost:3336'
);

const AUDIT_SERVICE_URL = resolveServiceUrl(
  'AUDIT_SERVICE_URL',
  'http://localhost:3337'
);

const internalFetch = createInternalFetch(readInternalToken());

// Envía el evento al Audit Service sin bloquear la respuesta
// al usuario (ver audit.ts).
const audit = createAudit(async (event) => {
  const response = await internalFetch(
    AUDIT_SERVICE_URL + '/api/events',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(
      'Audit Service respondió HTTP ' + response.status
    );
  }
});

const app = express();

// ========================================================
// CORS
// Orígenes del frontend en CORS_ALLOWED_ORIGINS (separados
// por coma); por defecto http://localhost:4200.
// ========================================================

app.use(createCors(readAllowedOrigins()));

app.use(express.json());

app.use(
  '/assets',
  express.static(path.join(__dirname, 'assets'))
);

// ========================================================
// SUPABASE
// ========================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY'
  );
}

const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

// ========================================================
// MIDDLEWARE: AUTENTICACIÓN
// ========================================================

// Si el user-service no pudo responder (caído, dormido o error
// interno), se informa 503 en lugar de un falso "sin perfil".
// Devuelve true si ya respondió.
function respondIfUserServiceDown(
  res: Response,
  response: globalThis.Response
): boolean {
  if (response.status >= 500 || isWakeUpResponse(response)) {
    res.status(503).json({
      message:
        'El servicio de usuarios no está disponible en este momento. Intenta de nuevo en unos segundos.',
    });
    return true;
  }

  return false;
}

async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Token de autenticación requerido',
    });
  }

  const token = authorization.substring(7);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      message: 'Token inválido o sesión expirada',
    });
  }

  res.locals.user = user;

  next();
}

// ========================================================
// MIDDLEWARE: COORDINADOR ACTIVO
// ========================================================

async function requireCoordinator(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = res.locals.user;

    if (!authUser?.id) {
      return res.status(401).json({
        message: 'Usuario no autenticado',
      });
    }

    const response = await internalFetch(
      `${USER_SERVICE_URL}/api/internal/users/by-auth/${authUser.id}`
    );

    if (respondIfUserServiceDown(res, response)) {
      return;
    }

    if (!response.ok) {
      return res.status(403).json({
        message:
          'No existe un perfil habilitado para este usuario',
      });
    }

    const profile = await response.json();

    if (profile.estado !== 'ACTIVO') {
      return res.status(403).json({
        message: 'El usuario se encuentra inactivo',
      });
    }

    if (profile.rol !== 'COORDINADOR') {
      return res.status(403).json({
        message:
          'No tiene permisos para realizar esta operación',
      });
    }

    res.locals.profile = profile;

    next();
  } catch (error) {
    console.error(
      'Error validating coordinator:',
      error
    );

    return res.status(503).json({
      message:
        'No fue posible validar los permisos del usuario',
    });
  }
}

// ========================================================
// MIDDLEWARE: DOCENTE ASESOR ACTIVO
// ========================================================

async function requireTeacher(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = res.locals.user;

    if (!authUser?.id) {
      return res.status(401).json({
        message: 'Usuario no autenticado',
      });
    }

    const response = await internalFetch(
      `${USER_SERVICE_URL}/api/internal/teachers/by-auth/${authUser.id}`
    );

    if (respondIfUserServiceDown(res, response)) {
      return;
    }

    if (!response.ok) {
      return res.status(403).json({
        message:
          'No existe un perfil de Docente Asesor habilitado para este usuario',
      });
    }

    const body = (await response.json()) as {
      data?: {
        id_docente: number;
        id_usuario: number;
        auth_user_id: string;
        nombres: string;
        apellidos: string;
        correo: string;
        estado: string;
        rol: string;
      };
    };

    const teacher = body.data;

    if (!teacher) {
      return res.status(403).json({
        message:
          'No fue posible obtener el perfil del Docente Asesor',
      });
    }

    if (teacher.estado !== 'ACTIVO') {
      return res.status(403).json({
        message:
          'El Docente Asesor se encuentra inactivo',
      });
    }

    if (teacher.rol !== 'DOCENTE') {
      return res.status(403).json({
        message:
          'No tiene permisos de Docente Asesor',
      });
    }

    res.locals.teacher = teacher;

    next();
  } catch (error) {
    console.error(
      'Error validating teacher:',
      error
    );

    return res.status(503).json({
      message:
        'No fue posible validar los permisos del Docente Asesor',
    });
  }
}


// ========================================================
// MIDDLEWARE: ESTUDIANTE ACTIVO
// ========================================================

async function requireStudent(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = res.locals.user;

    if (!authUser?.id) {
      return res.status(401).json({
        message: 'Usuario no autenticado',
      });
    }

    const response = await internalFetch(
      `${USER_SERVICE_URL}/api/internal/students/by-auth/${encodeURIComponent(authUser.id)}`
    );

    if (respondIfUserServiceDown(res, response)) {
      return;
    }

    if (!response.ok) {
      return res.status(403).json({
        message:
          'No tiene permisos de Estudiante',
      });
    }

    const body = (await response.json()) as {
      data?: {
        id_estudiante: number;
        estado: string;
        rol: string;
      };
    };

    const student = body.data;

    if (!student || student.rol !== 'ESTUDIANTE') {
      return res.status(403).json({
        message:
          'No tiene permisos de Estudiante',
      });
    }

    if (student.estado !== 'ACTIVO') {
      return res.status(403).json({
        message:
          'El estudiante se encuentra inactivo',
      });
    }

    res.locals.student = student;

    next();
  } catch (error) {
    console.error(
      'Error validating student:',
      error
    );

    return res.status(503).json({
      message:
        'No fue posible validar los permisos del estudiante',
    });
  }
}

// ========================================================
// MIDDLEWARE: TUTOR RECEPTOR ACTIVO
// ========================================================

async function requireTutor(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = res.locals.user;

    if (!authUser?.id) {
      return res.status(401).json({
        message: 'Usuario no autenticado',
      });
    }

    const response = await internalFetch(
      `${USER_SERVICE_URL}/api/internal/tutors/by-auth/${encodeURIComponent(authUser.id)}`
    );

    if (respondIfUserServiceDown(res, response)) {
      return;
    }

    if (!response.ok) {
      return res.status(403).json({
        message: 'No tiene permisos de Tutor Receptor',
      });
    }

    const body = (await response.json()) as {
      data?: {
        id_tutor: number;
        estado: string;
        rol: string;
      };
    };

    const tutor = body.data;

    if (!tutor || tutor.rol !== 'TUTOR_RECEPTOR') {
      return res.status(403).json({
        message: 'No tiene permisos de Tutor Receptor',
      });
    }

    if (tutor.estado !== 'ACTIVO') {
      return res.status(403).json({
        message: 'El Tutor Receptor se encuentra inactivo',
      });
    }

    res.locals.tutor = tutor;

    next();
  } catch (error) {
    console.error('Error validating tutor:', error);

    return res.status(503).json({
      message:
        'No fue posible validar los permisos del Tutor Receptor',
    });
  }
}

// Reenvía una petición a Activity Service conservando
// el estado HTTP y el cuerpo de la respuesta.
async function forwardToActivityService(
  res: Response,
  path: string,
  init: RequestInit,
  errorLabel: string
) {
  try {
    const response = await internalFetch(
      ACTIVITY_SERVICE_URL + path,
      init
    );

    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    console.error(errorLabel, error);

    return res.status(503).json({
      message: 'Activity Service no disponible',
    });
  }
}

// ========================================================
// AUDITORÍA - Solo Coordinador activo
// Registro de eventos de negocio (Audit Service, MongoDB).
// ========================================================

async function forwardToAuditService(
  res: Response,
  path: string,
  errorLabel: string
) {
  try {
    const response = await internalFetch(AUDIT_SERVICE_URL + path);

    if (isWakeUpResponse(response)) {
      return res.status(503).json({
        message:
          'El servicio de auditoría se está iniciando. Intenta de nuevo en unos segundos.',
      });
    }

    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    console.error(errorLabel, error);

    return res.status(503).json({
      message: 'El servicio de auditoría no está disponible',
    });
  }
}

app.get(
  '/api/audit/events',
  requireAuth,
  requireCoordinator,
  (req, res) => {
    const params = new URLSearchParams();

    for (const key of ['modulo', 'tipo', 'rol', 'desde', 'hasta', 'q', 'page', 'limit']) {
      const value = req.query[key];

      if (typeof value === 'string' && value.trim()) {
        params.set(key, value.trim());
      }
    }

    const query = params.toString();

    return forwardToAuditService(
      res,
      '/api/events' + (query ? '?' + query : ''),
      'Error consultando auditoría:'
    );
  }
);

app.get(
  '/api/audit/options',
  requireAuth,
  requireCoordinator,
  (_req, res) =>
    forwardToAuditService(
      res,
      '/api/events/options',
      'Error consultando opciones de auditoría:'
    )
);

// ========================================================
// GATEWAY HEALTH
// ========================================================

app.get('/api', (_req, res) => {
  res.json({
    message:
      'API Gateway - Gestión de Prácticas Académicas',
  });
});

// ========================================================
// USUARIO AUTENTICADO
// ========================================================

app.get(
  '/api/auth/me',
  requireAuth,
  async (_req, res) => {
    try {
      const user = res.locals.user;

      const response = await internalFetch(
        `${USER_SERVICE_URL}/api/internal/users/by-auth/${user.id}`
      );

      if (respondIfUserServiceDown(res, response)) {
        return;
      }

      if (!response.ok) {
        return res.status(403).json({
          message:
            'No existe un perfil habilitado para este usuario',
        });
      }

      const profile = await response.json();

      if (profile.estado !== 'ACTIVO') {
        return res.status(403).json({
          message:
            'El usuario se encuentra inactivo',
        });
      }

      return res.json({
        authenticated: true,

        auth_user_id: user.id,

        id_usuario:
          profile.id_usuario,

        nombres:
          profile.nombres,

        apellidos:
          profile.apellidos,

        correo:
          profile.correo,

        estado:
          profile.estado,

        rol:
          profile.rol,
      });
    } catch (error) {
      console.error(
        'Error consultando perfil autenticado:',
        error
      );

      return res.status(503).json({
        message:
          'No fue posible obtener el perfil del usuario',
      });
    }
  }
);

// ========================================================
// USER SERVICE HEALTH
// ========================================================

app.get(
  '/api/users/health',
  requireAuth,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        USER_SERVICE_URL + '/api'
      );

      const data = await response.json();

      return res.json({
        gateway: 'ok',
        service: 'user-service',
        status: 'ok',
        response: data,
      });
    } catch (error) {
      console.error(error);

      return res.status(503).json({
        service: 'user-service',
        status: 'unavailable',
      });
    }
  }
);

// ========================================================
// CU01 - CONSULTAR USUARIOS
// Solo Coordinador activo
// ========================================================

app.get(
  '/api/users',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        USER_SERVICE_URL + '/api/users'
      );

      if (!response.ok) {
        return res.status(502).json({
          message:
            'El User Service respondió con error',
        });
      }

      const data = await response.json();

      return res.json(data);
    } catch (error) {
      console.error(
        'Error connecting to user-service:',
        error
      );

      return res.status(503).json({
        message:
          'No fue posible comunicarse con User Service',
      });
    }
  }
);

// ========================================================
// PRACTICE SERVICE HEALTH
// ========================================================

app.get(
  '/api/practices/health',
  requireAuth,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api'
      );

      const data = await response.json();

      return res.json({
        gateway: 'ok',
        service: 'practice-service',
        status: 'ok',
        response: data,
      });
    } catch (error) {
      console.error(error);

      return res.status(503).json({
        service: 'practice-service',
        status: 'unavailable',
      });
    }
  }
);

// ========================================================
// ACTIVITY SERVICE HEALTH
// ========================================================

app.get(
  '/api/activities/health',
  requireAuth,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        ACTIVITY_SERVICE_URL + '/api'
      );

      const data = await response.json();

      return res.json({
        gateway: 'ok',
        service: 'activity-service',
        status: 'ok',
        response: data,
      });
    } catch (error) {
      console.error(error);

      return res.status(503).json({
        service: 'activity-service',
        status: 'unavailable',
      });
    }
  }
);

// ========================================================
// SERVER
// ========================================================
// ========================================================
// CU01 - REGISTRAR USUARIO
// Solo Coordinador activo
// ========================================================

app.post(
  '/api/users',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.usuarioCreado),
  async (req, res) => {
    try {
      const response = await internalFetch(
        USER_SERVICE_URL + '/api/users',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json().catch(() => ({
        message: 'Respuesta inválida de User Service',
      }));

      return res.status(response.status).json(data);
    } catch (error) {
      console.error(
        'Error creating user through user-service:',
        error
      );

      return res.status(503).json({
        message:
          'No fue posible comunicarse con User Service',
      });
    }
  }
);

// ... rutas anteriores del gateway

app.patch(
  '/api/users/:id/status',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.usuarioEstado),
  async (req, res) => {
const authenticatedProfile = res.locals.profile;
const targetUserId = Number(req.params.id);

if (
  authenticatedProfile?.id_usuario === targetUserId &&
  req.body.estado === 'INACTIVO'
) {
  return res.status(400).json({
    message:
      'No puede desactivar su propio usuario mientras mantiene una sesión activa',
  });
}
    try {
      const response = await internalFetch(
        `${USER_SERVICE_URL}/api/users/${req.params.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error changing user status:', error);

      return res.status(503).json({
        message:
          'No fue posible comunicarse con User Service',
      });
    }
  }
);
// ========================================================
// CU01 - CONSULTAR USUARIO POR ID
// Solo Coordinador activo
// ========================================================

app.get(
  '/api/users/:id',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    try {
      const response = await internalFetch(
        `${USER_SERVICE_URL}/api/users/${req.params.id}`
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error querying user:', error);

      return res.status(503).json({
        message:
          'No fue posible comunicarse con User Service',
      });
    }
  }
);

// ========================================================
// CU01 - ACTUALIZAR USUARIO
// Solo Coordinador activo
// ========================================================

app.patch(
  '/api/users/:id',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.usuarioActualizado),
  async (req, res) => {
    try {
      const response = await internalFetch(
        `${USER_SERVICE_URL}/api/users/${req.params.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error updating user:', error);

      return res.status(503).json({
        message:
          'No fue posible comunicarse con User Service',
      });
    }
  }
);
// ========================================================
// CONSULTAR PROGRAMAS ACADÉMICOS
// Solo Coordinador activo
// ========================================================

app.get(
  '/api/programs',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/programs'
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error querying programs:', error);

      return res.status(503).json({
        message:
          'No fue posible comunicarse con Practice Service',
      });
    }
  }
);

// ======================================================
// CU02 - PRÁCTICAS ACADÉMICAS
// ======================================================

// Listar programas
app.get(
  '/api/programs',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/programs'
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error consultando programas:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Listar instituciones
app.get(
  '/api/institutions',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/institutions'
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error consultando instituciones:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Crear institución
app.post(
  '/api/institutions',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.institucionCreada),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/institutions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error creando institución:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Reenvía una petición a Practice Service conservando
// el estado HTTP y el cuerpo de la respuesta.
async function forwardToPracticeService(
  res: Response,
  path: string,
  init: RequestInit,
  errorLabel: string
) {
  try {
    const response = await internalFetch(
      PRACTICE_SERVICE_URL + path,
      init
    );

    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    console.error(errorLabel, error);

    return res.status(503).json({
      message: 'Practice Service no disponible',
    });
  }
}

// Detalle de institución
app.get(
  '/api/institutions/:id',
  requireAuth,
  requireCoordinator,
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/institutions/' +
        encodeURIComponent(String(req.params.id)),
      { method: 'GET' },
      'Error consultando institución:'
    )
);

// Tutores vinculados a una institución
app.get(
  '/api/institutions/:id/tutors',
  requireAuth,
  requireCoordinator,
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/institutions/' +
        encodeURIComponent(String(req.params.id)) +
        '/tutors',
      { method: 'GET' },
      'Error consultando tutores de la institución:'
    )
);

// Vincular tutor a institución
app.post(
  '/api/institutions/:id/tutors',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.tutorVinculado),
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/institutions/' +
        encodeURIComponent(String(req.params.id)) +
        '/tutors',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      },
      'Error vinculando tutor a institución:'
    )
);

// Activar / desactivar vínculo institución-tutor
app.patch(
  '/api/institutions/:id/tutors/:idTutor/status',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.vinculoTutorEstado),
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/institutions/' +
        encodeURIComponent(String(req.params.id)) +
        '/tutors/' +
        encodeURIComponent(String(req.params.idTutor)) +
        '/status',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      },
      'Error actualizando vinculación institución-tutor:'
    )
);

// Listar prácticas
app.get(
  '/api/practices',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        `${PRACTICE_SERVICE_URL}/api/practices`
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error consultando prácticas:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Registrar práctica
app.post(
  '/api/practices',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.practicaCreada),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/practices',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error creando práctica:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Consultar práctica
app.get(
  '/api/practices/:id',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    try {
      const response = await internalFetch(
  PRACTICE_SERVICE_URL + '/api/practices/' + req.params.id
);

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error consultando práctica:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Actualizar práctica
app.patch(
  '/api/practices/:id',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.practicaActualizada),
  async (req, res) => {
    try {
      const response = await internalFetch(
        `${PRACTICE_SERVICE_URL}/api/practices/${req.params.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error actualizando práctica:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Cerrar práctica
app.patch(
  '/api/practices/:id/status',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.practicaEstado),
  async (req, res) => {
    try {
      const response = await internalFetch(
        `${PRACTICE_SERVICE_URL}/api/practices/${req.params.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error cambiando estado de práctica:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);


// ======================================================
// ASIGNACIONES INDIVIDUALES DE PRÁCTICA
// Solo Coordinador activo
// ======================================================

// Estudiantes disponibles para asignación
app.get(
  '/api/practice-assignment-options/students',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        USER_SERVICE_URL + '/api/internal/students/available'
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error consultando estudiantes para asignaciones:',
        error
      );

      return res.status(503).json({
        message:
          'User Service no disponible',
      });
    }
  }
);

// Tutores receptores disponibles
app.get(
  '/api/practice-assignment-options/tutors',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        USER_SERVICE_URL + '/api/internal/tutors/available'
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error consultando tutores receptores:',
        error
      );

      return res.status(503).json({
        message:
          'User Service no disponible',
      });
    }
  }
);

// ========================================================
// ASIGNACIONES: IDENTIDAD DE ESTUDIANTE Y TUTOR
// Practice Service solo guarda IDs. Se consultan por IDs
// (incluye inactivos) para que una asignación histórica
// siga mostrando a quién pertenece. Si User Service no
// responde, se devuelven con estudiante/tutor en null.
// ========================================================

async function withAssignmentPeople(assignments: any[]) {
  const studentIds = [
    ...new Set(assignments.map((a) => Number(a.id_estudiante))),
  ];

  const tutorIds = [
    ...new Set(
      assignments
        .filter((a) => a.id_tutor !== null)
        .map((a) => Number(a.id_tutor))
    ),
  ];

  const [students, tutors] = await Promise.all([
    studentIds.length
      ? fetchInternalData<any[]>(
          USER_SERVICE_URL + '/api/internal/students/by-ids?ids=' +
            studentIds.join(',')
        )
      : Promise.resolve([]),
    tutorIds.length
      ? fetchInternalData<any[]>(
          USER_SERVICE_URL + '/api/internal/tutors/by-ids?ids=' +
            tutorIds.join(',')
        )
      : Promise.resolve([]),
  ]);

  const studentById = new Map(
    (students ?? []).map((row) => [Number(row.id_estudiante), row])
  );

  const tutorById = new Map(
    (tutors ?? []).map((row) => [Number(row.id_tutor), row])
  );

  return assignments.map((a) => {
    const student = studentById.get(Number(a.id_estudiante));
    const tutor =
      a.id_tutor === null
        ? undefined
        : tutorById.get(Number(a.id_tutor));

    return {
      ...a,
      estudiante: student
        ? {
            nombres: student.nombres,
            apellidos: student.apellidos,
            correo: student.correo,
            codigo_estudiante: student.codigo_estudiante,
            estado: student.estado,
          }
        : null,
      tutor: tutor
        ? {
            nombres: tutor.nombres,
            apellidos: tutor.apellidos,
            correo: tutor.correo,
            cargo: tutor.cargo,
            estado: tutor.estado,
          }
        : null,
    };
  });
}

// Listar asignaciones
app.get(
  '/api/practice-assignments',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/practice-assignments'
      );

      const body: any = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(body);
      }

      return res.json({
        data: await withAssignmentPeople(body.data ?? []),
      });
    } catch (error) {
      console.error(
        'Error consultando asignaciones de práctica:',
        error
      );

      return res.status(503).json({
        message:
          'Practice Service no disponible',
      });
    }
  }
);

// Consultar asignación por ID
app.get(
  '/api/practice-assignments/:id',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/practice-assignments/' +
          encodeURIComponent(String(req.params.id))
      );

      const body: any = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(body);
      }

      const [data] = await withAssignmentPeople([body.data]);

      return res.json({ data });
    } catch (error) {
      console.error(
        'Error consultando asignación de práctica:',
        error
      );

      return res.status(503).json({
        message:
          'Practice Service no disponible',
      });
    }
  }
);

// Crear asignación individual
app.post(
  '/api/practice-assignments',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.asignacionCreada),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/practice-assignments',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(
            req.body
          ),
        }
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error creando asignación de práctica:',
        error
      );

      return res.status(503).json({
        message:
          'Practice Service no disponible',
      });
    }
  }
);

// Cambiar estado de asignación
app.patch(
  '/api/practice-assignments/:id/status',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.asignacionEstado),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/practice-assignments/' +
          req.params.id +
          '/status',
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(
            req.body
          ),
        }
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error actualizando estado de asignación:',
        error
      );

      return res.status(503).json({
        message:
          'Practice Service no disponible',
      });
    }
  }
);


// ======================================================
// CU03 - GRUPOS DE PRÁCTICA
// ======================================================

// Docentes disponibles para grupos
app.get(
  '/api/group-options/teachers',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        USER_SERVICE_URL + '/api/internal/teachers/available'
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error(
        'Error consultando docentes para grupos:',
        error
      );

      return res.status(503).json({
        message: 'User Service no disponible',
      });
    }
  }
);

// Estudiantes disponibles para grupos
app.get(
  '/api/group-options/students',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        USER_SERVICE_URL + '/api/internal/students/available'
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error(
        'Error consultando estudiantes para grupos:',
        error
      );

      return res.status(503).json({
        message: 'User Service no disponible',
      });
    }
  }
);

// Listar grupos
app.get(
  '/api/groups',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/groups'
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error consultando grupos:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Crear grupo
app.post(
  '/api/groups',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.grupoCreado),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/groups',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error creando grupo:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Consultar grupo
app.get(
  '/api/groups/:id',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/groups/' +
          req.params.id
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error consultando grupo:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Actualizar grupo
app.patch(
  '/api/groups/:id',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.grupoActualizado),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/groups/' +
          req.params.id,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error actualizando grupo:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Agregar o retirar estudiante
app.patch(
  '/api/groups/:id/students',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.grupoIntegrantes),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/groups/' +
          req.params.id +
          '/students',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error(
        'Error modificando integrantes:',
        error
      );

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// Cerrar grupo
app.patch(
  '/api/groups/:id/status',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.grupoEstado),
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/groups/' +
          req.params.id +
          '/status',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error cerrando grupo:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// ========================================================
// CU04 - DOCENTE: GRUPOS ASIGNADOS
// ========================================================

app.get(
  '/api/teacher/groups',
  requireAuth,
  requireTeacher,
  async (_req, res) => {
    try {
      const teacher = res.locals.teacher;

      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/internal/groups/by-teacher/' +
          teacher.id_docente
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error consultando grupos del docente:',
        error
      );

      return res.status(503).json({
        message:
          'Practice Service no disponible',
      });
    }
  }
);


// ========================================================
// CU04 - DOCENTE: DETALLE DE GRUPO ASIGNADO
// ========================================================

app.get(
  '/api/teacher/groups/:id',
  requireAuth,
  requireTeacher,
  async (req, res) => {
    try {
      const teacher = res.locals.teacher;
      const idGrupo = Number(req.params.id);

      if (
        !Number.isInteger(idGrupo) ||
        idGrupo <= 0
      ) {
        return res.status(400).json({
          message:
            'El identificador del grupo no es válido',
        });
      }

      // Verificar que el grupo pertenezca
      // realmente al docente autenticado.
      const groupsResponse = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/internal/groups/by-teacher/' +
          teacher.id_docente
      );

      if (!groupsResponse.ok) {
        return res.status(503).json({
          message:
            'No fue posible validar los grupos del docente',
        });
      }

      const groupsBody =
        (await groupsResponse.json()) as {
          data?: Array<{
            id_grupo: number;
          }>;
        };

      const belongsToTeacher =
        (groupsBody.data ?? []).some(
          (group) =>
            Number(group.id_grupo) ===
            idGrupo
        );

      if (!belongsToTeacher) {
        return res.status(403).json({
          message:
            'El grupo seleccionado no pertenece al Docente Asesor',
        });
      }

      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/groups/' +
          idGrupo
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);

    } catch (error) {
      console.error(
        'Error consultando detalle del grupo del docente:',
        error
      );

      return res.status(503).json({
        message:
          'Practice Service no disponible',
      });
    }
  }
);


// ========================================================
// CU04 - LISTAR ACTIVIDADES DEL DOCENTE
// ========================================================

app.get(
  '/api/activities',
  requireAuth,
  requireTeacher,
  async (req, res) => {
    try {
      const teacher = res.locals.teacher;

      const groupId =
        typeof req.query.groupId === 'string'
          ? req.query.groupId
          : '';

      const query = groupId
        ? '?groupId=' +
          encodeURIComponent(groupId)
        : '';

      const response = await internalFetch(
        ACTIVITY_SERVICE_URL + '/api/activities/teacher/' +
          teacher.id_docente +
          query
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error consultando actividades:',
        error
      );

      return res.status(503).json({
        message:
          'Activity Service no disponible',
      });
    }
  }
);


// ========================================================
// CU04 - PUBLICAR ACTIVIDAD
// ========================================================

app.post(
  '/api/activities',
  requireAuth,
  requireTeacher,
  audit(AUDIT_EVENTS.actividadCreada),
  async (req, res) => {
    try {
      const teacher = res.locals.teacher;

      const response = await internalFetch(
        ACTIVITY_SERVICE_URL + '/api/activities',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            ...req.body,

            // El Gateway impone el docente real
            id_docente:
              teacher.id_docente,
          }),
        }
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error publicando actividad:',
        error
      );

      return res.status(503).json({
        message:
          'Activity Service no disponible',
      });
    }
  }
);


// ========================================================
// CU04 - DETALLE DE ACTIVIDAD
// ========================================================

app.get(
  '/api/activities/:id',
  requireAuth,
  requireTeacher,
  async (req, res) => {
    try {
      const teacher = res.locals.teacher;

      const response = await internalFetch(
        ACTIVITY_SERVICE_URL + '/api/activities/' +
          encodeURIComponent(
            String(req.params.id)
          ) +
          '?teacherId=' +
          teacher.id_docente
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error consultando actividad:',
        error
      );

      return res.status(503).json({
        message:
          'Activity Service no disponible',
      });
    }
  }
);


// ========================================================
// CU04 - ACTUALIZAR ACTIVIDAD
// ========================================================

app.patch(
  '/api/activities/:id',
  requireAuth,
  requireTeacher,
  audit(AUDIT_EVENTS.actividadActualizada),
  async (req, res) => {
    try {
      const teacher = res.locals.teacher;

      const response = await internalFetch(
        ACTIVITY_SERVICE_URL + '/api/activities/' +
          encodeURIComponent(
          String(req.params.id)
          ),
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            ...req.body,

            // No aceptamos un docente enviado
            // por el navegador.
            id_docente:
              teacher.id_docente,
          }),
        }
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error actualizando actividad:',
        error
      );

      return res.status(503).json({
        message:
          'Activity Service no disponible',
      });
    }
  }
);


// ========================================================
// CU04 - CERRAR ACTIVIDAD
// ========================================================

app.patch(
  '/api/activities/:id/status',
  requireAuth,
  requireTeacher,
  audit(AUDIT_EVENTS.actividadCerrada),
  async (req, res) => {
    try {
      const teacher = res.locals.teacher;

      const response = await internalFetch(
        ACTIVITY_SERVICE_URL + '/api/activities/' +
          encodeURIComponent(
            String(req.params.id)
          ) +
          '/status',
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            id_docente:
              teacher.id_docente,
          }),
        }
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);
    } catch (error) {
      console.error(
        'Error cerrando actividad:',
        error
      );

      return res.status(503).json({
        message:
          'Activity Service no disponible',
      });
    }
  }
);

// ========================================================
// ENTREGAS - DOCENTE ASESOR
// ========================================================

app.get(
  '/api/activities/:id/submissions',
  requireAuth,
  requireTeacher,
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/activities/' +
        encodeURIComponent(String(req.params.id)) +
        '/submissions?teacherId=' +
        res.locals.teacher.id_docente,
      { method: 'GET' },
      'Error consultando entregas de la actividad:'
    )
);

// Calificación y comentario sobre una entrega.
// El docente sale del token, nunca del cuerpo.
app.put(
  '/api/activities/:id/submissions/:idEntrega/feedback',
  requireAuth,
  requireTeacher,
  audit(AUDIT_EVENTS.calificacion),
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/activities/' +
        encodeURIComponent(String(req.params.id)) +
        '/submissions/' +
        encodeURIComponent(String(req.params.idEntrega)) +
        '/feedback',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calificacion: req.body?.calificacion,
          comentario: req.body?.comentario,
          id_docente: res.locals.teacher.id_docente,
        }),
      },
      'Error registrando retroalimentación:'
    )
);

// ========================================================
// HISTORIAL DE SEGUIMIENTO - DOCENTE ASESOR
// Solo grupos del docente autenticado (validado en
// Activity Service contra Practice Service).
// ========================================================

app.get(
  '/api/teacher/follow-up/groups/:idGrupo',
  requireAuth,
  requireTeacher,
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/follow-up/groups/' +
        encodeURIComponent(String(req.params.idGrupo)) +
        '?teacherId=' +
        res.locals.teacher.id_docente,
      { method: 'GET' },
      'Error consultando seguimiento del grupo:'
    )
);

app.get(
  '/api/teacher/follow-up/groups/:idGrupo/students/:idEstudiante',
  requireAuth,
  requireTeacher,
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/follow-up/groups/' +
        encodeURIComponent(String(req.params.idGrupo)) +
        '/students/' +
        encodeURIComponent(String(req.params.idEstudiante)) +
        '?teacherId=' +
        res.locals.teacher.id_docente,
      { method: 'GET' },
      'Error consultando historial del estudiante:'
    )
);

// Bitácora y evaluación final del Tutor Receptor sobre un
// estudiante del grupo (solo lectura). Practice Service
// valida que el grupo sea del docente (ajeno → 404).
app.get(
  '/api/teacher/follow-up/groups/:idGrupo/students/:idEstudiante/tutor-record',
  requireAuth,
  requireTeacher,
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/internal/teachers/' +
        res.locals.teacher.id_docente +
        '/groups/' +
        encodeURIComponent(String(req.params.idGrupo)) +
        '/students/' +
        encodeURIComponent(String(req.params.idEstudiante)) +
        '/tutor-record',
      { method: 'GET' },
      'Error consultando registro del tutor para el docente:'
    )
);

// ========================================================
// DOCENTE - REVISIÓN DE EVIDENCIAS Y VISITAS (CU7, bloque 2)
// El docente sale del token; los servicios validan que el
// grupo / la actividad sean suyos (ajeno → 404).
// ========================================================

function teacherStudentPath(req: Request, _res: Response): string {
  return (
    '/groups/' +
    encodeURIComponent(String(req.params.idGrupo)) +
    '/students/' +
    encodeURIComponent(String(req.params.idEstudiante))
  );
}

app.get(
  '/api/teacher/follow-up/groups/:idGrupo/students/:idEstudiante/evidences',
  requireAuth,
  requireTeacher,
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/follow-up' +
        teacherStudentPath(req, res) +
        '/evidences?teacherId=' +
        res.locals.teacher.id_docente,
      { method: 'GET' },
      'Error consultando evidencias del estudiante:'
    )
);

app.put(
  '/api/teacher/evidences/:idEvidencia/review',
  requireAuth,
  requireTeacher,
  audit(AUDIT_EVENTS.revisionEvidencia),
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/evidences/' +
        encodeURIComponent(String(req.params.idEvidencia)) +
        '/review?teacherId=' +
        res.locals.teacher.id_docente,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observacion: req.body?.observacion,
        }),
      },
      'Error registrando revisión de evidencia:'
    )
);

app.get(
  '/api/teacher/follow-up/groups/:idGrupo/students/:idEstudiante/visits',
  requireAuth,
  requireTeacher,
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/internal/teachers/' +
        res.locals.teacher.id_docente +
        teacherStudentPath(req, res) +
        '/visits',
      { method: 'GET' },
      'Error consultando visitas:'
    )
);

function visitBody(req: Request): RequestInit['body'] {
  return JSON.stringify({
    fecha: req.body?.fecha,
    descripcion: req.body?.descripcion,
    observaciones: req.body?.observaciones,
  });
}

app.post(
  '/api/teacher/follow-up/groups/:idGrupo/students/:idEstudiante/visits',
  requireAuth,
  requireTeacher,
  audit(AUDIT_EVENTS.visitaRegistrada),
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/internal/teachers/' +
        res.locals.teacher.id_docente +
        teacherStudentPath(req, res) +
        '/visits',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: visitBody(req),
      },
      'Error registrando visita:'
    )
);

app.put(
  '/api/teacher/follow-up/groups/:idGrupo/students/:idEstudiante/visits/:idVisita',
  requireAuth,
  requireTeacher,
  audit(AUDIT_EVENTS.visitaCorregida),
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/internal/teachers/' +
        res.locals.teacher.id_docente +
        teacherStudentPath(req, res) +
        '/visits/' +
        encodeURIComponent(String(req.params.idVisita)),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: visitBody(req),
      },
      'Error actualizando visita:'
    )
);

// ========================================================
// TUTOR RECEPTOR - PRACTICANTES A CARGO
// Solo asignaciones donde el tutor del token figura como
// tutor. El seguimiento académico es de solo lectura.
// ========================================================

app.get(
  '/api/tutor/assignments',
  requireAuth,
  requireTutor,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/internal/tutors/' +
          res.locals.tutor.id_tutor +
          '/assignments'
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error(
        'Error consultando asignaciones del tutor:',
        error
      );

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

app.get(
  '/api/tutor/assignments/:id',
  requireAuth,
  requireTutor,
  async (req, res) => {
    let assignment: any;

    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/internal/tutors/' +
          res.locals.tutor.id_tutor +
          '/assignments/' +
          encodeURIComponent(String(req.params.id))
      );

      const body: any = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(body);
      }

      assignment = body.data;
    } catch (error) {
      console.error(
        'Error consultando asignación del tutor:',
        error
      );

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }

    // Sin grupo de seguimiento no hay actividades que
    // mostrar; no es un error.
    if (!assignment.id_grupo) {
      return res.json({
        data: { ...assignment, seguimiento: null },
      });
    }

    try {
      const response = await internalFetch(
        ACTIVITY_SERVICE_URL + '/api/internal/follow-up/groups/' +
          assignment.id_grupo +
          '/students/' +
          assignment.id_estudiante
      );

      const body: any = await response.json();

      if (!response.ok) {
        throw new Error(body?.message ?? 'Error de seguimiento');
      }

      return res.json({
        data: { ...assignment, seguimiento: body.data },
      });
    } catch (error) {
      console.error(
        'Error consultando seguimiento para el tutor:',
        error
      );

      return res.json({
        data: {
          ...assignment,
          seguimiento: null,
          seguimiento_error:
            'No fue posible consultar el seguimiento académico',
        },
      });
    }
  }
);

// ========================================================
// TUTOR RECEPTOR - BITÁCORA DE OBSERVACIONES
// El tutor sale del token; Practice Service valida que la
// asignación sea suya (ajena → 404) y que esté EN_CURSO.
// ========================================================

// Ruta interna de Practice Service para una asignación
// del tutor del token: .../assignments/:id/<recurso>.
function tutorAssignmentPath(
  res: Response,
  idAsignacion: unknown,
  resource: 'observations' | 'evaluation'
) {
  return (
    '/api/internal/tutors/' +
    res.locals.tutor.id_tutor +
    '/assignments/' +
    encodeURIComponent(String(idAsignacion)) +
    '/' +
    resource
  );
}

app.get(
  '/api/tutor/assignments/:id/observations',
  requireAuth,
  requireTutor,
  (req, res) =>
    forwardToPracticeService(
      res,
      tutorAssignmentPath(res, req.params.id, 'observations'),
      { method: 'GET' },
      'Error consultando observaciones del tutor:'
    )
);

app.post(
  '/api/tutor/assignments/:id/observations',
  requireAuth,
  requireTutor,
  audit(AUDIT_EVENTS.observacionRegistrada),
  (req, res) =>
    forwardToPracticeService(
      res,
      tutorAssignmentPath(res, req.params.id, 'observations'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fecha: req.body?.fecha,
          descripcion: req.body?.descripcion,
        }),
      },
      'Error registrando observación del tutor:'
    )
);

app.put(
  '/api/tutor/assignments/:id/observations/:idObservacion',
  requireAuth,
  requireTutor,
  audit(AUDIT_EVENTS.observacionCorregida),
  (req, res) =>
    forwardToPracticeService(
      res,
      tutorAssignmentPath(res, req.params.id, 'observations') +
        '/' +
        encodeURIComponent(String(req.params.idObservacion)),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fecha: req.body?.fecha,
          descripcion: req.body?.descripcion,
        }),
      },
      'Error actualizando observación del tutor:'
    )
);

// Evaluación final del tutor (una por asignación).
app.get(
  '/api/tutor/assignments/:id/evaluation',
  requireAuth,
  requireTutor,
  (req, res) =>
    forwardToPracticeService(
      res,
      tutorAssignmentPath(res, req.params.id, 'evaluation'),
      { method: 'GET' },
      'Error consultando evaluación del tutor:'
    )
);

app.put(
  '/api/tutor/assignments/:id/evaluation',
  requireAuth,
  requireTutor,
  audit(AUDIT_EVENTS.evaluacionTutor),
  (req, res) =>
    forwardToPracticeService(
      res,
      tutorAssignmentPath(res, req.params.id, 'evaluation'),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calificacion: req.body?.calificacion,
          concepto: req.body?.concepto,
          recomienda_aprobacion: req.body?.recomienda_aprobacion,
        }),
      },
      'Error guardando evaluación del tutor:'
    )
);

// Coordinador: bitácora y evaluación del tutor de una
// asignación (solo lectura).
app.get(
  '/api/practice-assignments/:id/tutor-record',
  requireAuth,
  requireCoordinator,
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/practice-assignments/' +
        encodeURIComponent(String(req.params.id)) +
        '/tutor-record',
      { method: 'GET' },
      'Error consultando registro del tutor:'
    )
);

// Coordinador: visitas del docente a una asignación (solo
// lectura), con el nombre del docente si está activo.
app.get(
  '/api/practice-assignments/:id/visits',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL +
          '/api/practice-assignments/' +
          encodeURIComponent(String(req.params.id)) +
          '/visits'
      );

      const body = await response.json();

      if (!response.ok || !Array.isArray(body.data) || body.data.length === 0) {
        return res.status(response.status).json(body);
      }

      const teachers = await fetchInternalData<any[]>(
        USER_SERVICE_URL + '/api/internal/teachers/available'
      );

      const teacherById = new Map(
        (teachers ?? []).map((row) => [Number(row.id_docente), row])
      );

      return res.json({
        data: body.data.map((visit: any) => ({
          ...visit,
          docente: personName(teacherById.get(Number(visit.id_docente))),
        })),
      });
    } catch (error) {
      console.error('Error consultando visitas de la asignación:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

// ========================================================
// COORDINADOR - REPORTE POR PERÍODO ACADÉMICO
// Practice Service arma el consolidado (solo IDs); aquí se
// suman el avance académico (Activity Service) y los
// nombres (User Service). Si un servicio secundario falla,
// el reporte se entrega igual y se informa qué faltó.
// ========================================================

// GET a un servicio interno; devuelve body.data o null.
async function fetchInternalData<T>(url: string): Promise<T | null> {
  try {
    const response = await internalFetch(url);

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { data?: T };

    return body.data ?? null;
  } catch (error) {
    console.error('Error consultando ' + url + ':', error);

    return null;
  }
}

function personName(person: any): string | null {
  return person
    ? `${person.nombres} ${person.apellidos}`.trim()
    : null;
}

app.get(
  '/api/reports/period',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    const periodo =
      typeof req.query.periodo === 'string'
        ? req.query.periodo
        : '';

    let report: any;

    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/internal/reports/period' +
          (periodo
            ? '?periodo=' + encodeURIComponent(periodo)
            : '')
      );

      const body: any = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(body);
      }

      report = body.data;
    } catch (error) {
      console.error('Error consultando reporte del período:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }

    const groupIds: number[] = report.grupos.map(
      (group: any) => group.id_grupo
    );

    const assignmentLists: any[][] = [
      report.cruces.asignacion_sin_grupo,
      report.evaluaciones_tutor.pendientes,
      report.evaluaciones_tutor.sin_tutor,
    ];

    const studentIds = [
      ...new Set<number>([
        ...report.cruces.en_grupo_sin_asignacion.map(
          (row: any) => row.id_estudiante
        ),
        ...assignmentLists.flat().map((row) => row.id_estudiante),
      ]),
    ];

    const tutorIds = [
      ...new Set<number>(
        assignmentLists
          .flat()
          .filter((row) => row.id_tutor !== null)
          .map((row) => row.id_tutor)
      ),
    ];

    const [progress, students, teachers, tutors] =
      await Promise.all([
        groupIds.length
          ? fetchInternalData<any[]>(
              ACTIVITY_SERVICE_URL + '/api/internal/reports/groups-progress?ids=' +
                groupIds.join(',')
            )
          : Promise.resolve([]),
        studentIds.length
          ? fetchInternalData<any[]>(
              USER_SERVICE_URL + '/api/internal/students/by-ids?ids=' +
                studentIds.join(',')
            )
          : Promise.resolve([]),
        fetchInternalData<any[]>(
          USER_SERVICE_URL + '/api/internal/teachers/available'
        ),
        tutorIds.length
          ? fetchInternalData<any[]>(
              USER_SERVICE_URL + '/api/internal/tutors/by-ids?ids=' +
                tutorIds.join(',')
            )
          : Promise.resolve([]),
      ]);

    const progressByGroup = new Map(
      (progress ?? []).map((row) => [Number(row.id_grupo), row])
    );

    const studentById = new Map(
      (students ?? []).map((row) => [Number(row.id_estudiante), row])
    );

    const teacherById = new Map(
      (teachers ?? []).map((row) => [Number(row.id_docente), row])
    );

    const tutorById = new Map(
      (tutors ?? []).map((row) => [Number(row.id_tutor), row])
    );

    const withStudent = (row: any) => {
      const student = studentById.get(Number(row.id_estudiante));

      return {
        ...row,
        estudiante: personName(student),
        codigo_estudiante: student?.codigo_estudiante ?? null,
        estado_estudiante: student?.estado ?? null,
      };
    };

    const withTutor = (row: any) => ({
      ...withStudent(row),
      tutor:
        row.id_tutor === null
          ? null
          : personName(tutorById.get(Number(row.id_tutor))),
    });

    const emptyProgress = {
      actividades: 0,
      actividades_abiertas: 0,
      esperadas: 0,
      entregadas: 0,
      calificadas: 0,
      no_entregadas: 0,
      pendientes: 0,
      promedio: null,
    };

    const avisos: string[] = [];

    if (groupIds.length && progress === null) {
      avisos.push(
        'No fue posible consultar el avance académico (Activity Service).'
      );
    }

    if (
      (studentIds.length && students === null) ||
      teachers === null ||
      (tutorIds.length && tutors === null)
    ) {
      avisos.push(
        'No fue posible consultar algunos nombres (User Service).'
      );
    }

    return res.json({
      data: {
        ...report,
        grupos: report.grupos.map((group: any) => {
          const { id_grupo: _id, ...avance } =
            progressByGroup.get(Number(group.id_grupo)) ?? {
              id_grupo: group.id_grupo,
              ...emptyProgress,
            };

          return {
            ...group,
            docente: personName(
              teacherById.get(Number(group.id_docente))
            ),
            avance: progress === null ? null : avance,
          };
        }),
        cruces: {
          en_grupo_sin_asignacion:
            report.cruces.en_grupo_sin_asignacion.map(withStudent),
          asignacion_sin_grupo:
            report.cruces.asignacion_sin_grupo.map(withTutor),
        },
        evaluaciones_tutor: {
          ...report.evaluaciones_tutor,
          pendientes:
            report.evaluaciones_tutor.pendientes.map(withTutor),
          sin_tutor:
            report.evaluaciones_tutor.sin_tutor.map(withStudent),
        },
        avisos,
      },
    });
  }
);

// ========================================================
// COORDINADOR - GENERACIÓN DE REPORTES (CU "Generar Reportes")
// Tipos: asignaciones, horas, desempeño académico y
// seguimiento docente (el consolidado usa /api/reports/period).
// Formato común para la vista previa y el PDF:
//   { titulo, resumen[], secciones[{ titulo, columnas[], filas[] }] }
// Sin identificadores internos en lo que se muestra.
// ========================================================

type ReportFormat =
  | 'texto'
  | 'entero'
  | 'horas'
  | 'nota'
  | 'fecha'
  | 'porcentaje'
  | 'estado';

interface ReportColumn {
  clave: string;
  etiqueta: string;
  formato?: ReportFormat;
}

interface ReportSection {
  titulo: string;
  descripcion?: string;
  columnas: ReportColumn[];
  filas: Record<string, unknown>[];
}

interface ReportItem {
  etiqueta: string;
  valor: number | string | null;
  formato?: ReportFormat;
}

const REPORT_STATES = ['ASIGNADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA'];

const REPORT_TYPES: Record<string, { titulo: string; filtros: string[] }> = {
  asignaciones: {
    titulo: 'Reporte de asignaciones de práctica',
    filtros: ['programa', 'practica', 'periodo', 'estado', 'desde', 'hasta'],
  },
  horas: {
    titulo: 'Reporte de horas de práctica',
    filtros: ['programa', 'practica', 'periodo', 'estudiante', 'desde', 'hasta'],
  },
  desempeno: {
    titulo: 'Reporte de desempeño académico',
    filtros: ['periodo', 'docente', 'grupo', 'estudiante', 'desde', 'hasta'],
  },
  'seguimiento-docente': {
    titulo: 'Reporte de seguimiento docente',
    filtros: ['periodo', 'docente', 'desde', 'hasta'],
  },
};

function isValidIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
  );
}

// Valida solo los filtros que aplican al tipo; ignora el resto.
function parseReportFilters(
  tipo: string,
  query: Request['query']
): { error: string } | { filtros: Record<string, string> } {
  const allowed = REPORT_TYPES[tipo].filtros;
  const filtros: Record<string, string> = {};

  for (const key of allowed) {
    const raw = query[key];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (!value) {
      continue;
    }

    if (['programa', 'practica', 'estudiante', 'docente', 'grupo'].includes(key)) {
      const n = Number(value);

      if (!Number.isInteger(n) || n <= 0) {
        return { error: 'Uno de los filtros seleccionados no es válido' };
      }
    } else if (key === 'periodo') {
      if (!/^\d{4}-[12]$/.test(value)) {
        return {
          error: 'El período académico debe tener el formato AAAA-1 o AAAA-2',
        };
      }
    } else if (key === 'estado') {
      if (!REPORT_STATES.includes(value)) {
        return { error: 'El estado seleccionado no es válido' };
      }
    } else if (!isValidIsoDate(value)) {
      return { error: 'El rango de fechas no es válido' };
    }

    filtros[key] = value;
  }

  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    return { error: 'La fecha inicial no puede ser posterior a la fecha final' };
  }

  return { filtros };
}

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const text = search.toString();

  return text ? '?' + text : '';
}

// GET interno que debe responder: lanza error si falla.
async function fetchRequired<T>(url: string): Promise<T> {
  const response = await internalFetch(url);
  const body: any = await response.json();

  if (!response.ok) {
    throw new Error(body?.message ?? 'Error consultando ' + url);
  }

  return body.data as T;
}

// Nombres de estudiantes, docentes y tutores (incluye
// inactivos). Si User Service falla se informa en avisos.
async function loadReportPeople(ids: {
  students?: number[];
  teachers?: number[];
  tutors?: number[];
}) {
  const unique = (list?: number[]) =>
    [...new Set((list ?? []).map(Number))].filter((n) => n > 0);

  const studentIds = unique(ids.students);
  const teacherIds = unique(ids.teachers);
  const tutorIds = unique(ids.tutors);

  const byIds = (path: string, list: number[]) =>
    list.length
      ? fetchInternalData<any[]>(
          USER_SERVICE_URL + path + '?ids=' + list.join(',')
        )
      : Promise.resolve([] as any[]);

  const [students, teachers, tutors] = await Promise.all([
    byIds('/api/internal/students/by-ids', studentIds),
    byIds('/api/internal/teachers/by-ids', teacherIds),
    byIds('/api/internal/tutors/by-ids', tutorIds),
  ]);

  const avisos: string[] = [];

  if (students === null || teachers === null || tutors === null) {
    avisos.push('No fue posible consultar algunos nombres (User Service).');
  }

  const index = (rows: any[] | null, key: string) =>
    new Map((rows ?? []).map((row) => [Number(row[key]), row]));

  const studentById = index(students, 'id_estudiante');
  const teacherById = index(teachers, 'id_docente');
  const tutorById = index(tutors, 'id_tutor');

  return {
    avisos,
    student: (id: number) => {
      const row = studentById.get(Number(id));

      return {
        estudiante: personName(row) ?? 'Estudiante sin nombre',
        codigo: row?.codigo_estudiante ?? '—',
      };
    },
    teacher: (id: number) =>
      personName(teacherById.get(Number(id))) ?? 'Docente sin nombre',
    tutor: (id: number | null) =>
      id === null
        ? 'Sin tutor'
        : personName(tutorById.get(Number(id))) ?? 'Tutor sin nombre',
  };
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

// Promedio ponderado de promedios (por cantidad calificada)
function weightedAverage(rows: { promedio: number | null; calificadas: number }[]) {
  const graded = rows.filter((r) => r.promedio !== null && r.calificadas > 0);
  const weight = sumBy(graded, (r) => r.calificadas);

  return weight
    ? round1(sumBy(graded, (r) => (r.promedio as number) * r.calificadas) / weight)
    : null;
}

// ---------- Reporte: asignaciones de práctica ----------
async function buildAssignmentsReport(filtros: Record<string, string>) {
  const rows = await fetchRequired<any[]>(
    PRACTICE_SERVICE_URL +
      '/api/internal/reports/assignments' +
      toQuery(filtros)
  );

  const people = await loadReportPeople({
    students: rows.map((r) => r.id_estudiante),
    tutors: rows.filter((r) => r.id_tutor !== null).map((r) => r.id_tutor),
  });

  const filas = rows.map((r) => ({
    ...people.student(r.id_estudiante),
    programa: r.programa,
    practica: r.practica,
    institucion: r.institucion,
    tutor: people.tutor(r.id_tutor),
    periodo: r.periodo_academico,
    estado: r.estado,
    fecha_inicio: r.fecha_inicio,
    fecha_fin: r.fecha_fin,
    horas_realizadas: r.horas_realizadas,
    horas_requeridas: r.horas_requeridas,
    evaluacion_tutor: r.evaluacion_tutor,
    recomienda:
      r.evaluacion_tutor === null ? '—' : r.recomienda_aprobacion ? 'Sí' : 'No',
  }));

  const count = (estado: string) => rows.filter((r) => r.estado === estado).length;
  const evaluated = rows.filter((r) => r.evaluacion_tutor !== null);

  return {
    avisos: people.avisos,
    resumen: [
      { etiqueta: 'Asignaciones', valor: rows.length, formato: 'entero' },
      {
        etiqueta: 'Estudiantes',
        valor: new Set(rows.map((r) => r.id_estudiante)).size,
        formato: 'entero',
      },
      { etiqueta: 'Asignadas', valor: count('ASIGNADA'), formato: 'entero' },
      { etiqueta: 'En curso', valor: count('EN_CURSO'), formato: 'entero' },
      { etiqueta: 'Finalizadas', valor: count('FINALIZADA'), formato: 'entero' },
      { etiqueta: 'Canceladas', valor: count('CANCELADA'), formato: 'entero' },
      {
        etiqueta: 'Con horas completas',
        valor: rows.filter((r) => r.horas_realizadas >= r.horas_requeridas).length,
        formato: 'entero',
      },
      {
        etiqueta: 'Promedio evaluación del tutor',
        valor: evaluated.length
          ? round1(sumBy(evaluated, (r) => r.evaluacion_tutor) / evaluated.length)
          : null,
        formato: 'nota',
      },
    ] as ReportItem[],
    secciones: [
      {
        titulo: 'Asignaciones',
        columnas: [
          { clave: 'estudiante', etiqueta: 'Estudiante' },
          { clave: 'codigo', etiqueta: 'Código' },
          { clave: 'programa', etiqueta: 'Programa' },
          { clave: 'practica', etiqueta: 'Práctica' },
          { clave: 'institucion', etiqueta: 'Institución' },
          { clave: 'tutor', etiqueta: 'Tutor' },
          { clave: 'periodo', etiqueta: 'Período' },
          { clave: 'estado', etiqueta: 'Estado', formato: 'estado' },
          { clave: 'fecha_inicio', etiqueta: 'Inicio', formato: 'fecha' },
          { clave: 'fecha_fin', etiqueta: 'Fin', formato: 'fecha' },
          { clave: 'horas_realizadas', etiqueta: 'Horas', formato: 'horas' },
          { clave: 'horas_requeridas', etiqueta: 'Requeridas', formato: 'horas' },
          { clave: 'evaluacion_tutor', etiqueta: 'Eval. tutor', formato: 'nota' },
          { clave: 'recomienda', etiqueta: 'Recomienda' },
        ],
        filas,
      },
    ] as ReportSection[],
  };
}

// ---------- Reporte: horas de práctica ----------
async function buildHoursReport(filtros: Record<string, string>) {
  const data = await fetchRequired<{ asignaciones: any[]; registros: any[] }>(
    PRACTICE_SERVICE_URL + '/api/internal/reports/hours' + toQuery(filtros)
  );

  const people = await loadReportPeople({
    students: data.asignaciones.map((r) => r.id_estudiante),
  });

  const withRange = Boolean(filtros.desde || filtros.hasta);
  const byId = new Map(data.asignaciones.map((r) => [r.id_asignacion, r]));

  const resumenFilas = data.asignaciones.map((r) => ({
    ...people.student(r.id_estudiante),
    practica: r.practica,
    institucion: r.institucion,
    periodo: r.periodo_academico,
    estado: r.estado,
    horas_rango: r.horas_rango,
    horas_totales: r.horas_totales,
    horas_requeridas: r.horas_requeridas,
    avance: Math.min(
      100,
      r.horas_requeridas
        ? Math.floor((r.horas_totales / r.horas_requeridas) * 100)
        : 0
    ),
  }));

  const detalle = data.registros.map((r) => {
    const a = byId.get(r.id_asignacion);

    return {
      fecha: r.fecha,
      estudiante: people.student(a?.id_estudiante).estudiante,
      practica: a?.practica ?? '—',
      horas: r.horas,
      observacion: r.observacion ?? '—',
    };
  });

  return {
    avisos: people.avisos,
    resumen: [
      { etiqueta: 'Asignaciones', valor: resumenFilas.length, formato: 'entero' },
      {
        etiqueta: withRange ? 'Horas en el rango' : 'Horas registradas',
        valor: round1(sumBy(data.asignaciones, (r) => r.horas_rango)),
        formato: 'horas',
      },
      { etiqueta: 'Registros', valor: detalle.length, formato: 'entero' },
      {
        etiqueta: 'Con horas completas',
        valor: data.asignaciones.filter((r) => r.horas_totales >= r.horas_requeridas)
          .length,
        formato: 'entero',
      },
    ] as ReportItem[],
    secciones: [
      {
        titulo: 'Horas por estudiante',
        descripcion: withRange
          ? 'Horas del rango de fechas y acumuladas de toda la práctica.'
          : undefined,
        columnas: [
          { clave: 'estudiante', etiqueta: 'Estudiante' },
          { clave: 'codigo', etiqueta: 'Código' },
          { clave: 'practica', etiqueta: 'Práctica' },
          { clave: 'institucion', etiqueta: 'Institución' },
          { clave: 'periodo', etiqueta: 'Período' },
          { clave: 'estado', etiqueta: 'Estado', formato: 'estado' },
          ...(withRange
            ? [{ clave: 'horas_rango', etiqueta: 'En el rango', formato: 'horas' }]
            : []),
          { clave: 'horas_totales', etiqueta: 'Acumuladas', formato: 'horas' },
          { clave: 'horas_requeridas', etiqueta: 'Requeridas', formato: 'horas' },
          { clave: 'avance', etiqueta: 'Avance', formato: 'porcentaje' },
        ],
        filas: resumenFilas,
      },
      {
        titulo: 'Detalle de registros',
        columnas: [
          { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
          { clave: 'estudiante', etiqueta: 'Estudiante' },
          { clave: 'practica', etiqueta: 'Práctica' },
          { clave: 'horas', etiqueta: 'Horas', formato: 'horas' },
          { clave: 'observacion', etiqueta: 'Observación' },
        ],
        filas: detalle,
      },
    ] as ReportSection[],
  };
}

// Grupos de las opciones de reportes filtrados.
async function reportGroups(filtros: Record<string, string>) {
  const options = await fetchRequired<any>(
    PRACTICE_SERVICE_URL + '/api/internal/reports/options'
  );

  const practiceName = new Map(
    options.practicas.map((p: any) => [Number(p.id_practica), p.nombre])
  );

  return (options.grupos as any[])
    .filter(
      (g) =>
        (!filtros.periodo || g.periodo_academico === filtros.periodo) &&
        (!filtros.docente || Number(g.id_docente) === Number(filtros.docente)) &&
        (!filtros.grupo || Number(g.id_grupo) === Number(filtros.grupo))
    )
    .map((g) => ({
      ...g,
      practica: practiceName.get(Number(g.id_practica)) ?? '—',
      estudiantes: (g.estudiantes ?? []).map(Number),
    }));
}

// ---------- Reporte: desempeño académico ----------
async function buildPerformanceReport(filtros: Record<string, string>) {
  const groups = await reportGroups(filtros);

  const rows = groups.length
    ? await fetchRequired<any[]>(
        ACTIVITY_SERVICE_URL +
          '/api/internal/reports/academic' +
          toQuery({
            grupos: groups.map((g) => g.id_grupo).join(','),
            estudiante: filtros.estudiante,
            desde: filtros.desde,
            hasta: filtros.hasta,
          })
      )
    : [];

  const studentFilter = filtros.estudiante ? Number(filtros.estudiante) : null;

  // Integrantes actuales sin actividades aparecen en cero;
  // los retirados aparecen si recibieron actividades.
  const perGroup = groups.map((g) => {
    const own = rows.filter((r) => Number(r.id_grupo) === Number(g.id_grupo));
    const ids = new Set<number>([
      ...own.map((r) => Number(r.id_estudiante)),
      ...g.estudiantes.filter(
        (id: number) => studentFilter === null || id === studentFilter
      ),
    ]);

    return {
      group: g,
      rows: [...ids].map(
        (id) =>
          own.find((r) => Number(r.id_estudiante) === id) ?? {
            id_estudiante: id,
            actividades: 0,
            entregadas: 0,
            no_entregadas: 0,
            calificadas: 0,
            promedio: null,
            evidencias: 0,
            evidencias_revisadas: 0,
          }
      ),
    };
  }).filter((entry) => entry.rows.length > 0);

  const all = perGroup.flatMap((entry) => entry.rows);

  const people = await loadReportPeople({
    students: all.map((r) => r.id_estudiante),
    teachers: perGroup.map((entry) => entry.group.id_docente),
  });

  const columnas: ReportColumn[] = [
    { clave: 'estudiante', etiqueta: 'Estudiante' },
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'actividades', etiqueta: 'Actividades', formato: 'entero' },
    { clave: 'entregadas', etiqueta: 'Entregadas', formato: 'entero' },
    { clave: 'no_entregadas', etiqueta: 'No entregadas', formato: 'entero' },
    { clave: 'cumplimiento', etiqueta: 'Cumplimiento', formato: 'porcentaje' },
    { clave: 'calificadas', etiqueta: 'Calificadas', formato: 'entero' },
    { clave: 'promedio', etiqueta: 'Promedio', formato: 'nota' },
    { clave: 'evidencias', etiqueta: 'Evidencias', formato: 'entero' },
    { clave: 'evidencias_revisadas', etiqueta: 'Revisadas', formato: 'entero' },
  ];

  const totalActividades = sumBy(all, (r) => r.actividades);
  const totalEntregadas = sumBy(all, (r) => r.entregadas);

  return {
    avisos: people.avisos,
    resumen: [
      { etiqueta: 'Grupos', valor: perGroup.length, formato: 'entero' },
      {
        etiqueta: 'Estudiantes',
        valor: new Set(all.map((r) => r.id_estudiante)).size,
        formato: 'entero',
      },
      { etiqueta: 'Actividades asignadas', valor: totalActividades, formato: 'entero' },
      { etiqueta: 'Entregadas', valor: totalEntregadas, formato: 'entero' },
      {
        etiqueta: 'Cumplimiento',
        valor: percent(totalEntregadas, totalActividades),
        formato: 'porcentaje',
      },
      {
        etiqueta: 'Promedio general',
        valor: weightedAverage(all),
        formato: 'nota',
      },
      {
        etiqueta: 'Evidencias revisadas',
        valor: `${sumBy(all, (r) => r.evidencias_revisadas)} de ${sumBy(all, (r) => r.evidencias)}`,
      },
    ] as ReportItem[],
    secciones: perGroup.map(({ group, rows: groupRows }) => ({
      titulo: group.nombre,
      descripcion:
        `${group.practica} · Período ${group.periodo_academico} · ` +
        `Docente: ${people.teacher(group.id_docente)}`,
      columnas,
      filas: groupRows
        .map((r) => {
          const identity = people.student(r.id_estudiante);

          return {
            ...identity,
            estudiante: group.estudiantes.includes(Number(r.id_estudiante))
              ? identity.estudiante
              : identity.estudiante + ' (retirado)',
            actividades: r.actividades,
            entregadas: r.entregadas,
            no_entregadas: r.no_entregadas,
            cumplimiento: percent(r.entregadas, r.actividades),
            calificadas: r.calificadas,
            promedio: r.promedio,
            evidencias: r.evidencias,
            evidencias_revisadas: r.evidencias_revisadas,
          };
        })
        .sort((a, b) => a.estudiante.localeCompare(b.estudiante, 'es')),
    })) as ReportSection[],
  };
}

// ---------- Reporte: seguimiento docente ----------
async function buildTeacherFollowUpReport(filtros: Record<string, string>) {
  const visits = await fetchRequired<any[]>(
    PRACTICE_SERVICE_URL +
      '/api/internal/reports/teacher-visits' +
      toQuery({
        periodo: filtros.periodo,
        docente: filtros.docente,
        desde: filtros.desde,
        hasta: filtros.hasta,
      })
  );

  const academic = visits.length
    ? await fetchRequired<any[]>(
        ACTIVITY_SERVICE_URL +
          '/api/internal/reports/academic' +
          toQuery({
            grupos: visits.map((g) => g.id_grupo).join(','),
            desde: filtros.desde,
            hasta: filtros.hasta,
          })
      )
    : [];

  const people = await loadReportPeople({
    teachers: visits.map((g) => g.id_docente),
  });

  const groups = visits.map((g) => {
    const own = academic.filter((r) => Number(r.id_grupo) === Number(g.id_grupo));
    const entregadas = sumBy(own, (r) => r.entregadas);
    const calificadas = sumBy(own, (r) => r.calificadas);
    const evidencias = sumBy(own, (r) => r.evidencias);
    const revisadas = sumBy(own, (r) => r.evidencias_revisadas);

    return {
      id_docente: Number(g.id_docente),
      grupo: g.nombre,
      docente: people.teacher(g.id_docente),
      practica: g.practica,
      periodo: g.periodo_academico,
      integrantes: g.integrantes,
      visitas: g.visitas,
      sin_visita: g.integrantes - g.estudiantes_visitados,
      entregadas,
      calificadas,
      sin_calificar: entregadas - calificadas,
      evidencias,
      evidencias_revisadas: revisadas,
      evidencias_pendientes: evidencias - revisadas,
    };
  });

  const teacherIds = [...new Set(groups.map((g) => g.id_docente))];

  const perTeacher = teacherIds
    .map((id) => {
      const own = groups.filter((g) => g.id_docente === id);

      return {
        docente: own[0].docente,
        grupos: own.length,
        integrantes: sumBy(own, (g) => g.integrantes),
        visitas: sumBy(own, (g) => g.visitas),
        sin_visita: sumBy(own, (g) => g.sin_visita),
        calificadas: sumBy(own, (g) => g.calificadas),
        sin_calificar: sumBy(own, (g) => g.sin_calificar),
        evidencias_revisadas: sumBy(own, (g) => g.evidencias_revisadas),
        evidencias_pendientes: sumBy(own, (g) => g.evidencias_pendientes),
      };
    })
    .sort((a, b) => a.docente.localeCompare(b.docente, 'es'));

  return {
    avisos: people.avisos,
    resumen: [
      { etiqueta: 'Docentes', valor: perTeacher.length, formato: 'entero' },
      { etiqueta: 'Grupos', valor: groups.length, formato: 'entero' },
      { etiqueta: 'Visitas realizadas', valor: sumBy(groups, (g) => g.visitas), formato: 'entero' },
      {
        etiqueta: 'Estudiantes sin visita',
        valor: sumBy(groups, (g) => g.sin_visita),
        formato: 'entero',
      },
      {
        etiqueta: 'Entregas sin calificar',
        valor: sumBy(groups, (g) => g.sin_calificar),
        formato: 'entero',
      },
      {
        etiqueta: 'Evidencias sin revisar',
        valor: sumBy(groups, (g) => g.evidencias_pendientes),
        formato: 'entero',
      },
    ] as ReportItem[],
    secciones: [
      {
        titulo: 'Resumen por docente',
        columnas: [
          { clave: 'docente', etiqueta: 'Docente asesor' },
          { clave: 'grupos', etiqueta: 'Grupos', formato: 'entero' },
          { clave: 'integrantes', etiqueta: 'Estudiantes', formato: 'entero' },
          { clave: 'visitas', etiqueta: 'Visitas', formato: 'entero' },
          { clave: 'sin_visita', etiqueta: 'Sin visita', formato: 'entero' },
          { clave: 'calificadas', etiqueta: 'Calificadas', formato: 'entero' },
          { clave: 'sin_calificar', etiqueta: 'Sin calificar', formato: 'entero' },
          { clave: 'evidencias_revisadas', etiqueta: 'Evid. revisadas', formato: 'entero' },
          { clave: 'evidencias_pendientes', etiqueta: 'Evid. pendientes', formato: 'entero' },
        ],
        filas: perTeacher,
      },
      {
        titulo: 'Detalle por grupo',
        descripcion:
          'Visitas del docente a la institución de cada integrante; ' +
          'entregas y evidencias de las actividades del grupo.',
        columnas: [
          { clave: 'grupo', etiqueta: 'Grupo' },
          { clave: 'docente', etiqueta: 'Docente' },
          { clave: 'practica', etiqueta: 'Práctica' },
          { clave: 'periodo', etiqueta: 'Período' },
          { clave: 'integrantes', etiqueta: 'Estudiantes', formato: 'entero' },
          { clave: 'visitas', etiqueta: 'Visitas', formato: 'entero' },
          { clave: 'sin_visita', etiqueta: 'Sin visita', formato: 'entero' },
          { clave: 'sin_calificar', etiqueta: 'Sin calificar', formato: 'entero' },
          { clave: 'evidencias_pendientes', etiqueta: 'Evid. pendientes', formato: 'entero' },
        ],
        filas: groups.map(({ id_docente: _id, ...row }) => row),
      },
    ] as ReportSection[],
  };
}

// Opciones de los filtros, con nombres resueltos.
app.get(
  '/api/reports/options',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const options = await fetchRequired<any>(
        PRACTICE_SERVICE_URL + '/api/internal/reports/options'
      );

      const people = await loadReportPeople({
        students: options.estudiantes.map((r: any) => r.id_estudiante),
        teachers: options.grupos.map((g: any) => g.id_docente),
      });

      const students = new Map<number, any>();

      for (const row of options.estudiantes) {
        const id = Number(row.id_estudiante);
        const entry =
          students.get(id) ?? {
            id_estudiante: id,
            ...people.student(id),
            relaciones: [],
          };

        entry.relaciones.push({
          id_practica: row.id_practica,
          id_programa: row.id_programa,
          periodo_academico: row.periodo_academico,
        });
        students.set(id, entry);
      }

      const teacherIds = [
        ...new Set<number>(options.grupos.map((g: any) => Number(g.id_docente))),
      ];

      return res.json({
        data: {
          programas: options.programas,
          practicas: options.practicas,
          periodos: options.periodos,
          estados: REPORT_STATES,
          grupos: options.grupos,
          docentes: teacherIds
            .map((id) => ({ id_docente: id, nombre: people.teacher(id) }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
          estudiantes: [...students.values()].sort((a, b) =>
            a.estudiante.localeCompare(b.estudiante, 'es')
          ),
        },
        avisos: people.avisos,
      });
    } catch (error) {
      console.error('Error consultando opciones de reportes:', error);

      return res.status(503).json({
        message: 'No fue posible cargar las opciones de los reportes',
      });
    }
  }
);

const REPORT_BUILDERS: Record<
  string,
  (filtros: Record<string, string>) => Promise<{
    avisos: string[];
    resumen: ReportItem[];
    secciones: ReportSection[];
  }>
> = {
  asignaciones: buildAssignmentsReport,
  horas: buildHoursReport,
  desempeno: buildPerformanceReport,
  'seguimiento-docente': buildTeacherFollowUpReport,
};

app.get(
  '/api/reports/generate/:tipo',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    const tipo = String(req.params.tipo);

    if (!REPORT_TYPES[tipo]) {
      return res.status(404).json({
        message: 'El tipo de reporte no existe',
      });
    }

    const parsed = parseReportFilters(tipo, req.query);

    if ('error' in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    try {
      const report = await REPORT_BUILDERS[tipo](parsed.filtros);

      return res.json({
        data: {
          tipo,
          titulo: REPORT_TYPES[tipo].titulo,
          filtros: parsed.filtros,
          generado_en: new Date().toISOString(),
          total_registros: sumBy(report.secciones, (s) => s.filas.length),
          resumen: report.resumen,
          secciones: report.secciones,
        },
        avisos: report.avisos,
      });
    } catch (error) {
      console.error('Error generando reporte ' + tipo + ':', error);

      return res.status(503).json({
        message: 'No fue posible generar el reporte. Intente nuevamente',
      });
    }
  }
);

// ========================================================
// HORAS DE PRÁCTICA (CU "Realizar Seguimiento de Prácticas")
// El Coordinador registra, corrige y elimina horas por
// asignación (queda como registrado_por, tomado del token);
// el Estudiante consulta su progreso en Mi Seguimiento.
// ========================================================

app.get(
  '/api/practice-hours',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/practice-hours'
      );

      const body: any = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(body);
      }

      return res.json({
        data: await withAssignmentPeople(body.data ?? []),
      });
    } catch (error) {
      console.error('Error consultando horas de práctica:', error);

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

app.get(
  '/api/practice-hours/:id',
  requireAuth,
  requireCoordinator,
  async (req, res) => {
    try {
      const response = await internalFetch(
        PRACTICE_SERVICE_URL + '/api/practice-hours/' +
          encodeURIComponent(String(req.params.id))
      );

      const body: any = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(body);
      }

      const [data] = await withAssignmentPeople([body.data]);

      return res.json({ data });
    } catch (error) {
      console.error(
        'Error consultando horas de la asignación:',
        error
      );

      return res.status(503).json({
        message: 'Practice Service no disponible',
      });
    }
  }
);

app.post(
  '/api/practice-hours/:id',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.horasRegistradas),
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/practice-hours/' +
        encodeURIComponent(String(req.params.id)),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...req.body,
          registrado_por: res.locals.profile.id_usuario,
        }),
      },
      'Error registrando horas:'
    )
);

app.put(
  '/api/practice-hours/:id/records/:idRegistro',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.horasCorregidas),
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/practice-hours/' +
        encodeURIComponent(String(req.params.id)) +
        '/records/' +
        encodeURIComponent(String(req.params.idRegistro)),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...req.body,
          registrado_por: res.locals.profile.id_usuario,
        }),
      },
      'Error corrigiendo registro de horas:'
    )
);

app.delete(
  '/api/practice-hours/:id/records/:idRegistro',
  requireAuth,
  requireCoordinator,
  audit(AUDIT_EVENTS.horasEliminadas),
  (req, res) =>
    forwardToPracticeService(
      res,
      '/api/practice-hours/' +
        encodeURIComponent(String(req.params.id)) +
        '/records/' +
        encodeURIComponent(String(req.params.idRegistro)),
      { method: 'DELETE' },
      'Error eliminando registro de horas:'
    )
);

// Mi Seguimiento: el id del estudiante sale del token.
app.get(
  '/api/student/follow-up',
  requireAuth,
  requireStudent,
  (_req, res) =>
    forwardToPracticeService(
      res,
      '/api/internal/students/' +
        res.locals.student.id_estudiante +
        '/practice-hours',
      { method: 'GET' },
      'Error consultando seguimiento del estudiante:'
    )
);

// ========================================================
// ENTREGAS - ESTUDIANTE
// El id del estudiante sale siempre del token, nunca del
// cliente: solo puede ver y entregar sus actividades.
// ========================================================

app.get(
  '/api/student/activities',
  requireAuth,
  requireStudent,
  (_req, res) =>
    forwardToActivityService(
      res,
      '/api/student/' +
        res.locals.student.id_estudiante +
        '/activities',
      { method: 'GET' },
      'Error consultando actividades del estudiante:'
    )
);

app.get(
  '/api/student/activities/:id',
  requireAuth,
  requireStudent,
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/student/' +
        res.locals.student.id_estudiante +
        '/activities/' +
        encodeURIComponent(String(req.params.id)),
      { method: 'GET' },
      'Error consultando actividad del estudiante:'
    )
);

app.put(
  '/api/student/activities/:id/submission',
  requireAuth,
  requireStudent,
  audit(AUDIT_EVENTS.entrega),
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/student/' +
        res.locals.student.id_estudiante +
        '/activities/' +
        encodeURIComponent(String(req.params.id)) +
        '/submission',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      },
      'Error registrando entrega:'
    )
);

// ========================================================
// EVIDENCIAS DE ENTREGA
// El archivo llega como binario (application/octet-stream)
// con el nombre original en ?nombre=. Se valida token y rol
// ANTES de leer el cuerpo, y el tamaño se limita a 10 MB.
// ========================================================

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

function rejectLargeUpload(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const length = Number(req.headers['content-length']);

  if (Number.isFinite(length) && length > MAX_EVIDENCE_BYTES) {
    return res.status(413).json({
      message: 'El archivo supera el tamaño máximo de 10 MB',
    });
  }

  next();
}

app.post(
  '/api/student/activities/:id/evidences',
  requireAuth,
  requireStudent,
  audit(AUDIT_EVENTS.evidenciaAdjuntada),
  rejectLargeUpload,
  express.raw({
    type: () => true,
    limit: MAX_EVIDENCE_BYTES,
  }),
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/student/' +
        res.locals.student.id_estudiante +
        '/activities/' +
        encodeURIComponent(String(req.params.id)) +
        '/evidences?nombre=' +
        encodeURIComponent(String(req.query.nombre ?? '')),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.isBuffer(req.body)
          ? new Uint8Array(req.body)
          : new Uint8Array(),
      },
      'Error adjuntando evidencia:'
    )
);

app.delete(
  '/api/student/activities/:id/evidences/:idEvidencia',
  requireAuth,
  requireStudent,
  audit(AUDIT_EVENTS.evidenciaEliminada),
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/student/' +
        res.locals.student.id_estudiante +
        '/activities/' +
        encodeURIComponent(String(req.params.id)) +
        '/evidences/' +
        encodeURIComponent(String(req.params.idEvidencia)),
      { method: 'DELETE' },
      'Error eliminando evidencia:'
    )
);

app.get(
  '/api/student/evidences/:idEvidencia/url',
  requireAuth,
  requireStudent,
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/student/' +
        res.locals.student.id_estudiante +
        '/evidences/' +
        encodeURIComponent(String(req.params.idEvidencia)) +
        '/url',
      { method: 'GET' },
      'Error generando enlace de evidencia:'
    )
);

app.get(
  '/api/activities/:id/evidences/:idEvidencia/url',
  requireAuth,
  requireTeacher,
  (req, res) =>
    forwardToActivityService(
      res,
      '/api/activities/' +
        encodeURIComponent(String(req.params.id)) +
        '/evidences/' +
        encodeURIComponent(String(req.params.idEvidencia)) +
        '/url?teacherId=' +
        res.locals.teacher.id_docente,
      { method: 'GET' },
      'Error generando enlace de evidencia:'
    )
);

// Errores al leer el cuerpo (tamaño excedido, JSON inválido)
app.use(
  (
    error: any,
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({
        message: 'El archivo supera el tamaño máximo de 10 MB',
      });
    }

    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({
        message: 'El cuerpo de la petición no es válido',
      });
    }

    return next(error);
  }
);

// AQUÍ empieza el servidor
const port = process.env.PORT || 3333;

const server = app.listen(port, () => {
  console.log(
    `Listening at http://localhost:${port}/api`
  );
});

server.on('error', console.error);
