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

// ======================================================
// CU03 - GRUPOS DE PRÁCTICA
// ======================================================

// Listar grupos
app.get('/api/groups', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        g.id_grupo,
        g.nombre,
        g.semestre,
        g.id_docente,
        g.estado,

        p.id_practica,
        p.nombre AS practica,

        COUNT(ge.id_estudiante)::int AS total_estudiantes

      FROM practices.grupo g

      INNER JOIN practices.practica p
        ON p.id_practica = g.id_practica

      LEFT JOIN practices.grupo_estudiante ge
        ON ge.id_grupo = g.id_grupo

      GROUP BY
        g.id_grupo,
        g.nombre,
        g.semestre,
        g.id_docente,
        g.estado,
        p.id_practica,
        p.nombre

      ORDER BY g.id_grupo DESC
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error('Error consultando grupos:', error);

    return res.status(500).json({
      message: 'No fue posible consultar los grupos de práctica',
    });
  }
});


// Crear grupo
app.post('/api/groups', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();

  const idPractica = Number(req.body?.id_practica);
  const idDocente = Number(req.body?.id_docente);

  const semestre =
    req.body?.semestre === null ||
    req.body?.semestre === undefined ||
    req.body?.semestre === ''
      ? null
      : Number(req.body.semestre);

  const estudiantes = Array.isArray(req.body?.estudiantes)
    ? req.body.estudiantes.map(Number)
    : [];

  if (
    !nombre ||
    !Number.isInteger(idPractica) ||
    idPractica <= 0 ||
    !Number.isInteger(idDocente) ||
    idDocente <= 0
  ) {
    return res.status(400).json({
      message:
        'Nombre, práctica y Docente Asesor son obligatorios',
    });
  }

  if (
    semestre !== null &&
    (
      !Number.isInteger(semestre) ||
      semestre < 1 ||
      semestre > 20
    )
  ) {
    return res.status(400).json({
      message: 'El semestre no es válido',
    });
  }

  if (estudiantes.length === 0) {
    return res.status(400).json({
      message:
        'Debe seleccionar al menos un estudiante para el grupo',
    });
  }

  const estudiantesUnicos = [...new Set(estudiantes)];

  if (estudiantesUnicos.length !== estudiantes.length) {
    return res.status(400).json({
      message:
        'La lista de estudiantes contiene registros duplicados',
    });
  }

  const client = await pool.connect();

  try {
    // --------------------------------------------------
    // Validar práctica
    // --------------------------------------------------

    const practiceResult = await client.query(
      `
        SELECT
          id_practica,
          estado
        FROM practices.practica
        WHERE id_practica = $1
      `,
      [idPractica]
    );

    if ((practiceResult.rowCount ?? 0) === 0) {
      return res.status(400).json({
        message: 'La práctica seleccionada no existe',
      });
    }

    if (practiceResult.rows[0].estado !== 'ACTIVA') {
      return res.status(400).json({
        message:
          'No es posible crear un grupo para una práctica cerrada',
      });
    }

    // --------------------------------------------------
    // Validar nombre duplicado dentro de la práctica
    // --------------------------------------------------

    const duplicateGroup = await client.query(
      `
        SELECT id_grupo
        FROM practices.grupo
        WHERE
          id_practica = $1
          AND LOWER(nombre) = LOWER($2)
        LIMIT 1
      `,
      [idPractica, nombre]
    );

    if ((duplicateGroup.rowCount ?? 0) > 0) {
      return res.status(409).json({
        message:
          'Ya existe un grupo con ese nombre para la práctica seleccionada',
      });
    }

    // --------------------------------------------------
    // Consultar docentes activos
    // --------------------------------------------------

    const teachersResponse = await fetch(
      'http://localhost:3334/api/internal/teachers/available'
    );

    if (!teachersResponse.ok) {
      return res.status(503).json({
        message: 'User Service no disponible',
      });
    }

    const teachersBody: any =
      await teachersResponse.json();

    const teacherExists = teachersBody.data?.some(
      (teacher: any) =>
        Number(teacher.id_docente) === idDocente
    );

    if (!teacherExists) {
      return res.status(400).json({
        message:
          'El Docente Asesor seleccionado no está disponible',
      });
    }

    // --------------------------------------------------
    // Consultar estudiantes activos
    // --------------------------------------------------

    const studentsResponse = await fetch(
      'http://localhost:3334/api/internal/students/available'
    );

    if (!studentsResponse.ok) {
      return res.status(503).json({
        message: 'User Service no disponible',
      });
    }

    const studentsBody: any =
      await studentsResponse.json();

    const estudiantesDisponibles = new Set(
      (studentsBody.data ?? []).map(
        (student: any) =>
          Number(student.id_estudiante)
      )
    );

    for (const idEstudiante of estudiantesUnicos) {
      if (!estudiantesDisponibles.has(idEstudiante)) {
        return res.status(400).json({
          message:
            'Uno o más estudiantes seleccionados no están disponibles',
        });
      }
    }

    // --------------------------------------------------
    // Validar estudiantes ya asignados a otro grupo activo
    // --------------------------------------------------

    const conflictResult = await client.query(
      `
        SELECT
          ge.id_estudiante,
          g.id_grupo,
          g.nombre
        FROM practices.grupo_estudiante ge

        INNER JOIN practices.grupo g
          ON g.id_grupo = ge.id_grupo

        WHERE
          ge.id_estudiante = ANY($1::int[])
          AND g.estado = 'ACTIVO'
      `,
      [estudiantesUnicos]
    );

    if ((conflictResult.rowCount ?? 0) > 0) {
      return res.status(409).json({
        message:
          'Uno o más estudiantes ya pertenecen a otro grupo activo',
        conflicts: conflictResult.rows,
      });
    }

    // --------------------------------------------------
    // Transacción
    // --------------------------------------------------

    await client.query('BEGIN');

    const groupResult = await client.query(
      `
        INSERT INTO practices.grupo (
          nombre,
          id_practica,
          semestre,
          id_docente
        )
        VALUES ($1, $2, $3, $4)

        RETURNING
          id_grupo,
          nombre,
          id_practica,
          semestre,
          id_docente,
          estado
      `,
      [
        nombre,
        idPractica,
        semestre,
        idDocente,
      ]
    );

    const grupo = groupResult.rows[0];

    for (const idEstudiante of estudiantesUnicos) {
      await client.query(
        `
          INSERT INTO practices.grupo_estudiante (
            id_grupo,
            id_estudiante
          )
          VALUES ($1, $2)
        `,
        [
          grupo.id_grupo,
          idEstudiante,
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      data: {
        ...grupo,
        estudiantes: estudiantesUnicos,
      },
      message: 'Grupo registrado correctamente',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('Error creando grupo:', error);

    return res.status(500).json({
      message: 'No fue posible registrar el grupo de práctica',
    });
  } finally {
    client.release();
  }
});

app.get('/api/groups/:id', async (req, res) => {
  const idGrupo = Number(req.params.id);

  if (!Number.isInteger(idGrupo) || idGrupo <= 0) {
    return res.status(400).json({
      message: 'El identificador del grupo no es válido',
    });
  }

  try {
    const groupResult = await pool.query(
      `
        SELECT
          g.id_grupo,
          g.nombre,
          g.id_practica,
          p.nombre AS practica,
          g.semestre,
          g.id_docente,
          g.estado
        FROM practices.grupo g
        INNER JOIN practices.practica p
          ON p.id_practica = g.id_practica
        WHERE g.id_grupo = $1
      `,
      [idGrupo]
    );

    if ((groupResult.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: 'Grupo no encontrado',
      });
    }

    const studentsResult = await pool.query(
      `
        SELECT id_estudiante
        FROM practices.grupo_estudiante
        WHERE id_grupo = $1
        ORDER BY id_estudiante
      `,
      [idGrupo]
    );

    const teachersResponse = await fetch(
      'http://localhost:3334/api/internal/teachers/available'
    );

    const studentsResponse = await fetch(
      'http://localhost:3334/api/internal/students/available'
    );

    const teachersBody: any =
      teachersResponse.ok
        ? await teachersResponse.json()
        : { data: [] };

    const studentsBody: any =
      studentsResponse.ok
        ? await studentsResponse.json()
        : { data: [] };

    const grupo = groupResult.rows[0];

    const docente =
      (teachersBody.data ?? []).find(
        (item: any) =>
          Number(item.id_docente) ===
          Number(grupo.id_docente)
      ) ?? null;

    const idsIntegrantes = new Set(
      studentsResult.rows.map(
        (item) => Number(item.id_estudiante)
      )
    );

    const integrantes =
      (studentsBody.data ?? []).filter(
        (item: any) =>
          idsIntegrantes.has(
            Number(item.id_estudiante)
          )
      );

    return res.json({
      data: {
        ...grupo,
        docente,
        integrantes,
      },
    });
  } catch (error) {
    console.error(
      'Error consultando grupo:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar el grupo de práctica',
    });
  }
});

