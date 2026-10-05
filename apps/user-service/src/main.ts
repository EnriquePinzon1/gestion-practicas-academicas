import 'dotenv/config';

import express from 'express';
import { pool } from './database/database';

const app = express();

app.use(express.json());

// Health público interno del microservicio
app.get('/api', (_req, res) => {
  res.json({
    service: 'user-service',
    status: 'ok',
  });
});

// Comprobación de conexión a PostgreSQL
app.get('/api/database/health', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT NOW() AS database_time'
    );

    return res.json({
      service: 'user-service',
      database: 'connected',
      databaseTime: result.rows[0].database_time,
    });
  } catch (error) {
    console.error('Database connection error:', error);

    return res.status(500).json({
      service: 'user-service',
      database: 'error',
    });
  }
});

// Lista inicial de usuarios
app.get('/api/users', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id_usuario,
        u.auth_user_id,
        u.nombres,
        u.apellidos,
        u.tipo_documento,
        u.numero_documento,
        u.correo,
        u.telefono,
        u.estado,
        r.nombre AS rol
      FROM users.usuario u
      INNER JOIN users.rol r
        ON r.id_rol = u.id_rol
      ORDER BY u.id_usuario;
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error('Error querying users:', error);

    return res.status(500).json({
      message: 'No fue posible consultar los usuarios',
    });
  }
});

const port = process.env.PORT || 3334;

const server = app.listen(port, () => {
  console.log(`User Service listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
