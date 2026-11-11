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

// Listar prácticas académicas
app.get('/api/practices', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id_practica,
        p.nombre,
        p.descripcion,
        p.horas_requeridas,
        p.estado,
        pr.id_programa,
        pr.nombre AS programa
      FROM practices.practica p

      INNER JOIN practices.programa pr
        ON pr.id_programa = p.id_programa

      ORDER BY p.id_practica DESC
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error(
      'Error consultando prácticas:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar las prácticas académicas',
    });
  }
});

// Crear práctica académica
app.post('/api/practices', async (req, res) => {
  const nombre = String(
    req.body?.nombre ?? ''
  ).trim();

  const descripcion = String(
    req.body?.descripcion ?? ''
  ).trim();

  const idPrograma = Number(
    req.body?.id_programa
  );

  const horasRequeridas = Number(
    req.body?.horas_requeridas
  );

  if (
    !nombre ||
    !descripcion ||
    !Number.isInteger(idPrograma) ||
    idPrograma <= 0 ||
    !Number.isInteger(horasRequeridas) ||
    horasRequeridas <= 0
  ) {
    return res.status(400).json({
      message:
        'Nombre, descripción, programa y horas requeridas son obligatorios. Las horas deben ser mayores que cero.',
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
        message:
          'El programa académico seleccionado no existe',
      });
    }

    const result = await pool.query(
      `
        INSERT INTO practices.practica (
          nombre,
          descripcion,
          id_programa,
          horas_requeridas
        )
        VALUES ($1, $2, $3, $4)

        RETURNING
          id_practica,
          nombre,
          descripcion,
          id_programa,
          horas_requeridas,
          estado
      `,
      [
        nombre,
        descripcion,
        idPrograma,
        horasRequeridas,
      ]
    );

    return res.status(201).json({
      data: result.rows[0],
      message:
        'Práctica académica registrada correctamente',
    });
  } catch (error) {
    console.error(
      'Error creando práctica:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible registrar la práctica académica',
    });
  }
});

// ======================================================
// CONSULTAR PRÁCTICA POR ID
// ======================================================

