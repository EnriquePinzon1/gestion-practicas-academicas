import 'dotenv/config';

import express, {
  NextFunction,
  Request,
  Response,
} from 'express';

import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const app = express();

// ========================================================
// CORS
// ========================================================

app.use((_req, res, next) => {
  res.header(
    'Access-Control-Allow-Origin',
    'http://localhost:4200'
  );

  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );

  next();
});

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

    const response = await fetch(
      `http://localhost:3334/api/internal/users/by-auth/${authUser.id}`
    );

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
  (_req, res) => {
    const user = res.locals.user;

    res.json({
      authenticated: true,
      id: user.id,
      email: user.email,
    });
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
      const response = await fetch(
        'http://localhost:3334/api'
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
      const response = await fetch(
        'http://localhost:3334/api/users'
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
      const response = await fetch(
        'http://localhost:3335/api'
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
      const response = await fetch(
        'http://localhost:3336/api'
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
  async (req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3334/api/users',
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
      const response = await fetch(
        `http://localhost:3334/api/users/${req.params.id}/status`,
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
      const response = await fetch(
        `http://localhost:3334/api/users/${req.params.id}`
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
  async (req, res) => {
    try {
      const response = await fetch(
        `http://localhost:3334/api/users/${req.params.id}`,
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
      const response = await fetch(
        'http://localhost:3335/api/programs'
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
      const response = await fetch(
        'http://localhost:3335/api/programs'
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
      const response = await fetch(
        'http://localhost:3335/api/institutions'
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
  async (req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3335/api/institutions',
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

// Listar prácticas
app.get(
  '/api/practices',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await fetch(
        `http://localhost:3335/api/practices`
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
  async (req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3335/api/practices',
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
      const response = await fetch(
  'http://localhost:3335/api/practices/' + req.params.id
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
  async (req, res) => {
    try {
      const response = await fetch(
        `http://localhost:3335/api/practices/${req.params.id}`,
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
  async (req, res) => {
    try {
      const response = await fetch(
        `http://localhost:3335/api/practices/${req.params.id}/status`,
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
// CU03 - GRUPOS DE PRÁCTICA
// ======================================================

// Docentes disponibles para grupos
app.get(
  '/api/group-options/teachers',
  requireAuth,
  requireCoordinator,
  async (_req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3334/api/internal/teachers/available'
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
      const response = await fetch(
        'http://localhost:3334/api/internal/students/available'
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
      const response = await fetch(
        'http://localhost:3335/api/groups'
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
  async (req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3335/api/groups',
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
      const response = await fetch(
        'http://localhost:3335/api/groups/' +
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
  async (req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3335/api/groups/' +
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
  async (req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3335/api/groups/' +
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
  async (req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3335/api/groups/' +
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

// AQUÍ empieza el servidor
const port = process.env.PORT || 3333;

const server = app.listen(port, () => {
  console.log(
    `Listening at http://localhost:${port}/api`
  );
});

server.on('error', console.error);
