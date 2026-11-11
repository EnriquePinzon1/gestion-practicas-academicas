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

  if (nombre.length > 180) {
    return res.status(400).json({
      message:
        'El nombre de la institución no puede superar 180 caracteres',
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
// INSTITUCIÓN RECEPTORA - DETALLE Y TUTORES VINCULADOS
// practices.institucion_tutor indica en qué institución
// puede actuar cada Tutor Receptor. Los vínculos no se
// eliminan: se desactivan para conservar el historial.
// ======================================================

function parsePositiveId(value: unknown): number | null {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findInstitution(idInstitucion: number) {
  const result = await pool.query(
    `
      SELECT id_institucion, nombre
      FROM practices.institucion
      WHERE id_institucion = $1
    `,
    [idInstitucion]
  );

  return result.rows[0] ?? null;
}

// Tutores receptores activos según User Service.
// Lanza error si el servicio no responde.
async function fetchAvailableTutors(): Promise<
  Map<number, any>
> {
  const response = await fetch(
    'http://localhost:3334/api/internal/tutors/available'
  );

  if (!response.ok) {
    throw new Error('USER_SERVICE_UNAVAILABLE');
  }

  const body: any = await response.json();

  return new Map(
    (body.data ?? []).map((tutor: any) => [
      Number(tutor.id_tutor),
      tutor,
    ])
  );
}

// Detalle de institución
app.get('/api/institutions/:id', async (req, res) => {
  const idInstitucion = parsePositiveId(req.params.id);

  if (!idInstitucion) {
    return res.status(400).json({
      message: 'El identificador de la institución no es válido',
    });
  }

  try {
    const institucion = await findInstitution(idInstitucion);

    if (!institucion) {
      return res.status(404).json({
        message: 'Institución receptora no encontrada',
      });
    }

    return res.json({ data: institucion });
  } catch (error) {
    console.error('Error consultando institución:', error);

    return res.status(500).json({
      message: 'No fue posible consultar la institución',
    });
  }
});

// Tutores vinculados a una institución
// Devuelve nombre y cargo del tutor (User Service).
// tutor_activo = false si el usuario ya no está activo.
app.get('/api/institutions/:id/tutors', async (req, res) => {
  const idInstitucion = parsePositiveId(req.params.id);

  if (!idInstitucion) {
    return res.status(400).json({
      message: 'El identificador de la institución no es válido',
    });
  }

  try {
    const institucion = await findInstitution(idInstitucion);

    if (!institucion) {
      return res.status(404).json({
        message: 'Institución receptora no encontrada',
      });
    }

    const result = await pool.query(
      `
        SELECT
          id_institucion_tutor,
          id_institucion,
          id_tutor,
          activo,
          creado_en
        FROM practices.institucion_tutor
        WHERE id_institucion = $1
        ORDER BY activo DESC, creado_en DESC
      `,
      [idInstitucion]
    );

    let tutores: Map<number, any>;

    try {
      tutores = await fetchAvailableTutors();
    } catch {
      return res.status(503).json({
        message: 'User Service no disponible',
      });
    }

    const data = result.rows.map((row) => {
      const tutor = tutores.get(Number(row.id_tutor));

      return {
        ...row,
        nombres: tutor?.nombres ?? null,
        apellidos: tutor?.apellidos ?? null,
        correo: tutor?.correo ?? null,
        cargo: tutor?.cargo ?? null,
        tutor_activo: Boolean(tutor),
      };
    });

    return res.json({ data });
  } catch (error) {
    console.error('Error consultando tutores de la institución:', error);

    return res.status(500).json({
      message:
        'No fue posible consultar los tutores de la institución',
    });
  }
});

// Vincular tutor a institución
// Si el vínculo existía inactivo, se reactiva.
app.post('/api/institutions/:id/tutors', async (req, res) => {
  const idInstitucion = parsePositiveId(req.params.id);
  const idTutor = parsePositiveId(req.body?.id_tutor);

  if (!idInstitucion) {
    return res.status(400).json({
      message: 'El identificador de la institución no es válido',
    });
  }

  if (!idTutor) {
    return res.status(400).json({
      message: 'Debe seleccionar un Tutor Receptor',
    });
  }

  try {
    const institucion = await findInstitution(idInstitucion);

    if (!institucion) {
      return res.status(404).json({
        message: 'Institución receptora no encontrada',
      });
    }

    let tutores: Map<number, any>;

    try {
      tutores = await fetchAvailableTutors();
    } catch {
      return res.status(503).json({
        message: 'User Service no disponible',
      });
    }

    if (!tutores.has(idTutor)) {
      return res.status(400).json({
        message:
          'El Tutor Receptor seleccionado no está disponible',
      });
    }

    const existing = await pool.query(
      `
        SELECT id_institucion_tutor, activo
        FROM practices.institucion_tutor
        WHERE id_institucion = $1
          AND id_tutor = $2
      `,
      [idInstitucion, idTutor]
    );

    if (existing.rows[0]?.activo === true) {
      return res.status(409).json({
        message:
          'El Tutor Receptor ya está vinculado a esta institución',
      });
    }

    if (existing.rows[0]) {
      const reactivated = await pool.query(
        `
          UPDATE practices.institucion_tutor
          SET activo = TRUE
          WHERE id_institucion_tutor = $1
          RETURNING
            id_institucion_tutor,
            id_institucion,
            id_tutor,
            activo,
            creado_en
        `,
        [existing.rows[0].id_institucion_tutor]
      );

      return res.json({
        data: reactivated.rows[0],
        message:
          'Se reactivó la vinculación del Tutor Receptor con la institución',
      });
    }

    const created = await pool.query(
      `
        INSERT INTO practices.institucion_tutor (
          id_institucion,
          id_tutor
        )
        VALUES ($1, $2)
        RETURNING
          id_institucion_tutor,
          id_institucion,
          id_tutor,
          activo,
          creado_en
      `,
      [idInstitucion, idTutor]
    );

    return res.status(201).json({
      data: created.rows[0],
      message:
        'Tutor Receptor vinculado correctamente a la institución',
    });
  } catch (error) {
    console.error('Error vinculando tutor a institución:', error);

    return res.status(500).json({
      message:
        'No fue posible vincular el Tutor Receptor a la institución',
    });
  }
});

// Activar / desactivar vínculo institución-tutor
app.patch(
  '/api/institutions/:id/tutors/:idTutor/status',
  async (req, res) => {
    const idInstitucion = parsePositiveId(req.params.id);
    const idTutor = parsePositiveId(req.params.idTutor);
    const activo = req.body?.activo;

    if (!idInstitucion || !idTutor) {
      return res.status(400).json({
        message: 'La vinculación indicada no es válida',
      });
    }

    if (typeof activo !== 'boolean') {
      return res.status(400).json({
        message:
          'Debe indicar si la vinculación queda activa o inactiva',
      });
    }

    try {
      const current = await pool.query(
        `
          SELECT id_institucion_tutor, activo
          FROM practices.institucion_tutor
          WHERE id_institucion = $1
            AND id_tutor = $2
        `,
        [idInstitucion, idTutor]
      );

      if (!current.rows[0]) {
        return res.status(404).json({
          message:
            'El Tutor Receptor no está vinculado a esta institución',
        });
      }

      if (current.rows[0].activo === activo) {
        return res.status(409).json({
          message: activo
            ? 'La vinculación ya se encuentra activa'
            : 'La vinculación ya se encuentra inactiva',
        });
      }

      // Reactivar exige que el tutor siga activo.
      if (activo) {
        let tutores: Map<number, any>;

        try {
          tutores = await fetchAvailableTutors();
        } catch {
          return res.status(503).json({
            message: 'User Service no disponible',
          });
        }

        if (!tutores.has(idTutor)) {
          return res.status(400).json({
            message:
              'El Tutor Receptor no se encuentra activo',
          });
        }
      }

      const updated = await pool.query(
        `
          UPDATE practices.institucion_tutor
          SET activo = $1
          WHERE id_institucion_tutor = $2
          RETURNING
            id_institucion_tutor,
            id_institucion,
            id_tutor,
            activo,
            creado_en
        `,
        [activo, current.rows[0].id_institucion_tutor]
      );

      return res.json({
        data: updated.rows[0],
        message: activo
          ? 'Vinculación activada correctamente'
          : 'Vinculación desactivada correctamente',
      });
    } catch (error) {
      console.error(
        'Error actualizando vinculación institución-tutor:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible actualizar la vinculación del Tutor Receptor',
      });
    }
  }
);

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
// ASIGNACIONES INDIVIDUALES DE PRÁCTICA
// ======================================================

// ------------------------------------------------------
// Listar asignaciones
// ------------------------------------------------------

app.get('/api/practice-assignments', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id_asignacion,
        a.id_estudiante,
        a.id_practica,
        p.nombre AS practica,
        p.id_programa,
        a.id_institucion,
        i.nombre AS institucion,
        a.id_tutor,
        a.periodo_academico,
        a.estado,
        a.fecha_inicio,
        a.fecha_fin,
        a.creado_en,
        a.actualizado_en

      FROM practices.asignacion_practica a

      INNER JOIN practices.practica p
        ON p.id_practica = a.id_practica

      INNER JOIN practices.institucion i
        ON i.id_institucion = a.id_institucion

      ORDER BY
        a.creado_en DESC,
        a.id_asignacion DESC
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error(
      'Error consultando asignaciones de práctica:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar las asignaciones de práctica',
    });
  }
});

