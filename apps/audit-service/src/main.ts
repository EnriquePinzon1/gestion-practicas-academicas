import 'dotenv/config';
import express from 'express';
import {
  readInternalToken,
  requireInternalToken,
} from '@gestion-practicas/service-http';
import {
  AuditEvent,
  client,
  connectMongo,
  eventsCollection,
} from './database/mongo';
import { Filter } from 'mongodb';

// ========================================================
// AUDIT SERVICE
// Registro inmutable de eventos de negocio (MongoDB).
// Lo alimenta el API Gateway tras cada operación exitosa;
// el Coordinador lo consulta desde /auditoria.
// ========================================================

const INTERNAL_API_TOKEN = readInternalToken();

const MODULOS = [
  'USUARIOS',
  'INSTITUCIONES',
  'PRACTICAS',
  'ASIGNACIONES',
  'GRUPOS',
  'ACTIVIDADES',
  'ENTREGAS',
  'SEGUIMIENTO',
  'TUTOR',
  'HORAS',
] as const;

const MODULOS_SET = new Set<string>(MODULOS);

const ROLES = new Set([
  'COORDINADOR',
  'DOCENTE',
  'ESTUDIANTE',
  'TUTOR_RECEPTOR',
]);

const TIPO_PATTERN = /^[A-Z][A-Z_]{2,59}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 300;
const MAX_DETAIL_KEYS = 20;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const app = express();

app.use(express.json({ limit: '32kb' }));

// Health del microservicio (público: solo indica que responde)
app.get('/api', (_req, res) => {
  return res.json({
    service: 'audit-service',
    status: 'ok',
  });
});

// El resto de rutas solo atiende al Gateway.
app.use('/api', requireInternalToken(INTERNAL_API_TOKEN));

// Health de base de datos
app.get('/api/database/health', async (_req, res) => {
  try {
    await client.db('admin').command({ ping: 1 });

    return res.json({
      service: 'audit-service',
      database: 'connected',
    });
  } catch (error) {
    console.error('Error de conexión a MongoDB:', error);

    return res.status(500).json({
      service: 'audit-service',
      database: 'error',
    });
  }
});

// ========================================================
// UTILIDADES DE VALIDACIÓN
// ========================================================

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function positiveIntOrNull(value: unknown): number | null {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : null;
}

// Solo valores simples: el detalle describe el cambio,
// nunca contiene archivos, respuestas ni textos largos.
function sanitizeDetail(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const detail: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(value).slice(0, MAX_DETAIL_KEYS)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) {
      continue;
    }

    if (raw === null || typeof raw === 'boolean') {
      detail[key] = raw;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      detail[key] = raw;
    } else if (typeof raw === 'string') {
      detail[key] = raw.slice(0, MAX_TEXT);
    } else if (Array.isArray(raw)) {
      detail[key] = raw
        .filter((item) => typeof item === 'string' || typeof item === 'number')
        .slice(0, MAX_DETAIL_KEYS)
        .map((item) => (typeof item === 'string' ? item.slice(0, 60) : item));
    }
  }

  return detail;
}

// AAAA-MM-DD interpretado en hora de Bogotá (UTC-5, sin horario de verano).
function bogotaDayStart(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);

  // Medianoche en Bogotá = 05:00 UTC.
  const date = new Date(Date.UTC(year, month - 1, day, 5));

  // Rechaza fechas imposibles (2026-02-30).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========================================================
// REGISTRAR EVENTO (solo Gateway)
// ========================================================

app.post('/api/events', async (req, res) => {
  const body = req.body ?? {};

  const tipo = text(body.tipo, 60);
  const accion = text(body.accion, 120);
  const modulo = text(body.modulo, 30);
  const entidadTipo = text(body.entidad?.tipo, 40);
  const metodo = text(body.http?.metodo, 10);
  const ruta = text(body.http?.ruta, 300);
  const estadoHttp = Number(body.http?.estado);
  const rol = text(body.actor?.rol, 30);

  if (!tipo || !TIPO_PATTERN.test(tipo)) {
    return res.status(400).json({ message: 'El tipo de evento no es válido' });
  }

  if (!accion) {
    return res.status(400).json({ message: 'La acción es obligatoria' });
  }

  if (!modulo || !MODULOS_SET.has(modulo)) {
    return res.status(400).json({ message: 'El módulo no es válido' });
  }

  if (!entidadTipo) {
    return res.status(400).json({ message: 'La entidad es obligatoria' });
  }

  if (rol !== null && !ROLES.has(rol)) {
    return res.status(400).json({ message: 'El rol del actor no es válido' });
  }

  if (
    !metodo ||
    !ruta ||
    !Number.isInteger(estadoHttp) ||
    estadoHttp < 200 ||
    estadoHttp > 299
  ) {
    return res.status(400).json({
      message: 'Solo se registran operaciones exitosas',
    });
  }

  const now = new Date();
  const ocurrido = new Date(body.ocurrido_en);

  // Se acepta la hora del Gateway salvo que sea inválida o futura.
  const ocurridoEn =
    Number.isNaN(ocurrido.getTime()) || ocurrido > now ? now : ocurrido;

  const event: AuditEvent = {
    tipo,
    accion,
    modulo,
    entidad: {
      tipo: entidadTipo,
      id: positiveIntOrNull(body.entidad?.id),
    },
    actor: {
      id_usuario: positiveIntOrNull(body.actor?.id_usuario),
      auth_user_id: text(body.actor?.auth_user_id, 60),
      nombre: text(body.actor?.nombre, 160),
      correo: text(body.actor?.correo, 160),
      rol,
    },
    detalle: sanitizeDetail(body.detalle),
    http: {
      metodo: metodo.toUpperCase(),
      ruta,
      estado: estadoHttp,
    },
    ocurrido_en: ocurridoEn,
    registrado_en: now,
  };

  try {
    const result = await eventsCollection().insertOne(event);

    return res.status(201).json({
      data: { id: result.insertedId.toHexString() },
    });
  } catch (error) {
    console.error('Error registrando evento de auditoría:', error);

    return res.status(500).json({
      message: 'No fue posible registrar el evento',
    });
  }
});

