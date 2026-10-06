import 'dotenv/config';
import express from 'express';
import { pool } from './database/database';

const app = express();

app.use(express.json());

// Health del microservicio
app.get('/api', (_req, res) => {
  return res.json({
    service: 'practice-service',
    status: 'ok',
  });
});

// Health de base de datos
app.get('/api/database/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');

    return res.json({
      service: 'practice-service',
      database: 'connected',
      time: result.rows[0]?.current_time,
    });
  } catch (error) {
    console.error('Error de conexión a base de datos:', error);

    return res.status(500).json({
      service: 'practice-service',
      database: 'error',
    });
  }
});

// ======================================================
// PROGRAMAS ACADÉMICOS
// ======================================================

// Listar programas
app.get('/api/programs', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_programa, nombre
      FROM practices.programa
      ORDER BY nombre ASC
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error('Error consultando programas:', error);

    return res.status(500).json({
      message: 'No fue posible consultar los programas académicos',
    });
  }
});

// Crear programa
app.post('/api/programs', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();

  if (!nombre) {
    return res.status(400).json({
      message: 'El nombre del programa es obligatorio',
    });
  }

  try {
    const existing = await pool.query(
      `
        SELECT id_programa
        FROM practices.programa
        WHERE LOWER(nombre) = LOWER($1)
        LIMIT 1
      `,
      [nombre]
    );

    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({
        message: 'El programa académico ya existe',
      });
    }

    const result = await pool.query(
      `
        INSERT INTO practices.programa (nombre)
        VALUES ($1)
        RETURNING id_programa, nombre
      `,
      [nombre]
    );

    return res.status(201).json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creando programa:', error);

    return res.status(500).json({
      message: 'No fue posible crear el programa académico',
    });
  }
});

// ======================================================
// INSTITUCIONES RECEPTORAS
// ======================================================

// Listar instituciones
app.get('/api/institutions', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_institucion, nombre
      FROM practices.institucion
      ORDER BY nombre ASC
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error('Error consultando instituciones:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las instituciones',
    });
  }
});

// Crear institución
app.post('/api/institutions', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();

  if (!nombre) {
    return res.status(400).json({
      message: 'El nombre de la institución es obligatorio',
    });
  }

  try {
    const existing = await pool.query(
      `
        SELECT id_institucion
        FROM practices.institucion
        WHERE LOWER(nombre) = LOWER($1)
        LIMIT 1
      `,
      [nombre]
    );

    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({
        message: 'La institución ya existe',
      });
    }

    const result = await pool.query(
      `
        INSERT INTO practices.institucion (nombre)
        VALUES ($1)
        RETURNING id_institucion, nombre
      `,
      [nombre]
    );

    return res.status(201).json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creando institución:', error);

    return res.status(500).json({
      message: 'No fue posible crear la institución',
    });
  }
});

// ======================================================
// INICIO DEL SERVIDOR
// ======================================================
// ======================================================
// PRÁCTICAS ACADÉMICAS
// ======================================================

// Listar prácticas
app.get('/api/practices', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id_practica,
        p.nombre,
        p.descripcion,
        p.periodo_academico,
        p.horas_requeridas,
        p.estado,
        pr.id_programa,
        pr.nombre AS programa,
        i.id_institucion,
        i.nombre AS institucion
      FROM practices.practica p
      INNER JOIN practices.programa pr
        ON pr.id_programa = p.id_programa
      INNER JOIN practices.institucion i
        ON i.id_institucion = p.id_institucion
      ORDER BY p.id_practica DESC
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error('Error consultando prácticas:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las prácticas académicas',
    });
  }
});

// Crear práctica
app.post('/api/practices', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const descripcion = String(req.body?.descripcion ?? '').trim();
  const periodoAcademico = String(
    req.body?.periodo_academico ?? ''
  ).trim();

  const idPrograma = Number(req.body?.id_programa);
  const idInstitucion = Number(req.body?.id_institucion);
  const horasRequeridas = Number(req.body?.horas_requeridas);

  if (
    !nombre ||
    !descripcion ||
    !periodoAcademico ||
    !Number.isInteger(idPrograma) ||
    idPrograma <= 0 ||
    !Number.isInteger(idInstitucion) ||
    idInstitucion <= 0 ||
    !Number.isInteger(horasRequeridas) ||
    horasRequeridas <= 0
  ) {
    return res.status(400).json({
      message:
        'Nombre, descripción, programa, institución, periodo académico y horas requeridas son obligatorios. Las horas deben ser mayores que cero.',
    });
  }

  try {
    const program = await pool.query(
      `
        SELECT id_programa
        FROM practices.programa
        WHERE id_programa = $1
      `,
      [idPrograma]
    );

    if ((program.rowCount ?? 0) === 0) {
      return res.status(400).json({
        message: 'El programa académico seleccionado no existe',
      });
    }

    const institution = await pool.query(
      `
        SELECT id_institucion
        FROM practices.institucion
        WHERE id_institucion = $1
      `,
      [idInstitucion]
    );

    if ((institution.rowCount ?? 0) === 0) {
      return res.status(400).json({
        message: 'La institución seleccionada no existe',
      });
    }

    const result = await pool.query(
      `
        INSERT INTO practices.practica (
          nombre,
          descripcion,
          id_programa,
          id_institucion,
          periodo_academico,
          horas_requeridas
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id_practica,
          nombre,
          descripcion,
          id_programa,
          id_institucion,
          periodo_academico,
          horas_requeridas,
          estado
      `,
      [
        nombre,
        descripcion,
        idPrograma,
        idInstitucion,
        periodoAcademico,
        horasRequeridas,
      ]
    );

    return res.status(201).json({
      data: result.rows[0],
      message: 'Práctica registrada correctamente',
    });
  } catch (error) {
    console.error('Error creando práctica:', error);

    return res.status(500).json({
      message: 'No fue posible registrar la práctica académica',
    });
  }
});