app.patch('/api/groups/:id', async (req, res) => {
  const idGrupo = Number(req.params.id);

  const nombre = String(
    req.body?.nombre ?? ''
  ).trim();

  const idPractica = Number(
    req.body?.id_practica
  );

  const idDocente = Number(
    req.body?.id_docente
  );

  const semestre =
    req.body?.semestre === null ||
    req.body?.semestre === undefined ||
    req.body?.semestre === ''
      ? null
      : Number(req.body.semestre);

  if (
    !Number.isInteger(idGrupo) ||
    idGrupo <= 0 ||
    !nombre ||
    !Number.isInteger(idPractica) ||
    idPractica <= 0 ||
    !Number.isInteger(idDocente) ||
    idDocente <= 0
  ) {
    return res.status(400).json({
      message:
        'Los datos del grupo no son válidos',
    });
  }

  try {
    const current = await pool.query(
      `
        SELECT id_grupo, estado
        FROM practices.grupo
        WHERE id_grupo = $1
      `,
      [idGrupo]
    );

    if ((current.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: 'Grupo no encontrado',
      });
    }

    if (current.rows[0].estado !== 'ACTIVO') {
      return res.status(409).json({
        message:
          'No es posible editar un grupo cerrado',
      });
    }

    const practice = await pool.query(
      `
        SELECT id_practica, estado
        FROM practices.practica
        WHERE id_practica = $1
      `,
      [idPractica]
    );

    if ((practice.rowCount ?? 0) === 0) {
      return res.status(400).json({
        message:
          'La práctica seleccionada no existe',
      });
    }

    if (practice.rows[0].estado !== 'ACTIVA') {
      return res.status(400).json({
        message:
          'La práctica seleccionada se encuentra cerrada',
      });
    }

    const teachersResponse = await fetch(
      'http://localhost:3334/api/internal/teachers/available'
    );

    if (!teachersResponse.ok) {
      return res.status(503).json({
        message: 'User Service no disponible',
      });
    }

    const teachersBody: any =
      await teachersResponse.json();

    const teacherExists =
      (teachersBody.data ?? []).some(
        (item: any) =>
          Number(item.id_docente) === idDocente
      );

    if (!teacherExists) {
      return res.status(400).json({
        message:
          'El Docente Asesor seleccionado no está disponible',
      });
    }

    const duplicate = await pool.query(
      `
        SELECT id_grupo
        FROM practices.grupo
        WHERE
          id_practica = $1
          AND LOWER(nombre) = LOWER($2)
          AND id_grupo <> $3
      `,
      [idPractica, nombre, idGrupo]
    );

    if ((duplicate.rowCount ?? 0) > 0) {
      return res.status(409).json({
        message:
          'Ya existe otro grupo con ese nombre para la práctica',
      });
    }

    const result = await pool.query(
      `
        UPDATE practices.grupo
        SET
          nombre = $1,
          id_practica = $2,
          semestre = $3,
          id_docente = $4
        WHERE id_grupo = $5
        RETURNING *
      `,
      [
        nombre,
        idPractica,
        semestre,
        idDocente,
        idGrupo,
      ]
    );

    return res.json({
      data: result.rows[0],
      message:
        'Grupo actualizado correctamente',
    });
  } catch (error) {
    console.error(
      'Error actualizando grupo:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible actualizar el grupo',
    });
  }
});