// ========================================================
// CONSULTAR EVENTOS (Coordinador vía Gateway)
// ?modulo=&tipo=&rol=&desde=&hasta=&q=&page=&limit=
// ========================================================

app.get('/api/events', async (req, res) => {
  const filter: Filter<AuditEvent> = {};

  const modulo = text(req.query.modulo, 30);
  const tipo = text(req.query.tipo, 60);
  const rol = text(req.query.rol, 30);
  const desde = text(req.query.desde, 10);
  const hasta = text(req.query.hasta, 10);
  const q = text(req.query.q, 100);

  if (modulo) {
    if (!MODULOS_SET.has(modulo)) {
      return res.status(400).json({ message: 'El módulo no es válido' });
    }

    filter.modulo = modulo;
  }

  if (tipo) {
    if (!TIPO_PATTERN.test(tipo)) {
      return res.status(400).json({ message: 'El tipo de evento no es válido' });
    }

    filter.tipo = tipo;
  }

  if (rol) {
    if (!ROLES.has(rol)) {
      return res.status(400).json({ message: 'El rol no es válido' });
    }

    filter['actor.rol'] = rol;
  }

  const desdeDate = desde ? bogotaDayStart(desde) : null;
  const hastaDate = hasta ? bogotaDayStart(hasta) : null;

  if ((desde && !desdeDate) || (hasta && !hastaDate)) {
    return res.status(400).json({
      message: 'Las fechas deben tener el formato AAAA-MM-DD',
    });
  }

  if (desdeDate && hastaDate && desdeDate > hastaDate) {
    return res.status(400).json({
      message: 'La fecha inicial no puede ser posterior a la final',
    });
  }

  if (desdeDate || hastaDate) {
    filter.ocurrido_en = {
      ...(desdeDate ? { $gte: desdeDate } : {}),
      // "hasta" incluye todo ese día.
      ...(hastaDate
        ? { $lt: new Date(hastaDate.getTime() + 24 * 3600_000) }
        : {}),
    };
  }

  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');

    filter.$or = [
      { 'actor.nombre': pattern },
      { 'actor.correo': pattern },
      { accion: pattern },
    ];
  }

  const page = Math.max(1, positiveIntOrNull(req.query.page) ?? 1);
  const limit = Math.min(
    MAX_LIMIT,
    positiveIntOrNull(req.query.limit) ?? DEFAULT_LIMIT
  );

  try {
    const events = eventsCollection();

    const [rows, total] = await Promise.all([
      events
        .find(filter, { projection: { registrado_en: 0 } })
        .sort({ ocurrido_en: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      events.countDocuments(filter),
    ]);

    return res.json({
      data: rows.map(({ _id, ...event }) => ({
        id: _id.toHexString(),
        ...event,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error consultando eventos de auditoría:', error);

    return res.status(500).json({
      message: 'No fue posible consultar el registro de auditoría',
    });
  }
});

// Opciones de filtro: tipos de evento que existen realmente.
app.get('/api/events/options', async (_req, res) => {
  try {
    const tipos = await eventsCollection()
      .aggregate<{ _id: string; accion: string; modulo: string; total: number }>([
        {
          $group: {
            _id: '$tipo',
            accion: { $last: '$accion' },
            modulo: { $last: '$modulo' },
            total: { $sum: 1 },
          },
        },
        { $sort: { modulo: 1, accion: 1 } },
      ])
      .toArray();

    return res.json({
      data: {
        modulos: MODULOS,
        roles: [...ROLES],
        tipos: tipos.map((item) => ({
          tipo: item._id,
          accion: item.accion,
          modulo: item.modulo,
          total: item.total,
        })),
      },
    });
  } catch (error) {
    console.error('Error consultando opciones de auditoría:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las opciones de auditoría',
    });
  }
});

// ========================================================
// SERVER
// ========================================================

const port = process.env.PORT || 3337;

connectMongo()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`Listening at http://localhost:${port}/api`);
    });

    server.on('error', console.error);
  })
  .catch((error) => {
    console.error('No fue posible conectar con MongoDB:', error);
    process.exit(1);
  });
