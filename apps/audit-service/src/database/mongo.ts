import { Collection, Db, MongoClient } from 'mongodb';

// ========================================================
// MONGODB (persistencia del registro de auditoría)
// El dominio principal sigue en PostgreSQL; aquí solo se
// guardan eventos de negocio, inmutables y append-only.
// ========================================================

export interface AuditActor {
  id_usuario: number | null;
  auth_user_id: string | null;
  nombre: string | null;
  correo: string | null;
  rol: string | null;
}

export interface AuditEvent {
  tipo: string;
  accion: string;
  modulo: string;
  entidad: {
    tipo: string;
    id: number | null;
  };
  actor: AuditActor;
  detalle: Record<string, unknown>;
  http: {
    metodo: string;
    ruta: string;
    estado: number;
  };
  ocurrido_en: Date;
  registrado_en: Date;
}

const uri = process.env.MONGODB_URI?.trim();

if (!uri) {
  throw new Error('MONGODB_URI no está configurada');
}

const dbName = process.env.MONGODB_DB?.trim() || 'gestion_practicas';

export const client = new MongoClient(uri, {
  // Atlas gratuito: pocas conexiones simultáneas.
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 15_000,
});

let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db) {
    return db;
  }

  await client.connect();
  db = client.db(dbName);

  const events = db.collection<AuditEvent>('eventos');

  // Consultas habituales: más recientes primero, filtradas
  // por módulo, tipo, rol del actor o entidad.
  await Promise.all([
    events.createIndex({ ocurrido_en: -1 }),
    events.createIndex({ modulo: 1, ocurrido_en: -1 }),
    events.createIndex({ tipo: 1, ocurrido_en: -1 }),
    events.createIndex({ 'actor.rol': 1, ocurrido_en: -1 }),
    events.createIndex({ 'entidad.tipo': 1, 'entidad.id': 1 }),
  ]);

  return db;
}

export function eventsCollection(): Collection<AuditEvent> {
  if (!db) {
    throw new Error('MongoDB no está conectado');
  }

  return db.collection<AuditEvent>('eventos');
}
