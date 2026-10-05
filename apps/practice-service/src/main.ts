import 'dotenv/config';

import express from 'express';
import { pool } from './database/database';

const app = express();

app.use(express.json());

// Health del microservicio
app.get('/api', (_req, res) => {
  res.json({
    service: 'practice-service',
    status: 'ok',
  });
});

// Health PostgreSQL
app.get('/api/database/health', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT NOW() AS database_time'
    );

    return res.json({
      service: 'practice-service',
      database: 'connected',
      databaseTime: result.rows[0].database_time,
    });
  } catch (error) {
    console.error('Database connection error:', error);

    return res.status(500).json({
      service: 'practice-service',
      database: 'error',
    });
  }
});

// Consultar programas
app.get('/api/programs', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id_programa,
        nombre
      FROM practices.programa
      ORDER BY nombre;
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error('Error querying programs:', error);

    return res.status(500).json({
      message: 'No fue posible consultar los programas académicos',
    });
  }
});
// ========================================================
// REGISTRAR PROGRAMA ACADÉMICO
// ========================================================

app.post('/api/programs', async (req, res) => {
  const { nombre } = req.body;

  if (!nombre?.trim()) {
    return res.status(400).json({
      message: 'El nombre del programa es obligatorio',
    });
  }

  try {
    const duplicate = await pool.query(
      `
      SELECT id_programa
      FROM practices.programa
      WHERE LOWER(nombre) = LOWER($1);
      `,
      [nombre.trim()]
    );

    if (duplicate.rowCount !== 0) {
      return res.status(409).json({
        message: 'Ya existe un programa con ese nombre',
      });
    }

    const result = await pool.query(
      `
      INSERT INTO practices.programa (
        nombre
      )
      VALUES ($1)
      RETURNING
        id_programa,
        nombre;
      `,
      [nombre.trim()]
    );

    return res.status(201).json({
      message: 'Programa académico registrado correctamente',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating program:', error);

    return res.status(500).json({
      message: 'No fue posible registrar el programa académico',
    });
  }
});

const port = process.env.PORT || 3335;

const server = app.listen(port, () => {
  console.log(
    `Practice Service listening at http://localhost:${port}/api`
  );
});

server.on('error', console.error);