// ------------------------------------------------------
// Consultar asignación por ID
// ------------------------------------------------------

app.get(
  '/api/practice-assignments/:id',
  async (req, res) => {
    const idAsignacion = Number(req.params.id);

    if (
      !Number.isInteger(idAsignacion) ||
      idAsignacion <= 0
    ) {
      return res.status(400).json({
        message:
          'El identificador de la asignación no es válido',
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT
            a.id_asignacion,
            a.id_estudiante,
            a.id_practica,
            p.nombre AS practica,
            p.id_programa,
            a.id_institucion,
            i.nombre AS institucion,
            a.id_tutor,
            a.periodo_academico,
            a.estado,
            a.fecha_inicio,
            a.fecha_fin,
            a.creado_en,
            a.actualizado_en

          FROM practices.asignacion_practica a

          INNER JOIN practices.practica p
            ON p.id_practica = a.id_practica

          INNER JOIN practices.institucion i
            ON i.id_institucion = a.id_institucion

          WHERE a.id_asignacion = $1
        `,
        [idAsignacion]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message:
            'Asignación de práctica no encontrada',
        });
      }

      return res.json({
        data: result.rows[0],
      });
    } catch (error) {
      console.error(
        'Error consultando asignación de práctica:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar la asignación de práctica',
      });
    }
  }
);

// ------------------------------------------------------
// Crear asignación individual
// ------------------------------------------------------

app.post(
  '/api/practice-assignments',
  async (req, res) => {
    const idEstudiante = Number(
      req.body?.id_estudiante
    );

    const idPractica = Number(
      req.body?.id_practica
    );

    const idInstitucion = Number(
      req.body?.id_institucion
    );

    const idTutor =
      req.body?.id_tutor === null ||
      req.body?.id_tutor === undefined ||
      req.body?.id_tutor === ''
        ? null
        : Number(req.body.id_tutor);

    const periodoAcademico = String(
      req.body?.periodo_academico ?? ''
    ).trim();

    if (
      !Number.isInteger(idEstudiante) ||
      idEstudiante <= 0 ||
      !Number.isInteger(idPractica) ||
      idPractica <= 0 ||
      !Number.isInteger(idInstitucion) ||
      idInstitucion <= 0 ||
      !periodoAcademico
    ) {
      return res.status(400).json({
        message:
          'Estudiante, práctica, institución y periodo académico son obligatorios',
      });
    }

    if (
      idTutor !== null &&
      (
        !Number.isInteger(idTutor) ||
        idTutor <= 0
      )
    ) {
      return res.status(400).json({
        message:
          'El Tutor Receptor seleccionado no es válido',
      });
    }

    if (
      !/^\d{4}-[12]$/.test(
        periodoAcademico
      )
    ) {
      return res.status(400).json({
        message:
          'El periodo académico debe tener el formato AAAA-1 o AAAA-2',
      });
    }

    try {
      // ----------------------------------------------
      // Validar práctica curricular
      // ----------------------------------------------

      const practiceResult =
        await pool.query(
          `
            SELECT
              id_practica,
              id_programa,
              estado
            FROM practices.practica
            WHERE id_practica = $1
          `,
          [idPractica]
        );

      if (
        (practiceResult.rowCount ?? 0) === 0
      ) {
        return res.status(400).json({
          message:
            'La práctica académica seleccionada no existe',
        });
      }

      const practica =
        practiceResult.rows[0];

      if (
        practica.estado !== 'ACTIVA'
      ) {
        return res.status(400).json({
          message:
            'No es posible crear una asignación para una práctica cerrada',
        });
      }

      // ----------------------------------------------
      // Validar institución receptora
      // ----------------------------------------------

      const institutionResult =
        await pool.query(
          `
            SELECT id_institucion
            FROM practices.institucion
            WHERE id_institucion = $1
          `,
          [idInstitucion]
        );

      if (
        (institutionResult.rowCount ?? 0) === 0
      ) {
        return res.status(400).json({
          message:
            'La institución receptora seleccionada no existe',
        });
      }

      // ----------------------------------------------
      // Validar estudiante activo en User Service
      // ----------------------------------------------

      const studentsResponse =
        await fetch(
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

      const estudiante =
        (studentsBody.data ?? []).find(
          (student: any) =>
            Number(
              student.id_estudiante
            ) === idEstudiante
        );

      if (!estudiante) {
        return res.status(400).json({
          message:
            'El estudiante seleccionado no está disponible',
        });
      }

      // ----------------------------------------------
      // Validar compatibilidad estudiante-práctica
      // ----------------------------------------------

      if (
        Number(estudiante.id_programa) !==
        Number(practica.id_programa)
      ) {
        return res.status(400).json({
          message:
            'El estudiante y la práctica académica pertenecen a programas diferentes',
        });
      }

      // ----------------------------------------------
      // Validar tutor receptor, si fue seleccionado
      // ----------------------------------------------

      if (idTutor !== null) {
        const tutorsResponse =
          await fetch(
            'http://localhost:3334/api/internal/tutors/available'
          );

        if (!tutorsResponse.ok) {
          return res.status(503).json({
            message:
              'User Service no disponible',
          });
        }

        const tutorsBody: any =
          await tutorsResponse.json();

        const tutorExiste =
          (tutorsBody.data ?? []).some(
            (tutor: any) =>
              Number(tutor.id_tutor) ===
              idTutor
          );

        if (!tutorExiste) {
          return res.status(400).json({
            message:
              'El Tutor Receptor seleccionado no está disponible',
          });
        }

        const tutorInstitution =
          await pool.query(
            `
              SELECT id_institucion_tutor
              FROM practices.institucion_tutor
              WHERE
                id_institucion = $1
                AND id_tutor = $2
                AND activo = TRUE
              LIMIT 1
            `,
            [
              idInstitucion,
              idTutor,
            ]
          );

        if (
          (tutorInstitution.rowCount ?? 0) ===
          0
        ) {
          return res.status(400).json({
            message:
              'El Tutor Receptor seleccionado no está asociado a la institución receptora',
          });
        }
      }

      // ----------------------------------------------
      // Validar asignación vigente duplicada
      // ----------------------------------------------

      const existingAssignment =
        await pool.query(
          `
            SELECT id_asignacion
            FROM practices.asignacion_practica
            WHERE
              id_estudiante = $1
              AND id_practica = $2
              AND periodo_academico = $3
              AND estado IN (
                'ASIGNADA',
                'EN_CURSO'
              )
            LIMIT 1
          `,
          [
            idEstudiante,
            idPractica,
            periodoAcademico,
          ]
        );

      if (
        (existingAssignment.rowCount ?? 0) >
        0
      ) {
        return res.status(409).json({
          message:
            'El estudiante ya tiene una asignación vigente para esta práctica y periodo académico',
        });
      }

      // ----------------------------------------------
      // Crear asignación
      // ----------------------------------------------

      const result = await pool.query(
        `
          INSERT INTO practices.asignacion_practica (
            id_estudiante,
            id_practica,
            id_institucion,
            id_tutor,
            periodo_academico
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5
          )

          RETURNING
            id_asignacion,
            id_estudiante,
            id_practica,
            id_institucion,
            id_tutor,
            periodo_academico,
            estado,
            fecha_inicio,
            fecha_fin,
            creado_en,
            actualizado_en
        `,
        [
          idEstudiante,
          idPractica,
          idInstitucion,
          idTutor,
          periodoAcademico,
        ]
      );

      return res.status(201).json({
        data: result.rows[0],
        message:
          'Asignación de práctica registrada correctamente',
      });
    } catch (error) {
      if (
        (error as { code?: string })
          ?.code === '23505'
      ) {
        return res.status(409).json({
          message:
            'Ya existe una asignación vigente para el estudiante, práctica y periodo seleccionados',
        });
      }

      console.error(
        'Error creando asignación de práctica:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible registrar la asignación de práctica',
      });
    }
  }
);

// ------------------------------------------------------
// Cambiar estado de una asignación
// ------------------------------------------------------

app.patch(
  '/api/practice-assignments/:id/status',
  async (req, res) => {
    const idAsignacion = Number(
      req.params.id
    );

    const nuevoEstado = String(
      req.body?.estado ?? ''
    )
      .trim()
      .toUpperCase();

    if (
      !Number.isInteger(idAsignacion) ||
      idAsignacion <= 0
    ) {
      return res.status(400).json({
        message:
          'El identificador de la asignación no es válido',
      });
    }

    const estadosPermitidos = [
      'EN_CURSO',
      'FINALIZADA',
      'CANCELADA',
    ];

    if (
      !estadosPermitidos.includes(
        nuevoEstado
      )
    ) {
      return res.status(400).json({
        message:
          'El estado solicitado no es válido',
      });
    }

    try {
      const currentResult =
        await pool.query(
          `
            SELECT
              id_asignacion,
              estado,
              id_tutor
            FROM practices.asignacion_practica
            WHERE id_asignacion = $1
          `,
          [idAsignacion]
        );

      if (
        (currentResult.rowCount ?? 0) === 0
      ) {
        return res.status(404).json({
          message:
            'Asignación de práctica no encontrada',
        });
      }

      const estadoActual =
        currentResult.rows[0].estado;

      const transiciones: Record<
        string,
        string[]
      > = {
        ASIGNADA: [
          'EN_CURSO',
          'CANCELADA',
        ],
        EN_CURSO: [
          'FINALIZADA',
          'CANCELADA',
        ],
        FINALIZADA: [],
        CANCELADA: [],
      };

      if (
        !(
          transiciones[estadoActual] ??
          []
        ).includes(nuevoEstado)
      ) {
        return res.status(409).json({
          message:
            `No es posible cambiar una asignación de ${estadoActual} a ${nuevoEstado}`,
        });
      }

      // Con tutor, la práctica no se cierra sin el concepto
      // de la institución (evaluación final del tutor).
      if (
        nuevoEstado === 'FINALIZADA' &&
        currentResult.rows[0].id_tutor !== null &&
        !(await findEvaluation(idAsignacion))
      ) {
        return res.status(409).json({
          message:
            'El Tutor Receptor debe registrar la evaluación final antes de finalizar la práctica',
        });
      }

      const result = await pool.query(
        `
          UPDATE practices.asignacion_practica

SET
  estado = $1::VARCHAR(20),

  fecha_inicio =
    CASE
      WHEN $1::VARCHAR(20) = 'EN_CURSO'
      THEN COALESCE(
        fecha_inicio,
        CURRENT_DATE
      )
      ELSE fecha_inicio
    END,

  fecha_fin =
    CASE
      WHEN $1::VARCHAR(20) = 'FINALIZADA'
      THEN COALESCE(
        fecha_fin,
        CURRENT_DATE
      )
      ELSE fecha_fin
    END,

  actualizado_en = NOW()

WHERE id_asignacion = $2

          RETURNING
            id_asignacion,
            id_estudiante,
            id_practica,
            id_institucion,
            id_tutor,
            periodo_academico,
            estado,
            fecha_inicio,
            fecha_fin,
            actualizado_en
        `,
        [
          nuevoEstado,
          idAsignacion,
        ]
      );

      return res.json({
        data: result.rows[0],
        message:
          'Estado de la asignación actualizado correctamente',
      });
    } catch (error) {
      console.error(
        'Error actualizando estado de asignación:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible actualizar el estado de la asignación',
      });
    }
  }
);


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

// ======================================================
// TUTOR RECEPTOR - ASIGNACIONES A CARGO
//
// El tutor ve las asignaciones donde figura como tutor.
// Cada asignación se enlaza con el grupo de seguimiento
// académico: misma práctica + mismo período y que tenga
// al estudiante como integrante (si hay varios, el activo
// más reciente).
// ======================================================

// $1 = id_tutor
const TUTOR_ASSIGNMENT_SELECT = `
  SELECT
    a.id_asignacion,
    a.id_estudiante,
    a.id_practica,
    p.nombre AS practica,
    a.id_institucion,
    i.nombre AS institucion,
    a.periodo_academico,
    a.estado,
    a.fecha_inicio,
    a.fecha_fin,
    a.creado_en,
    g.id_grupo,
    g.nombre AS grupo,
    g.estado AS estado_grupo,
    g.id_docente
  FROM practices.asignacion_practica a
  INNER JOIN practices.practica p
    ON p.id_practica = a.id_practica
  INNER JOIN practices.institucion i
    ON i.id_institucion = a.id_institucion
  LEFT JOIN LATERAL (
    SELECT
      gr.id_grupo,
      gr.nombre,
      gr.estado,
      gr.id_docente
    FROM practices.grupo gr
    INNER JOIN practices.grupo_estudiante ge
      ON ge.id_grupo = gr.id_grupo
     AND ge.id_estudiante = a.id_estudiante
    WHERE gr.id_practica = a.id_practica
      AND gr.periodo_academico = a.periodo_academico
    ORDER BY
      (gr.estado = 'ACTIVO') DESC,
      gr.id_grupo DESC
    LIMIT 1
  ) g ON TRUE
  WHERE a.id_tutor = $1
`;

// Agrega nombres de estudiante y docente asesor desde
// User Service. Si no responde, se devuelven solo IDs.
async function withTutorAssignmentNames(rows: any[]) {
  const students = new Map<number, any>();
  const teachers = new Map<number, any>();

  const studentIds = [
    ...new Set(rows.map((row) => Number(row.id_estudiante))),
  ];

  try {
    const [studentsResponse, teachersResponse] =
      await Promise.all([
        studentIds.length
          ? fetch(
              'http://localhost:3334/api/internal/students/by-ids?ids=' +
                studentIds.join(',')
            )
          : null,
        fetch(
          'http://localhost:3334/api/internal/teachers/available'
        ),
      ]);

    if (studentsResponse?.ok) {
      const body: any = await studentsResponse.json();

      for (const s of body.data ?? []) {
        students.set(Number(s.id_estudiante), s);
      }
    }

    if (teachersResponse.ok) {
      const body: any = await teachersResponse.json();

      for (const t of body.data ?? []) {
        teachers.set(Number(t.id_docente), t);
      }
    }
  } catch (error) {
    console.error(
      'No fue posible consultar nombres para el tutor:',
      error
    );
  }

  return rows.map((row) => {
    const student = students.get(Number(row.id_estudiante));
    const teacher = row.id_docente
      ? teachers.get(Number(row.id_docente))
      : null;

    return {
      ...row,
      estudiante: {
        id_estudiante: row.id_estudiante,
        nombres: student?.nombres ?? null,
        apellidos: student?.apellidos ?? null,
        correo: student?.correo ?? null,
        codigo_estudiante: student?.codigo_estudiante ?? null,
        semestre: student?.semestre ?? null,
      },
      docente: teacher
        ? {
            id_docente: teacher.id_docente,
            nombres: teacher.nombres,
            apellidos: teacher.apellidos,
            correo: teacher.correo,
          }
        : null,
    };
  });
}

app.get(
  '/api/internal/tutors/:idTutor/assignments',
  async (req, res) => {
    const idTutor = Number(req.params.idTutor);

    if (!Number.isInteger(idTutor) || idTutor <= 0) {
      return res.status(400).json({
        message: 'El tutor no es válido',
      });
    }

    try {
      const result = await pool.query(
        TUTOR_ASSIGNMENT_SELECT +
          `
            ORDER BY
              (a.estado IN ('ASIGNADA', 'EN_CURSO')) DESC,
              a.periodo_academico DESC,
              a.id_asignacion DESC
          `,
        [idTutor]
      );

      return res.json({
        data: await withTutorAssignmentNames(result.rows),
      });
    } catch (error) {
      console.error(
        'Error consultando asignaciones del tutor:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar las asignaciones del tutor',
      });
    }
  }
);

app.get(
  '/api/internal/tutors/:idTutor/assignments/:idAsignacion',
  async (req, res) => {
    const idTutor = Number(req.params.idTutor);
    const idAsignacion = Number(req.params.idAsignacion);

    if (
      !Number.isInteger(idTutor) ||
      idTutor <= 0 ||
      !Number.isInteger(idAsignacion) ||
      idAsignacion <= 0
    ) {
      return res.status(400).json({
        message: 'Tutor o asignación no válidos',
      });
    }

    try {
      const result = await pool.query(
        TUTOR_ASSIGNMENT_SELECT + ' AND a.id_asignacion = $2',
        [idTutor, idAsignacion]
      );

      // Asignación inexistente o de otro tutor: 404
      // para no revelar asignaciones ajenas.
      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Asignación no encontrada',
        });
      }

      const [data] = await withTutorAssignmentNames(result.rows);

      return res.json({ data });
    } catch (error) {
      console.error(
        'Error consultando asignación del tutor:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar la asignación',
      });
    }
  }
);

// ======================================================
// TUTOR RECEPTOR - BITÁCORA DE OBSERVACIONES
//
// Registro propio del tutor por asignación: observaciones
// fechadas sobre el desempeño del practicante en la
// institución. Solo con la asignación EN_CURSO; fecha entre
// fecha_inicio y hoy (America/Bogota). No se eliminan, solo
// se corrigen (y solo las propias).
// ======================================================

const MAX_OBSERVACION = 2000;

// Asignación del tutor con la fecha de hoy en Bogotá.
// null si no existe o es de otro tutor.
async function findTutorAssignment(
  idTutor: number,
  idAsignacion: number
) {
  const result = await pool.query(
    `
      SELECT
        id_asignacion,
        estado,
        -- fecha_inicio se fija con CURRENT_DATE del servidor
        -- (UTC), que puede ir un día adelante de Bogotá.
        to_char(
          LEAST(
            fecha_inicio,
            (NOW() AT TIME ZONE 'America/Bogota')::date
          ),
          'YYYY-MM-DD'
        ) AS fecha_inicio,
        to_char(
          (NOW() AT TIME ZONE 'America/Bogota')::date,
          'YYYY-MM-DD'
        ) AS hoy
      FROM practices.asignacion_practica
      WHERE id_asignacion = $1
        AND id_tutor = $2
    `,
    [idAsignacion, idTutor]
  );

  return result.rows[0] ?? null;
}

function parseTutorAssignmentParams(req: express.Request) {
  const idTutor = Number(req.params.idTutor);
  const idAsignacion = Number(req.params.idAsignacion);

  if (
    !Number.isInteger(idTutor) ||
    idTutor <= 0 ||
    !Number.isInteger(idAsignacion) ||
    idAsignacion <= 0
  ) {
    return null;
  }

  return { idTutor, idAsignacion };
}

// Valida fecha y descripción contra la asignación.
// Devuelve el mensaje de error o los valores limpios.
function validateObservation(
  body: any,
  assignment: { fecha_inicio: string | null; hoy: string }
): { error: string } | { fecha: string; descripcion: string } {
  const fecha =
    typeof body?.fecha === 'string' ? body.fecha.trim() : '';

  const descripcion =
    typeof body?.descripcion === 'string'
      ? body.descripcion.trim()
      : '';

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    Number.isNaN(Date.parse(fecha + 'T00:00:00Z')) ||
    new Date(fecha + 'T00:00:00Z')
      .toISOString()
      .slice(0, 10) !== fecha
  ) {
    return { error: 'La fecha de la observación no es válida' };
  }

  if (fecha > assignment.hoy) {
    return {
      error: 'La fecha de la observación no puede ser futura',
    };
  }

  if (assignment.fecha_inicio && fecha < assignment.fecha_inicio) {
    return {
      error:
        'La fecha de la observación no puede ser anterior al inicio de la práctica',
    };
  }

  if (!descripcion) {
    return { error: 'La observación es obligatoria' };
  }

  if (descripcion.length > MAX_OBSERVACION) {
    return {
      error: `La observación no puede superar ${MAX_OBSERVACION} caracteres`,
    };
  }

  return { fecha, descripcion };
}

const OBSERVATION_COLUMNS = `
  id_observacion,
  id_asignacion,
  id_tutor,
  to_char(fecha, 'YYYY-MM-DD') AS fecha,
  descripcion,
  creado_en,
  actualizado_en
`;

app.get(
  '/api/internal/tutors/:idTutor/assignments/:idAsignacion/observations',
  async (req, res) => {
    const params = parseTutorAssignmentParams(req);

    if (!params) {
      return res.status(400).json({
        message: 'Tutor o asignación no válidos',
      });
    }

    try {
      const assignment = await findTutorAssignment(
        params.idTutor,
        params.idAsignacion
      );

      if (!assignment) {
        return res.status(404).json({
          message: 'Asignación no encontrada',
        });
      }

      const result = await pool.query(
        `
          SELECT ${OBSERVATION_COLUMNS}
          FROM practices.observacion_tutor
          WHERE id_asignacion = $1
          ORDER BY fecha DESC, id_observacion DESC
        `,
        [params.idAsignacion]
      );

      return res.json({
        data: result.rows.map((row) => ({
          ...row,
          propia: Number(row.id_tutor) === params.idTutor,
        })),
        puede_registrar: assignment.estado === 'EN_CURSO',
        fecha_minima: assignment.fecha_inicio,
        fecha_maxima: assignment.hoy,
      });
    } catch (error) {
      console.error(
        'Error consultando observaciones del tutor:',
        error
      );

      return res.status(500).json({
        message: 'No fue posible consultar las observaciones',
      });
    }
  }
);

app.post(
  '/api/internal/tutors/:idTutor/assignments/:idAsignacion/observations',
  async (req, res) => {
    const params = parseTutorAssignmentParams(req);

    if (!params) {
      return res.status(400).json({
        message: 'Tutor o asignación no válidos',
      });
    }

    try {
      const assignment = await findTutorAssignment(
        params.idTutor,
        params.idAsignacion
      );

      if (!assignment) {
        return res.status(404).json({
          message: 'Asignación no encontrada',
        });
      }

      if (assignment.estado !== 'EN_CURSO') {
        return res.status(409).json({
          message:
            'Solo se registran observaciones mientras la práctica está en curso',
        });
      }

      const values = validateObservation(req.body, assignment);

      if ('error' in values) {
        return res.status(400).json({ message: values.error });
      }

      const result = await pool.query(
        `
          INSERT INTO practices.observacion_tutor (
            id_asignacion,
            id_tutor,
            fecha,
            descripcion
          )
          VALUES ($1, $2, $3, $4)
          RETURNING ${OBSERVATION_COLUMNS}
        `,
        [
          params.idAsignacion,
          params.idTutor,
          values.fecha,
          values.descripcion,
        ]
      );

      return res.status(201).json({
        message: 'Observación registrada correctamente',
        data: { ...result.rows[0], propia: true },
      });
    } catch (error) {
      console.error('Error registrando observación:', error);

      return res.status(500).json({
        message: 'No fue posible registrar la observación',
      });
    }
  }
);

app.put(
  '/api/internal/tutors/:idTutor/assignments/:idAsignacion/observations/:idObservacion',
  async (req, res) => {
    const params = parseTutorAssignmentParams(req);
    const idObservacion = Number(req.params.idObservacion);

    if (
      !params ||
      !Number.isInteger(idObservacion) ||
      idObservacion <= 0
    ) {
      return res.status(400).json({
        message: 'Tutor, asignación u observación no válidos',
      });
    }

    try {
      const assignment = await findTutorAssignment(
        params.idTutor,
        params.idAsignacion
      );

      if (!assignment) {
        return res.status(404).json({
          message: 'Asignación no encontrada',
        });
      }

      const current = await pool.query(
        `
          SELECT id_tutor
          FROM practices.observacion_tutor
          WHERE id_observacion = $1
            AND id_asignacion = $2
        `,
        [idObservacion, params.idAsignacion]
      );

      if ((current.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Observación no encontrada',
        });
      }

      if (Number(current.rows[0].id_tutor) !== params.idTutor) {
        return res.status(403).json({
          message:
            'Solo puede corregir las observaciones que usted registró',
        });
      }

      if (assignment.estado !== 'EN_CURSO') {
        return res.status(409).json({
          message:
            'Las observaciones solo se pueden corregir mientras la práctica está en curso',
        });
      }

      const values = validateObservation(req.body, assignment);

      if ('error' in values) {
        return res.status(400).json({ message: values.error });
      }

      const result = await pool.query(
        `
          UPDATE practices.observacion_tutor
          SET
            fecha = $1,
            descripcion = $2,
            actualizado_en = NOW()
          WHERE id_observacion = $3
          RETURNING ${OBSERVATION_COLUMNS}
        `,
        [values.fecha, values.descripcion, idObservacion]
      );

      return res.json({
        message: 'Observación actualizada correctamente',
        data: { ...result.rows[0], propia: true },
      });
    } catch (error) {
      console.error('Error actualizando observación:', error);

      return res.status(500).json({
        message: 'No fue posible actualizar la observación',
      });
    }
  }
);

// ======================================================
// TUTOR RECEPTOR - EVALUACIÓN FINAL
//
// Concepto de la institución sobre el practicante: una por
// asignación. Se registra y corrige mientras la asignación
// está EN_CURSO; al finalizar queda fija. Sin ella, una
// asignación con tutor no puede pasar a FINALIZADA.
// ======================================================

const EVALUATION_COLUMNS = `
  id_evaluacion,
  id_asignacion,
  id_tutor,
  calificacion::float AS calificacion,
  concepto,
  recomienda_aprobacion,
  creado_en,
  actualizado_en
`;

async function findEvaluation(idAsignacion: number) {
  const result = await pool.query(
    `
      SELECT ${EVALUATION_COLUMNS}
      FROM practices.evaluacion_tutor
      WHERE id_asignacion = $1
    `,
    [idAsignacion]
  );

  return result.rows[0] ?? null;
}

app.get(
  '/api/internal/tutors/:idTutor/assignments/:idAsignacion/evaluation',
  async (req, res) => {
    const params = parseTutorAssignmentParams(req);

    if (!params) {
      return res.status(400).json({
        message: 'Tutor o asignación no válidos',
      });
    }

    try {
      const assignment = await findTutorAssignment(
        params.idTutor,
        params.idAsignacion
      );

      if (!assignment) {
        return res.status(404).json({
          message: 'Asignación no encontrada',
        });
      }

      return res.json({
        data: await findEvaluation(params.idAsignacion),
        puede_evaluar: assignment.estado === 'EN_CURSO',
      });
    } catch (error) {
      console.error('Error consultando evaluación del tutor:', error);

      return res.status(500).json({
        message: 'No fue posible consultar la evaluación',
      });
    }
  }
);

app.put(
  '/api/internal/tutors/:idTutor/assignments/:idAsignacion/evaluation',
  async (req, res) => {
    const params = parseTutorAssignmentParams(req);

    if (!params) {
      return res.status(400).json({
        message: 'Tutor o asignación no válidos',
      });
    }

    // Calificación 0.0–5.0 con máximo un decimal.
    const rawGrade = req.body?.calificacion;
    const calificacion =
      typeof rawGrade === 'number' ? rawGrade : NaN;

    const concepto =
      typeof req.body?.concepto === 'string'
        ? req.body.concepto.trim()
        : '';

    const recomienda = req.body?.recomienda_aprobacion;

    if (
      !Number.isFinite(calificacion) ||
      calificacion < 0 ||
      calificacion > 5 ||
      Math.round(calificacion * 10) !== calificacion * 10
    ) {
      return res.status(400).json({
        message:
          'La calificación debe estar entre 0.0 y 5.0 con máximo un decimal',
      });
    }

    if (!concepto) {
      return res.status(400).json({
        message: 'El concepto del tutor es obligatorio',
      });
    }

    if (concepto.length > MAX_OBSERVACION) {
      return res.status(400).json({
        message: `El concepto no puede superar ${MAX_OBSERVACION} caracteres`,
      });
    }

    if (typeof recomienda !== 'boolean') {
      return res.status(400).json({
        message: 'Indique si recomienda aprobar la práctica',
      });
    }

    try {
      const assignment = await findTutorAssignment(
        params.idTutor,
        params.idAsignacion
      );

      if (!assignment) {
        return res.status(404).json({
          message: 'Asignación no encontrada',
        });
      }

      if (assignment.estado !== 'EN_CURSO') {
        return res.status(409).json({
          message:
            'La evaluación solo se registra o corrige mientras la práctica está en curso',
        });
      }

      // xmax = 0 identifica la fila recién insertada.
      const result = await pool.query(
        `
          INSERT INTO practices.evaluacion_tutor (
            id_asignacion,
            id_tutor,
            calificacion,
            concepto,
            recomienda_aprobacion
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id_asignacion) DO UPDATE
          SET
            id_tutor = EXCLUDED.id_tutor,
            calificacion = EXCLUDED.calificacion,
            concepto = EXCLUDED.concepto,
            recomienda_aprobacion = EXCLUDED.recomienda_aprobacion,
            actualizado_en = NOW()
          RETURNING ${EVALUATION_COLUMNS}, (xmax = 0) AS creada
        `,
        [
          params.idAsignacion,
          params.idTutor,
          calificacion,
          concepto,
          recomienda,
        ]
      );

      const { creada, ...data } = result.rows[0];

      return res.status(creada ? 201 : 200).json({
        message: creada
          ? 'Evaluación final registrada correctamente'
          : 'Evaluación final actualizada correctamente',
        data,
      });
    } catch (error) {
      console.error('Error guardando evaluación del tutor:', error);

      return res.status(500).json({
        message: 'No fue posible guardar la evaluación',
      });
    }
  }
);

// ======================================================
// REGISTRO DEL TUTOR (solo lectura)
//
// Bitácora + evaluación final de una asignación, con el
// nombre del tutor, para el Coordinador y el Docente Asesor.
// ======================================================

async function loadTutorRecord(assignment: {
  id_asignacion: number;
  id_tutor: number | null;
}) {
  const [observations, evaluation] = await Promise.all([
    pool.query(
      `
        SELECT ${OBSERVATION_COLUMNS}
        FROM practices.observacion_tutor
        WHERE id_asignacion = $1
        ORDER BY fecha DESC, id_observacion DESC
      `,
      [assignment.id_asignacion]
    ),
    findEvaluation(assignment.id_asignacion),
  ]);

  let tutor: any = null;

  if (assignment.id_tutor) {
    try {
      tutor =
        (await fetchAvailableTutors()).get(
          Number(assignment.id_tutor)
        ) ?? null;
    } catch (error) {
      console.error('No fue posible consultar el tutor:', error);
    }
  }

  return {
    tutor: assignment.id_tutor
      ? {
          id_tutor: Number(assignment.id_tutor),
          nombres: tutor?.nombres ?? null,
          apellidos: tutor?.apellidos ?? null,
          cargo: tutor?.cargo ?? null,
        }
      : null,
    observaciones: observations.rows,
    evaluacion: evaluation,
  };
}

// Coordinador: registro del tutor de una asignación.
app.get(
  '/api/practice-assignments/:id/tutor-record',
  async (req, res) => {
    const idAsignacion = Number(req.params.id);

    if (!Number.isInteger(idAsignacion) || idAsignacion <= 0) {
      return res.status(400).json({
        message: 'El identificador de la asignación no es válido',
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT id_asignacion, id_tutor
          FROM practices.asignacion_practica
          WHERE id_asignacion = $1
        `,
        [idAsignacion]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Asignación de práctica no encontrada',
        });
      }

      return res.json({
        data: await loadTutorRecord(result.rows[0]),
      });
    } catch (error) {
      console.error('Error consultando registro del tutor:', error);

      return res.status(500).json({
        message: 'No fue posible consultar el registro del tutor',
      });
    }
  }
);