// ======================================================
// CONSULTAR PRÁCTICA POR ID
// ======================================================

app.get('/api/practices/:id', async (req, res) => {
  const idPractica = Number(req.params.id);

  if (!Number.isInteger(idPractica) || idPractica <= 0) {
    return res.status(400).json({
      message: 'El identificador de la práctica no es válido',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          p.id_practica,
          p.nombre,
          p.descripcion,
          p.id_programa,
          pr.nombre AS programa,
          p.id_institucion,
          i.nombre AS institucion,
          p.periodo_academico,
          p.horas_requeridas,
          p.estado
        FROM practices.practica p
        INNER JOIN practices.programa pr
          ON pr.id_programa = p.id_programa
        INNER JOIN practices.institucion i
          ON i.id_institucion = p.id_institucion
        WHERE p.id_practica = $1
      `,
      [idPractica]
    );

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: 'Práctica no encontrada',
      });
    }

    return res.json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error consultando práctica:', error);

    return res.status(500).json({
      message: 'No fue posible consultar la práctica académica',
    });
  }
});

// ======================================================
// ACTUALIZAR PRÁCTICA
// ======================================================

app.patch('/api/practices/:id', async (req, res) => {
  const idPractica = Number(req.params.id);

  const nombre = String(req.body?.nombre ?? '').trim();
  const descripcion = String(req.body?.descripcion ?? '').trim();
  const periodoAcademico = String(
    req.body?.periodo_academico ?? ''
  ).trim();

  const idPrograma = Number(req.body?.id_programa);
  const idInstitucion = Number(req.body?.id_institucion);
  const horasRequeridas = Number(req.body?.horas_requeridas);

  if (!Number.isInteger(idPractica) || idPractica <= 0) {
    return res.status(400).json({
      message: 'El identificador de la práctica no es válido',
    });
  }

  if (
    !nombre ||
    !descripcion ||
    !periodoAcademico ||
    !Number.isInteger(idPrograma) ||
    idPrograma <= 0 ||
    !Number.isInteger(idInstitucion) ||
    idInstitucion <= 0 ||
    !Number.isInteger(horasRequeridas) ||
    horasRequeridas <= 0
  ) {
    return res.status(400).json({
      message:
        'Nombre, descripción, programa, institución, periodo académico y horas requeridas son obligatorios. Las horas deben ser mayores que cero.',
    });
  }

  try {
    const practice = await pool.query(
      `
        SELECT id_practica
        FROM practices.practica
        WHERE id_practica = $1
      `,
      [idPractica]
    );

    if ((practice.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: 'Práctica no encontrada',
      });
    }

    const program = await pool.query(
      `
        SELECT id_programa
        FROM practices.programa
        WHERE id_programa = $1
      `,
      [idPrograma]
    );

    if ((program.rowCount ?? 0) === 0) {
      return res.status(400).json({
        message: 'El programa académico seleccionado no existe',
      });
    }

    const institution = await pool.query(
      `
        SELECT id_institucion
        FROM practices.institucion
        WHERE id_institucion = $1
      `,
      [idInstitucion]
    );

    if ((institution.rowCount ?? 0) === 0) {
      return res.status(400).json({
        message: 'La institución seleccionada no existe',
      });
    }

    const result = await pool.query(
      `
        UPDATE practices.practica
        SET
          nombre = $1,
          descripcion = $2,
          id_programa = $3,
          id_institucion = $4,
          periodo_academico = $5,
          horas_requeridas = $6
        WHERE id_practica = $7
        RETURNING *
      `,
      [
        nombre,
        descripcion,
        idPrograma,
        idInstitucion,
        periodoAcademico,
        horasRequeridas,
        idPractica,
      ]
    );

    return res.json({
      data: result.rows[0],
      message: 'Práctica actualizada correctamente',
    });
  } catch (error) {
    console.error('Error actualizando práctica:', error);

    return res.status(500).json({
      message: 'No fue posible actualizar la práctica académica',
    });
  }
});

// ======================================================
// CERRAR PRÁCTICA
// ======================================================

app.patch('/api/practices/:id/status', async (req, res) => {
  const idPractica = Number(req.params.id);
  const estado = String(req.body?.estado ?? '').trim().toUpperCase();

  if (!Number.isInteger(idPractica) || idPractica <= 0) {
    return res.status(400).json({
      message: 'El identificador de la práctica no es válido',
    });
  }

  if (estado !== 'CERRADA') {
    return res.status(400).json({
      message: 'El estado permitido para esta operación es CERRADA',
    });
  }

  try {
    const result = await pool.query(
      `
        UPDATE practices.practica
        SET estado = 'CERRADA'
        WHERE id_practica = $1
        RETURNING
          id_practica,
          nombre,
          estado
      `,
      [idPractica]
    );

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: 'Práctica no encontrada',
      });
    }

    return res.json({
      data: result.rows[0],
      message: 'Práctica cerrada correctamente',
    });
  } catch (error) {
    console.error('Error cerrando práctica:', error);

    return res.status(500).json({
      message: 'No fue posible cerrar la práctica académica',
    });
  }
});

const port = process.env.PORT || 3335;

const server = app.listen(port, () => {
  console.log(`Practice Service listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