app.patch(
  '/api/groups/:id/students',
  async (req, res) => {
    const idGrupo = Number(req.params.id);
    const idEstudiante = Number(
      req.body?.id_estudiante
    );

    const action = String(
      req.body?.action ?? ''
    )
      .trim()
      .toUpperCase();

    if (
      !Number.isInteger(idGrupo) ||
      idGrupo <= 0 ||
      !Number.isInteger(idEstudiante) ||
      idEstudiante <= 0 ||
      !['ADD', 'REMOVE'].includes(action)
    ) {
      return res.status(400).json({
        message:
          'La operación sobre el estudiante no es válida',
      });
    }

    try {
      const group = await pool.query(
        `
          SELECT id_grupo, estado
          FROM practices.grupo
          WHERE id_grupo = $1
        `,
        [idGrupo]
      );

      if ((group.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Grupo no encontrado',
        });
      }

      if (group.rows[0].estado !== 'ACTIVO') {
        return res.status(409).json({
          message:
            'No es posible modificar integrantes de un grupo cerrado',
        });
      }

      if (action === 'ADD') {
        const studentsResponse = await fetch(
          'http://localhost:3334/api/internal/students/available'
        );

        if (!studentsResponse.ok) {
          return res.status(503).json({
            message:
              'User Service no disponible',
          });
        }

        const studentsBody: any =
          await studentsResponse.json();

        const studentExists =
          (studentsBody.data ?? []).some(
            (item: any) =>
              Number(item.id_estudiante) ===
              idEstudiante
          );

        if (!studentExists) {
          return res.status(400).json({
            message:
              'El estudiante seleccionado no está disponible',
          });
        }

        const conflict = await pool.query(
          `
            SELECT
              g.id_grupo,
              g.nombre
            FROM practices.grupo_estudiante ge
            INNER JOIN practices.grupo g
              ON g.id_grupo = ge.id_grupo
            WHERE
              ge.id_estudiante = $1
              AND g.estado = 'ACTIVO'
              AND g.id_grupo <> $2
          `,
          [idEstudiante, idGrupo]
        );

        if ((conflict.rowCount ?? 0) > 0) {
          return res.status(409).json({
            message:
              'El estudiante ya pertenece a otro grupo activo',
          });
        }

        await pool.query(
          `
            INSERT INTO practices.grupo_estudiante (
              id_grupo,
              id_estudiante
            )
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `,
          [idGrupo, idEstudiante]
        );

        return res.json({
          message:
            'Estudiante agregado correctamente',
        });
      }

      const result = await pool.query(
        `
          DELETE FROM practices.grupo_estudiante
          WHERE
            id_grupo = $1
            AND id_estudiante = $2
          RETURNING id_estudiante
        `,
        [idGrupo, idEstudiante]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message:
            'El estudiante no pertenece al grupo',
        });
      }

      return res.json({
        message:
          'Estudiante retirado correctamente',
      });
    } catch (error) {
      console.error(
        'Error modificando integrantes:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible modificar los integrantes del grupo',
      });
    }
  }
);

app.patch(
  '/api/groups/:id/status',
  async (req, res) => {
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

    try {
      const result = await pool.query(
        `
          UPDATE practices.grupo
          SET estado = 'CERRADO'
          WHERE
            id_grupo = $1
            AND estado = 'ACTIVO'
          RETURNING
            id_grupo,
            nombre,
            estado
        `,
        [idGrupo]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message:
            'El grupo no existe o ya se encuentra cerrado',
        });
      }

      return res.json({
        data: result.rows[0],
        message:
          'Grupo cerrado correctamente',
      });
    } catch (error) {
      console.error(
        'Error cerrando grupo:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible cerrar el grupo',
      });
    }
  }
);

const port = process.env.PORT || 3335;

const server = app.listen(port, () => {
  console.log(`Practice Service listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