// Docente asesor: registro del tutor sobre un estudiante de
// su grupo. La asignación es la de la misma práctica +
// período del grupo (si hay varias, la no cancelada más
// reciente). Grupo ajeno → 404.
app.get(
  '/api/internal/teachers/:idDocente/groups/:idGrupo/students/:idEstudiante/tutor-record',
  async (req, res) => {
    const idDocente = Number(req.params.idDocente);
    const idGrupo = Number(req.params.idGrupo);
    const idEstudiante = Number(req.params.idEstudiante);

    if (
      ![idDocente, idGrupo, idEstudiante].every(
        (id) => Number.isInteger(id) && id > 0
      )
    ) {
      return res.status(400).json({
        message: 'Docente, grupo o estudiante no válidos',
      });
    }

    try {
      const group = await pool.query(
        `
          SELECT id_practica, periodo_academico
          FROM practices.grupo
          WHERE id_grupo = $1
            AND id_docente = $2
        `,
        [idGrupo, idDocente]
      );

      if ((group.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Grupo no encontrado',
        });
      }

      const assignment = await pool.query(
        `
          SELECT
            a.id_asignacion,
            a.id_tutor,
            a.estado,
            a.fecha_inicio,
            a.fecha_fin,
            i.nombre AS institucion
          FROM practices.asignacion_practica a
          INNER JOIN practices.institucion i
            ON i.id_institucion = a.id_institucion
          WHERE a.id_estudiante = $1
            AND a.id_practica = $2
            AND a.periodo_academico = $3
          ORDER BY
            (a.estado <> 'CANCELADA') DESC,
            a.id_asignacion DESC
          LIMIT 1
        `,
        [
          idEstudiante,
          group.rows[0].id_practica,
          group.rows[0].periodo_academico,
        ]
      );

      // Sin asignación no hay registro del tutor; no es error.
      if ((assignment.rowCount ?? 0) === 0) {
        return res.json({ data: null });
      }

      const row = assignment.rows[0];

      return res.json({
        data: {
          asignacion: row,
          ...(await loadTutorRecord(row)),
        },
      });
    } catch (error) {
      console.error(
        'Error consultando registro del tutor para el docente:',
        error
      );

      return res.status(500).json({
        message: 'No fue posible consultar el registro del tutor',
      });
    }
  }
);

const port = process.env.PORT || 3335;

const server = app.listen(port, () => {
  console.log(`Practice Service listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
