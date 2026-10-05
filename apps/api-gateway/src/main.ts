import 'dotenv/config';

import express, {
  NextFunction,
  Request,
  Response,
} from 'express';

import * as path from 'path';

import { createClient } from '@supabase/supabase-js';

const app = express();
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:4200');
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

// Health público del Gateway
app.get('/api', (_req, res) => {
  res.json({
    message:
      'API Gateway - Gestión de Prácticas Académicas',
  });
});

// Endpoint protegido para comprobar autenticación
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

// User Service
app.get(
  '/api/users/health',
  requireAuth,
  async (_req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3334/api'
      );

      if (!response.ok) {
        return res.status(502).json({
          gateway: 'ok',
          service: 'user-service',
          status: 'error',
        });
      }

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

// Practice Service
app.get(
  '/api/practices/health',
  requireAuth,
  async (_req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3335/api'
      );

      if (!response.ok) {
        return res.status(502).json({
          gateway: 'ok',
          service: 'practice-service',
          status: 'error',
        });
      }

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

// Activity Service
app.get(
  '/api/activities/health',
  requireAuth,
  async (_req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3336/api'
      );

      if (!response.ok) {
        return res.status(502).json({
          gateway: 'ok',
          service: 'activity-service',
          status: 'error',
        });
      }

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
// Consultar usuarios
app.get(
  '/api/users',
  requireAuth,
  async (_req, res) => {
    try {
      const response = await fetch(
        'http://localhost:3334/api/users'
      );

      if (!response.ok) {
        return res.status(502).json({
          message: 'El User Service respondió con error',
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

const port = process.env.PORT || 3333;

const server = app.listen(port, () => {
  console.log(
    `Listening at http://localhost:${port}/api`
  );
});

server.on('error', console.error);