app.get('/api/practices/:id', async (req, res) => {
  const idPractica = Number(req.params.id);

  if (
    !Number.isInteger(idPractica) ||
    idPractica <= 0
  ) {
    return res.status(400).json({
      message:
        'El identificador de la práctica no es válido',
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
          p.horas_requeridas,
          p.estado
        FROM practices.practica p

        INNER JOIN practices.programa pr
          ON pr.id_programa = p.id_programa

        WHERE p.id_practica = $1
      `,
      [idPractica]
    );

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message:
          'Práctica no encontrada',
      });
    }

    return res.json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error(
      'Error consultando práctica:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar la práctica académica',
    });
  }
});

// ======================================================
// ACTUALIZAR PRÁCTICA
// ======================================================

app.patch('/api/practices/:id', async (req, res) => {
  const idPractica = Number(
    req.params.id
  );

  const nombre = String(
    req.body?.nombre ?? ''
  ).trim();

  const descripcion = String(
    req.body?.descripcion ?? ''
  ).trim();

  const idPrograma = Number(
    req.body?.id_programa
  );

  const horasRequeridas = Number(
    req.body?.horas_requeridas
  );

  if (
    !Number.isInteger(idPractica) ||
    idPractica <= 0
  ) {
    return res.status(400).json({
      message:
        'El identificador de la práctica no es válido',
    });
  }

  if (
    !nombre ||
    !descripcion ||
    !Number.isInteger(idPrograma) ||
    idPrograma <= 0 ||
    !Number.isInteger(horasRequeridas) ||
    horasRequeridas <= 0
  ) {
    return res.status(400).json({
      message:
        'Nombre, descripción, programa y horas requeridas son obligatorios.',
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
        message:
          'Práctica no encontrada',
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
        message:
          'El programa académico seleccionado no existe',
      });
    }

    const result = await pool.query(
      `
        UPDATE practices.practica
        SET
          nombre = $1,
          descripcion = $2,
          id_programa = $3,
          horas_requeridas = $4
        WHERE id_practica = $5

        RETURNING
          id_practica,
          nombre,
          descripcion,
          id_programa,
          horas_requeridas,
          estado
      `,
      [
        nombre,
        descripcion,
        idPrograma,
        horasRequeridas,
        idPractica,
      ]
    );

    return res.json({
      data: result.rows[0],
      message:
        'Práctica académica actualizada correctamente',
    });
  } catch (error) {
    console.error(
      'Error actualizando práctica:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible actualizar la práctica académica',
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
        g.periodo_academico,
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
        g.periodo_academico,
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
  const periodoAcademico = String(
  req.body?.periodo_academico ?? ''
).trim();

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
    !periodoAcademico ||
    !Number.isInteger(idPractica) ||
    idPractica <= 0 ||
    !Number.isInteger(idDocente) ||
    idDocente <= 0
  ) {
    return res.status(400).json({
      message:
        'Nombre, práctica, periodo academico y Docente Asesor son obligatorios',
    });
  }

  if (
  !/^\d{4}-[12]$/.test(periodoAcademico)
) {
  return res.status(400).json({
    message:
      'El periodo académico debe tener el formato AAAA-1 o AAAA-2',
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
          AND periodo_academico = $2
          AND LOWER(nombre) = LOWER($3)
        LIMIT 1
      `,
      [idPractica, periodoAcademico, nombre]
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
          periodo_academico,
          semestre,
          id_docente
        )
        VALUES ($1, $2, $3, $4, $5)

        RETURNING
          id_grupo,
          nombre,
          id_practica,
          periodo_academico,
          semestre,
          id_docente,
          estado
      `,
      [
        nombre,
        idPractica,
        periodoAcademico,
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
          g.periodo_academico,
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
  const idGrupo = Number(
    req.params.id
  );

  const nombre = String(
    req.body?.nombre ?? ''
  ).trim();

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
    !Number.isInteger(idDocente) ||
    idDocente <= 0
  ) {
    return res.status(400).json({
      message:
        'Los datos del grupo no son válidos',
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
      message:
        'El semestre no es válido',
    });
  }

  try {
    const current = await pool.query(
      `
        SELECT
          id_grupo,
          id_practica,
          periodo_academico,
          estado
        FROM practices.grupo
        WHERE id_grupo = $1
      `,
      [idGrupo]
    );

    if ((current.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message:
          'Grupo no encontrado',
      });
    }

    const grupoActual =
      current.rows[0];

    if (
      grupoActual.estado !== 'ACTIVO'
    ) {
      return res.status(409).json({
        message:
          'No es posible editar un grupo cerrado',
      });
    }

    const teachersResponse =
      await fetch(
        'http://localhost:3334/api/internal/teachers/available'
      );

    if (!teachersResponse.ok) {
      return res.status(503).json({
        message:
          'User Service no disponible',
      });
    }

    const teachersBody: any =
      await teachersResponse.json();

    const teacherExists =
      (teachersBody.data ?? []).some(
        (item: any) =>
          Number(item.id_docente) ===
          idDocente
      );

    if (!teacherExists) {
      return res.status(400).json({
        message:
          'El Docente Asesor seleccionado no está disponible',
      });
    }

    const duplicate =
      await pool.query(
        `
          SELECT id_grupo
          FROM practices.grupo
          WHERE
            id_practica = $1
            AND periodo_academico = $2
            AND LOWER(nombre) = LOWER($3)
            AND id_grupo <> $4
        `,
        [
          grupoActual.id_practica,
          grupoActual.periodo_academico,
          nombre,
          idGrupo,
        ]
      );

    if (
      (duplicate.rowCount ?? 0) > 0
    ) {
      return res.status(409).json({
        message:
          'Ya existe otro grupo con ese nombre para la práctica y periodo académico',
      });
    }

    const result =
      await pool.query(
        `
          UPDATE practices.grupo
          SET
            nombre = $1,
            semestre = $2,
            id_docente = $3
          WHERE id_grupo = $4

          RETURNING
            id_grupo,
            nombre,
            id_practica,
            periodo_academico,
            semestre,
            id_docente,
            estado
        `,
        [
          nombre,
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

// ======================================================
// INTERNAL - ESTUDIANTES DE UN GRUPO
// ======================================================

app.get(
  '/api/internal/groups/:idGrupo/students',
  async (req, res) => {
    const idGrupo = Number(
      req.params.idGrupo
    );

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
      const groupResult =
        await pool.query(
          `
            SELECT id_grupo
            FROM practices.grupo
            WHERE id_grupo = $1
          `,
          [idGrupo]
        );

      if (
        (groupResult.rowCount ?? 0) === 0
      ) {
        return res.status(404).json({
          message:
            'Grupo no encontrado',
        });
      }

      const result =
        await pool.query(
          `
            SELECT
              id_estudiante
            FROM practices.grupo_estudiante
            WHERE id_grupo = $1
            ORDER BY id_estudiante
          `,
          [idGrupo]
        );

      return res.json({
        data: result.rows.map(
          (item) =>
            Number(item.id_estudiante)
        ),
      });
    } catch (error) {
      console.error(
        'Error consultando estudiantes del grupo:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar los estudiantes del grupo',
      });
    }
  }
);

// ======================================================
// CU04 - GRUPOS ASIGNADOS A DOCENTE
// ======================================================

app.get(
  '/api/internal/groups/by-teacher/:idDocente',
  async (req, res) => {
    const idDocente = Number(req.params.idDocente);

    if (
      !Number.isInteger(idDocente) ||
      idDocente <= 0
    ) {
      return res.status(400).json({
        message:
          'El identificador del docente no es válido',
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT
            g.id_grupo,
            g.nombre,
            g.semestre,
            g.estado,
            g.id_docente,

            p.id_practica,
            p.nombre AS practica,
            g.periodo_academico,

            COUNT(ge.id_estudiante)::int
              AS total_estudiantes

          FROM practices.grupo g

          INNER JOIN practices.practica p
            ON p.id_practica = g.id_practica

          LEFT JOIN practices.grupo_estudiante ge
            ON ge.id_grupo = g.id_grupo

          WHERE g.id_docente = $1

          GROUP BY
            g.id_grupo,
            g.nombre,
            g.semestre,
            g.estado,
            g.id_docente,
            p.id_practica,
            p.nombre,
            g.periodo_academico

          ORDER BY g.id_grupo DESC
        `,
        [idDocente]
      );

      return res.json({
        data: result.rows,
      });
    } catch (error) {
      console.error(
        'Error consultando grupos del docente:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar los grupos asignados al docente',
      });
    }
  }
);

const port = process.env.PORT || 3335;

const server = app.listen(port, () => {
  console.log(`Practice Service listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
