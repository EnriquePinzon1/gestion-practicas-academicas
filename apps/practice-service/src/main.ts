import 'dotenv/config';
import express from 'express';
import { pool } from './database/database';
import {
  createInternalFetch,
  readInternalToken,
  requireInternalToken,
  resolveServiceUrl,
} from '@gestion-practicas/service-http';

// ======================================================
// COMUNICACIÓN ENTRE SERVICIOS
// ======================================================

const INTERNAL_API_TOKEN = readInternalToken();
const internalFetch = createInternalFetch(INTERNAL_API_TOKEN);

const USER_SERVICE_URL = resolveServiceUrl(
  'USER_SERVICE_URL',
  'http://localhost:3334'
);

const app = express();

app.use(express.json());

// Health del microservicio (público: solo indica que responde)
app.get('/api', (_req, res) => {
  return res.json({
    service: 'practice-service',
    status: 'ok',
  });
});

// El resto de rutas solo atiende al Gateway y a otros servicios.
app.use('/api', requireInternalToken(INTERNAL_API_TOKEN));

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
  const response = await internalFetch(
    USER_SERVICE_URL + '/api/internal/tutors/available'
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
        await internalFetch(
          USER_SERVICE_URL + '/api/internal/students/available'
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
          await internalFetch(
            USER_SERVICE_URL + '/api/internal/tutors/available'
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

      // La práctica no se finaliza sin cumplir las horas
      // requeridas registradas por el Coordinador.
      if (nuevoEstado === 'FINALIZADA') {
        const hours = hoursSummary(
          await findHoursAssignment(idAsignacion)
        );

        if (!hours.completadas) {
          const realizadas = String(hours.horas_realizadas).replace(
            '.',
            ','
          );

          return res.status(409).json({
            message:
              `El estudiante debe completar las horas requeridas antes de finalizar la práctica (${realizadas} de ${hours.horas_requeridas} h registradas)`,
          });
        }
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

    const teachersResponse = await internalFetch(
      USER_SERVICE_URL + '/api/internal/teachers/available'
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

    const studentsResponse = await internalFetch(
      USER_SERVICE_URL + '/api/internal/students/available'
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

    const teachersResponse = await internalFetch(
      USER_SERVICE_URL + '/api/internal/teachers/available'
    );

    const studentsResponse = await internalFetch(
      USER_SERVICE_URL + '/api/internal/students/available'
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
      await internalFetch(
        USER_SERVICE_URL + '/api/internal/teachers/available'
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
// INTEGRANTES DEL GRUPO (agregar / retirar uno a la vez)
// Mismas reglas que al crear: estudiante activo y sin otro
// grupo activo. Retirar no borra su historial: el snapshot
// de actividad_estudiante se conserva.
// ======================================================

app.patch('/api/groups/:id/students', async (req, res) => {
  const idGrupo = Number(req.params.id);
  const idEstudiante = Number(req.body?.id_estudiante);
  const action = String(req.body?.action ?? '')
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
      message: 'La operación sobre el estudiante no es válida',
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
      const studentsResponse = await internalFetch(
        USER_SERVICE_URL + '/api/internal/students/available'
      );

      if (!studentsResponse.ok) {
        return res.status(503).json({
          message: 'User Service no disponible',
        });
      }

      const studentsBody: any = await studentsResponse.json();

      const studentExists = (studentsBody.data ?? []).some(
        (item: any) => Number(item.id_estudiante) === idEstudiante
      );

      if (!studentExists) {
        return res.status(400).json({
          message: 'El estudiante seleccionado no está disponible',
        });
      }

      const conflict = await pool.query(
        `
          SELECT g.id_grupo
          FROM practices.grupo_estudiante ge
          INNER JOIN practices.grupo g
            ON g.id_grupo = ge.id_grupo
          WHERE
            ge.id_estudiante = $1
            AND g.estado = 'ACTIVO'
            AND g.id_grupo <> $2
          LIMIT 1
        `,
        [idEstudiante, idGrupo]
      );

      if ((conflict.rowCount ?? 0) > 0) {
        return res.status(409).json({
          message: 'El estudiante ya pertenece a otro grupo activo',
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
        data: { id_grupo: idGrupo, id_estudiante: idEstudiante },
        message: 'Estudiante agregado correctamente',
      });
    }

    // REMOVE: el grupo no puede quedar sin integrantes
    // (al crearlo se exige al menos uno).
    const removed = await pool.query(
      `
        DELETE FROM practices.grupo_estudiante
        WHERE
          id_grupo = $1
          AND id_estudiante = $2
          AND (
            SELECT COUNT(*)
            FROM practices.grupo_estudiante
            WHERE id_grupo = $1
          ) > 1
        RETURNING id_estudiante
      `,
      [idGrupo, idEstudiante]
    );

    if ((removed.rowCount ?? 0) === 0) {
      const member = await pool.query(
        `
          SELECT 1
          FROM practices.grupo_estudiante
          WHERE id_grupo = $1 AND id_estudiante = $2
        `,
        [idGrupo, idEstudiante]
      );

      if ((member.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'El estudiante no pertenece al grupo',
        });
      }

      return res.status(409).json({
        message: 'El grupo debe conservar al menos un estudiante',
      });
    }

    return res.json({
      data: { id_grupo: idGrupo, id_estudiante: idEstudiante },
      message: 'Estudiante retirado correctamente',
    });
  } catch (error) {
    console.error('Error modificando integrantes:', error);

    return res.status(500).json({
      message: 'No fue posible modificar los integrantes del grupo',
    });
  }
});

// Cerrar grupo: ACTIVO → CERRADO (estado final).
app.patch('/api/groups/:id/status', async (req, res) => {
  const idGrupo = Number(req.params.id);
  const estado = String(req.body?.estado ?? '')
    .trim()
    .toUpperCase();

  if (!Number.isInteger(idGrupo) || idGrupo <= 0) {
    return res.status(400).json({
      message: 'El identificador del grupo no es válido',
    });
  }

  if (estado !== 'CERRADO') {
    return res.status(400).json({
      message: 'Solo es posible cerrar el grupo',
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
        RETURNING id_grupo, nombre, estado
      `,
      [idGrupo]
    );

    if ((result.rowCount ?? 0) === 0) {
      const exists = await pool.query(
        'SELECT 1 FROM practices.grupo WHERE id_grupo = $1',
        [idGrupo]
      );

      return (exists.rowCount ?? 0) === 0
        ? res.status(404).json({ message: 'Grupo no encontrado' })
        : res.status(409).json({
            message: 'El grupo ya se encuentra cerrado',
          });
    }

    return res.json({
      data: result.rows[0],
      message: 'Grupo cerrado correctamente',
    });
  } catch (error) {
    console.error('Error cerrando grupo:', error);

    return res.status(500).json({
      message: 'No fue posible cerrar el grupo',
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
          ? internalFetch(
              USER_SERVICE_URL + '/api/internal/students/by-ids?ids=' +
                studentIds.join(',')
            )
          : null,
        internalFetch(
          USER_SERVICE_URL + '/api/internal/teachers/available'
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

// ======================================================
// REPORTES DEL COORDINADOR POR PERÍODO ACADÉMICO
//
// Consolida en una sola consulta lo que el coordinador
// necesita para cerrar o vigilar un período:
// - Asignaciones por estado, institución y práctica.
// - Cruces entre GRUPO (seguimiento académico) y
//   ASIGNACIÓN (dónde y con quién): estudiantes en grupo
//   sin asignación y asignaciones sin grupo.
// - Evaluaciones finales del tutor pendientes.
// Solo devuelve IDs de estudiantes, tutores y docentes;
// el Gateway resuelve los nombres en User Service.
// ======================================================

const ASSIGNMENT_STATES = [
  'ASIGNADA',
  'EN_CURSO',
  'FINALIZADA',
  'CANCELADA',
] as const;

type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

function emptyStateCount(): Record<AssignmentState, number> {
  return {
    ASIGNADA: 0,
    EN_CURSO: 0,
    FINALIZADA: 0,
    CANCELADA: 0,
  };
}

// Período vigente según la fecha de Bogotá:
// enero–junio → AAAA-1, julio–diciembre → AAAA-2.
function currentAcademicPeriod(): string {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .split('-')
    .map(Number);

  return `${year}-${month <= 6 ? 1 : 2}`;
}

app.get('/api/internal/reports/period', async (req, res) => {
  const requested =
    typeof req.query.periodo === 'string'
      ? req.query.periodo.trim()
      : '';

  if (requested && !/^\d{4}-[12]$/.test(requested)) {
    return res.status(400).json({
      message:
        'El período académico debe tener el formato AAAA-1 o AAAA-2',
    });
  }

  try {
    const periodsResult = await pool.query(`
      SELECT periodo_academico
      FROM practices.asignacion_practica
      UNION
      SELECT periodo_academico
      FROM practices.grupo
      ORDER BY periodo_academico DESC
    `);

    const periodos: string[] = periodsResult.rows.map(
      (row) => row.periodo_academico
    );

    const current = currentAcademicPeriod();

    const periodo =
      requested ||
      (periodos.includes(current) ? current : periodos[0]) ||
      current;

    const [assignmentsResult, groupsResult] = await Promise.all([
      pool.query(
        `
          SELECT
            a.id_asignacion,
            a.id_estudiante,
            a.id_practica,
            p.nombre AS practica,
            a.id_institucion,
            i.nombre AS institucion,
            a.id_tutor,
            a.estado,
            a.fecha_inicio,
            ev.id_evaluacion,
            ev.calificacion::float AS calificacion_tutor,
            ev.recomienda_aprobacion
          FROM practices.asignacion_practica a
          INNER JOIN practices.practica p
            ON p.id_practica = a.id_practica
          INNER JOIN practices.institucion i
            ON i.id_institucion = a.id_institucion
          LEFT JOIN practices.evaluacion_tutor ev
            ON ev.id_asignacion = a.id_asignacion
          WHERE a.periodo_academico = $1
          ORDER BY a.id_asignacion
        `,
        [periodo]
      ),
      pool.query(
        `
          SELECT
            g.id_grupo,
            g.nombre,
            g.estado,
            g.id_docente,
            g.id_practica,
            p.nombre AS practica,
            COALESCE(
              ARRAY_AGG(ge.id_estudiante ORDER BY ge.id_estudiante)
                FILTER (WHERE ge.id_estudiante IS NOT NULL),
              '{}'
            ) AS estudiantes
          FROM practices.grupo g
          INNER JOIN practices.practica p
            ON p.id_practica = g.id_practica
          LEFT JOIN practices.grupo_estudiante ge
            ON ge.id_grupo = g.id_grupo
          WHERE g.periodo_academico = $1
          GROUP BY g.id_grupo, p.nombre
          ORDER BY p.nombre, g.nombre
        `,
        [periodo]
      ),
    ]);

    const assignments = assignmentsResult.rows;
    const groups = groupsResult.rows.map((group) => ({
      ...group,
      estudiantes: (group.estudiantes as unknown[]).map(Number),
    }));

    // Las canceladas cuentan en los totales por estado, pero
    // no cubren a un estudiante en los cruces.
    const active = assignments.filter(
      (a) => a.estado !== 'CANCELADA'
    );

    const porEstado = emptyStateCount();

    const institutions = new Map<number, any>();
    const practices = new Map<number, any>();

    const practiceEntry = (id: number, nombre: string) => {
      if (!practices.has(id)) {
        practices.set(id, {
          id_practica: id,
          practica: nombre,
          total: 0,
          estados: emptyStateCount(),
          grupos: 0,
          estudiantes: new Set<number>(),
        });
      }

      return practices.get(id);
    };

    for (const a of assignments) {
      const state = a.estado as AssignmentState;

      porEstado[state] += 1;

      if (!institutions.has(a.id_institucion)) {
        institutions.set(a.id_institucion, {
          id_institucion: a.id_institucion,
          institucion: a.institucion,
          total: 0,
          estados: emptyStateCount(),
        });
      }

      const institution = institutions.get(a.id_institucion);
      institution.total += 1;
      institution.estados[state] += 1;

      const practice = practiceEntry(a.id_practica, a.practica);
      practice.total += 1;
      practice.estados[state] += 1;
    }

    for (const group of groups) {
      const practice = practiceEntry(
        group.id_practica,
        group.practica
      );

      practice.grupos += 1;

      // Un estudiante puede estar en varios grupos de la
      // misma práctica: se cuentan estudiantes únicos.
      for (const idEstudiante of group.estudiantes) {
        practice.estudiantes.add(idEstudiante);
      }
    }

    const hasAssignment = (idEstudiante: number, idPractica: number) =>
      active.some(
        (a) =>
          a.id_estudiante === idEstudiante &&
          a.id_practica === idPractica
      );

    const groupOf = (idEstudiante: number, idPractica: number) =>
      groups.find(
        (g) =>
          g.id_practica === idPractica &&
          g.estudiantes.includes(idEstudiante)
      );

    const enGrupoSinAsignacion = groups.flatMap((group) =>
      group.estudiantes
        .filter(
          (idEstudiante: number) =>
            !hasAssignment(idEstudiante, group.id_practica)
        )
        .map((idEstudiante: number) => ({
          id_estudiante: idEstudiante,
          id_grupo: group.id_grupo,
          grupo: group.nombre,
          id_practica: group.id_practica,
          practica: group.practica,
        }))
    );

    const assignmentRef = (a: any) => ({
      id_asignacion: a.id_asignacion,
      id_estudiante: a.id_estudiante,
      id_practica: a.id_practica,
      practica: a.practica,
      institucion: a.institucion,
      id_tutor: a.id_tutor,
      estado: a.estado,
      fecha_inicio: a.fecha_inicio,
    });

    const asignacionSinGrupo = active
      .filter((a) => !groupOf(a.id_estudiante, a.id_practica))
      .map(assignmentRef);

    // El tutor solo puede evaluar una asignación EN_CURSO;
    // las ASIGNADAS con tutor aún no están pendientes.
    const evaluacionesPendientes = active
      .filter(
        (a) =>
          a.estado === 'EN_CURSO' &&
          a.id_tutor !== null &&
          a.id_evaluacion === null
      )
      .map(assignmentRef);

    // Sin tutor no habrá evaluación del tutor al finalizar.
    const sinTutor = active
      .filter(
        (a) =>
          a.id_tutor === null &&
          (a.estado === 'ASIGNADA' || a.estado === 'EN_CURSO')
      )
      .map(assignmentRef);

    const evaluated = assignments.filter(
      (a) => a.id_evaluacion !== null
    );

    const promedioTutor = evaluated.length
      ? Math.round(
          (evaluated.reduce(
            (sum, a) => sum + a.calificacion_tutor,
            0
          ) /
            evaluated.length) *
            10
        ) / 10
      : null;

    const byName = (key: string) => (a: any, b: any) =>
      String(a[key]).localeCompare(String(b[key]), 'es');

    return res.json({
      data: {
        periodo,
        periodos,
        resumen: {
          total_asignaciones: assignments.length,
          por_estado: porEstado,
          estudiantes_asignados: new Set(
            active.map((a) => a.id_estudiante)
          ).size,
          total_grupos: groups.length,
          estudiantes_en_grupos: new Set(
            groups.flatMap((g) => g.estudiantes)
          ).size,
        },
        por_institucion: [...institutions.values()].sort(
          byName('institucion')
        ),
        por_practica: [...practices.values()]
          .map(({ estudiantes, ...practice }) => ({
            ...practice,
            estudiantes_en_grupos: estudiantes.size,
          }))
          .sort(byName('practica')),
        grupos: groups.map((group) => ({
          id_grupo: group.id_grupo,
          nombre: group.nombre,
          estado: group.estado,
          id_docente: group.id_docente,
          id_practica: group.id_practica,
          practica: group.practica,
          total_estudiantes: group.estudiantes.length,
        })),
        cruces: {
          en_grupo_sin_asignacion: enGrupoSinAsignacion,
          asignacion_sin_grupo: asignacionSinGrupo,
        },
        evaluaciones_tutor: {
          registradas: evaluated.length,
          promedio: promedioTutor,
          recomiendan_aprobacion: evaluated.filter(
            (a) => a.recomienda_aprobacion
          ).length,
          pendientes: evaluacionesPendientes,
          sin_tutor: sinTutor,
        },
      },
    });
  } catch (error) {
    console.error('Error generando reporte del período:', error);

    return res.status(500).json({
      message: 'No fue posible generar el reporte del período',
    });
  }
});

// ======================================================
// CU "REALIZAR SEGUIMIENTO DE PRÁCTICAS" - HORAS DE PRÁCTICA
//
// El Coordinador registra las horas realizadas por cada
// asignación (BS1); el Estudiante consulta su progreso (BS4).
// Requeridas = practica.horas_requeridas; el acumulado se
// calcula con SUM. Solo se registra, corrige o elimina con la
// asignación EN_CURSO; fecha entre el inicio de la asignación
// (o su creación, si fecha_inicio es nula) y hoy en Bogotá.
// ======================================================

const MAX_OBSERVACION_HORAS = 2000;

// Asignación con su práctica, institución, rango de fechas
// permitido y horas acumuladas. Sin filtro: todas.
const HOURS_ASSIGNMENT_SQL = `
  SELECT
    a.id_asignacion,
    a.id_estudiante,
    a.id_practica,
    p.nombre AS practica,
    a.id_institucion,
    i.nombre AS institucion,
    a.id_tutor,
    a.periodo_academico,
    a.estado,
    to_char(a.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
    to_char(a.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
    p.horas_requeridas,
    COALESCE(h.realizadas, 0) AS horas_realizadas,
    COALESCE(h.registros, 0) AS total_registros,
    to_char(h.ultima_fecha, 'YYYY-MM-DD') AS ultima_fecha,
    -- fecha_inicio se fija con CURRENT_DATE del servidor (UTC),
    -- que puede ir un día adelante de Bogotá; las asignaciones
    -- antiguas pueden no tenerla y se usa su fecha de creación.
    to_char(
      LEAST(
        COALESCE(
          a.fecha_inicio,
          (a.creado_en AT TIME ZONE 'America/Bogota')::date
        ),
        (NOW() AT TIME ZONE 'America/Bogota')::date
      ),
      'YYYY-MM-DD'
    ) AS fecha_minima,
    to_char(
      (NOW() AT TIME ZONE 'America/Bogota')::date,
      'YYYY-MM-DD'
    ) AS hoy
  FROM practices.asignacion_practica a
  INNER JOIN practices.practica p
    ON p.id_practica = a.id_practica
  INNER JOIN practices.institucion i
    ON i.id_institucion = a.id_institucion
  LEFT JOIN (
    SELECT
      id_asignacion,
      SUM(horas) AS realizadas,
      COUNT(*) AS registros,
      MAX(fecha) AS ultima_fecha
    FROM practices.registro_horas
    GROUP BY id_asignacion
  ) h
    ON h.id_asignacion = a.id_asignacion
`;

const HOURS_RECORD_COLUMNS = `
  id_registro,
  id_asignacion,
  to_char(fecha, 'YYYY-MM-DD') AS fecha,
  horas,
  observacion,
  registrado_por,
  creado_en,
  actualizado_en
`;

// NUMERIC llega como texto desde pg.
function toHours(value: unknown): number {
  return Math.round(Number(value ?? 0) * 10) / 10;
}

// Resumen de avance: requeridas, realizadas, pendientes, %.
function hoursSummary(row: any) {
  const requeridas = Number(row.horas_requeridas);
  const realizadas = toHours(row.horas_realizadas);

  return {
    id_asignacion: row.id_asignacion,
    id_estudiante: row.id_estudiante,
    id_practica: row.id_practica,
    practica: row.practica,
    id_institucion: row.id_institucion,
    institucion: row.institucion,
    id_tutor: row.id_tutor,
    periodo_academico: row.periodo_academico,
    estado: row.estado,
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
    horas_requeridas: requeridas,
    horas_realizadas: realizadas,
    horas_pendientes: Math.max(
      0,
      Math.round((requeridas - realizadas) * 10) / 10
    ),
    porcentaje:
      requeridas > 0
        ? Math.min(100, Math.floor((realizadas / requeridas) * 100))
        : 0,
    completadas: realizadas >= requeridas,
    total_registros: Number(row.total_registros),
    ultima_fecha: row.ultima_fecha,
  };
}

function mapHoursRecord(row: any) {
  return { ...row, horas: toHours(row.horas) };
}

async function findHoursAssignment(idAsignacion: number) {
  const result = await pool.query(
    `${HOURS_ASSIGNMENT_SQL} WHERE a.id_asignacion = $1`,
    [idAsignacion]
  );

  return result.rows[0] ?? null;
}

async function listHoursRecords(idAsignacion: number) {
  const result = await pool.query(
    `
      SELECT ${HOURS_RECORD_COLUMNS}
      FROM practices.registro_horas
      WHERE id_asignacion = $1
      ORDER BY fecha DESC, id_registro DESC
    `,
    [idAsignacion]
  );

  return result.rows.map(mapHoursRecord);
}

// Detalle completo: resumen + historial + permisos de edición.
async function hoursDetail(assignment: any) {
  return {
    ...hoursSummary(assignment),
    registros: await listHoursRecords(assignment.id_asignacion),
    puede_registrar: assignment.estado === 'EN_CURSO',
    fecha_minima: assignment.fecha_minima,
    fecha_maxima: assignment.hoy,
    horas_maximas_registro: Number(assignment.horas_requeridas),
  };
}

// Valida fecha, horas, observación y coordinador.
// Devuelve el mensaje de error o los valores limpios.
function validateHoursRecord(
  body: any,
  assignment: any
):
  | { error: string }
  | {
      fecha: string;
      horas: number;
      observacion: string | null;
      registradoPor: number;
    } {
  const fecha =
    typeof body?.fecha === 'string' ? body.fecha.trim() : '';

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    Number.isNaN(Date.parse(fecha + 'T00:00:00Z')) ||
    new Date(fecha + 'T00:00:00Z').toISOString().slice(0, 10) !==
      fecha
  ) {
    return { error: 'La fecha del registro no es válida' };
  }

  if (fecha > assignment.hoy) {
    return { error: 'La fecha del registro no puede ser futura' };
  }

  if (fecha < assignment.fecha_minima) {
    return {
      error:
        'La fecha del registro no puede ser anterior al inicio de la práctica',
    };
  }

  const rawHoras = body?.horas;
  const horas =
    typeof rawHoras === 'number'
      ? rawHoras
      : typeof rawHoras === 'string' && rawHoras.trim() !== ''
        ? Number(rawHoras.trim().replace(',', '.'))
        : NaN;

  if (!Number.isFinite(horas) || horas <= 0) {
    return {
      error: 'La cantidad de horas debe ser un número mayor que cero',
    };
  }

  if (Math.abs(horas * 10 - Math.round(horas * 10)) > 1e-9) {
    return {
      error: 'La cantidad de horas admite como máximo un decimal',
    };
  }

  const maximo = Number(assignment.horas_requeridas);

  if (horas > maximo) {
    return {
      error: `Un registro no puede superar las ${maximo} horas requeridas de la práctica`,
    };
  }

  const observacion =
    typeof body?.observacion === 'string'
      ? body.observacion.trim()
      : '';

  if (observacion.length > MAX_OBSERVACION_HORAS) {
    return {
      error: `La observación no puede superar ${MAX_OBSERVACION_HORAS} caracteres`,
    };
  }

  const registradoPor = parsePositiveId(body?.registrado_por);

  if (!registradoPor) {
    return { error: 'No se identificó al coordinador que registra' };
  }

  return {
    fecha,
    horas: Math.round(horas * 10) / 10,
    observacion: observacion || null,
    registradoPor,
  };
}

// Listado del Coordinador: todas las asignaciones con su avance
// (el filtrado por período/estado lo hace la interfaz).
app.get('/api/practice-hours', async (_req, res) => {
  try {
    const result = await pool.query(
      `${HOURS_ASSIGNMENT_SQL}
       ORDER BY a.periodo_academico DESC, a.id_asignacion DESC`
    );

    return res.json({ data: result.rows.map(hoursSummary) });
  } catch (error) {
    console.error('Error consultando horas de práctica:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las horas de práctica',
    });
  }
});

app.get('/api/practice-hours/:idAsignacion', async (req, res) => {
  const idAsignacion = parsePositiveId(req.params.idAsignacion);

  if (!idAsignacion) {
    return res.status(400).json({
      message: 'El identificador de la asignación no es válido',
    });
  }

  try {
    const assignment = await findHoursAssignment(idAsignacion);

    if (!assignment) {
      return res.status(404).json({
        message: 'Asignación de práctica no encontrada',
      });
    }

    return res.json({ data: await hoursDetail(assignment) });
  } catch (error) {
    console.error('Error consultando horas de la asignación:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las horas de la asignación',
    });
  }
});

app.post('/api/practice-hours/:idAsignacion', async (req, res) => {
  const idAsignacion = parsePositiveId(req.params.idAsignacion);

  if (!idAsignacion) {
    return res.status(400).json({
      message: 'El identificador de la asignación no es válido',
    });
  }

  try {
    const assignment = await findHoursAssignment(idAsignacion);

    if (!assignment) {
      return res.status(404).json({
        message: 'Asignación de práctica no encontrada',
      });
    }

    if (assignment.estado !== 'EN_CURSO') {
      return res.status(409).json({
        message:
          'Solo se registran horas mientras la práctica está en curso',
      });
    }

    const values = validateHoursRecord(req.body, assignment);

    if ('error' in values) {
      return res.status(400).json({ message: values.error });
    }

    const result = await pool.query(
      `
        INSERT INTO practices.registro_horas (
          id_asignacion,
          fecha,
          horas,
          observacion,
          registrado_por
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING ${HOURS_RECORD_COLUMNS}
      `,
      [
        idAsignacion,
        values.fecha,
        values.horas,
        values.observacion,
        values.registradoPor,
      ]
    );

    const updated = await findHoursAssignment(idAsignacion);
    const summary = hoursSummary(updated);

    return res.status(201).json({
      message: summary.completadas
        ? 'Horas registradas correctamente. Horas completadas'
        : 'Horas registradas correctamente',
      data: {
        registro: mapHoursRecord(result.rows[0]),
        resumen: summary,
      },
    });
  } catch (error) {
    console.error('Error registrando horas:', error);

    return res.status(500).json({
      message: 'No fue posible registrar las horas',
    });
  }
});

// Busca el registro dentro de la asignación y verifica que la
// asignación siga EN_CURSO. Devuelve el error HTTP o los datos.
async function findEditableHoursRecord(
  idAsignacion: number,
  idRegistro: number
): Promise<
  | { status: number; message: string }
  | { assignment: any }
> {
  const assignment = await findHoursAssignment(idAsignacion);

  if (!assignment) {
    return {
      status: 404,
      message: 'Asignación de práctica no encontrada',
    };
  }

  const record = await pool.query(
    `
      SELECT id_registro
      FROM practices.registro_horas
      WHERE id_registro = $1
        AND id_asignacion = $2
    `,
    [idRegistro, idAsignacion]
  );

  if ((record.rowCount ?? 0) === 0) {
    return { status: 404, message: 'Registro de horas no encontrado' };
  }

  if (assignment.estado !== 'EN_CURSO') {
    return {
      status: 409,
      message:
        'Las horas solo se pueden modificar mientras la práctica está en curso',
    };
  }

  return { assignment };
}

app.put(
  '/api/practice-hours/:idAsignacion/records/:idRegistro',
  async (req, res) => {
    const idAsignacion = parsePositiveId(req.params.idAsignacion);
    const idRegistro = parsePositiveId(req.params.idRegistro);

    if (!idAsignacion || !idRegistro) {
      return res.status(400).json({
        message: 'Asignación o registro no válidos',
      });
    }

    try {
      const found = await findEditableHoursRecord(
        idAsignacion,
        idRegistro
      );

      if ('status' in found) {
        return res
          .status(found.status)
          .json({ message: found.message });
      }

      const values = validateHoursRecord(req.body, found.assignment);

      if ('error' in values) {
        return res.status(400).json({ message: values.error });
      }

      const result = await pool.query(
        `
          UPDATE practices.registro_horas
          SET
            fecha = $1,
            horas = $2,
            observacion = $3,
            registrado_por = $4,
            actualizado_en = NOW()
          WHERE id_registro = $5
          RETURNING ${HOURS_RECORD_COLUMNS}
        `,
        [
          values.fecha,
          values.horas,
          values.observacion,
          values.registradoPor,
          idRegistro,
        ]
      );

      return res.json({
        message: 'Registro de horas corregido correctamente',
        data: {
          registro: mapHoursRecord(result.rows[0]),
          resumen: hoursSummary(
            await findHoursAssignment(idAsignacion)
          ),
        },
      });
    } catch (error) {
      console.error('Error corrigiendo registro de horas:', error);

      return res.status(500).json({
        message: 'No fue posible corregir el registro de horas',
      });
    }
  }
);

app.delete(
  '/api/practice-hours/:idAsignacion/records/:idRegistro',
  async (req, res) => {
    const idAsignacion = parsePositiveId(req.params.idAsignacion);
    const idRegistro = parsePositiveId(req.params.idRegistro);

    if (!idAsignacion || !idRegistro) {
      return res.status(400).json({
        message: 'Asignación o registro no válidos',
      });
    }

    try {
      const found = await findEditableHoursRecord(
        idAsignacion,
        idRegistro
      );

      if ('status' in found) {
        return res
          .status(found.status)
          .json({ message: found.message });
      }

      await pool.query(
        `DELETE FROM practices.registro_horas WHERE id_registro = $1`,
        [idRegistro]
      );

      return res.json({
        message: 'Registro de horas eliminado correctamente',
        data: {
          resumen: hoursSummary(
            await findHoursAssignment(idAsignacion)
          ),
        },
      });
    } catch (error) {
      console.error('Error eliminando registro de horas:', error);

      return res.status(500).json({
        message: 'No fue posible eliminar el registro de horas',
      });
    }
  }
);

// Mi Seguimiento (Estudiante): sus asignaciones no canceladas,
// la vigente primero, cada una con su resumen e historial.
app.get(
  '/api/internal/students/:idEstudiante/practice-hours',
  async (req, res) => {
    const idEstudiante = parsePositiveId(req.params.idEstudiante);

    if (!idEstudiante) {
      return res.status(400).json({
        message: 'El identificador del estudiante no es válido',
      });
    }

    try {
      const result = await pool.query(
        `${HOURS_ASSIGNMENT_SQL}
         WHERE a.id_estudiante = $1
           AND a.estado <> 'CANCELADA'
         ORDER BY
           CASE a.estado
             WHEN 'EN_CURSO' THEN 0
             WHEN 'ASIGNADA' THEN 1
             ELSE 2
           END,
           a.periodo_academico DESC,
           a.id_asignacion DESC`,
        [idEstudiante]
      );

      const data = [];

      for (const row of result.rows) {
        const detail = await hoursDetail(row);

        // El estudiante solo consulta: sin permisos de edición
        // ni identificadores internos de quién registró.
        // Visitas del docente: solo fecha y descripción (las
        // observaciones son internas del docente).
        const visitas = (await listVisits(row.id_asignacion)).map(
          (visita) => ({
            id_visita: visita.id_visita,
            fecha: visita.fecha,
            descripcion: visita.descripcion,
          })
        );

        data.push({
          ...hoursSummary(row),
          registros: detail.registros.map(
            ({ registrado_por, ...registro }) => registro
          ),
          visitas,
        });
      }

      return res.json({ data });
    } catch (error) {
      console.error('Error consultando horas del estudiante:', error);

      return res.status(500).json({
        message: 'No fue posible consultar el seguimiento de horas',
      });
    }
  }
);

// ========================================================
// VISITAS DEL DOCENTE ASESOR (CU "Realizar Seguimiento de
// Prácticas", BS3)
//
// La visita es a la institución donde el estudiante hace la
// práctica: se asocia a la ASIGNACIÓN, enlazada al grupo del
// docente por misma práctica + período (la no cancelada más
// reciente, igual que el registro del tutor).
// - Registrar/corregir: docente del grupo, estudiante en el
//   grupo, asignación EN_CURSO; fecha entre el inicio y hoy.
// - Solo corrige las propias; no hay borrado (historial).
// - El estudiante solo ve fecha y descripción.
// ========================================================

const MAX_TEXTO_VISITA = 2000;

// $1 = id_estudiante, $2 = id_practica, $3 = periodo
const VISIT_ASSIGNMENT_SQL = `
  SELECT
    a.id_asignacion,
    a.id_estudiante,
    a.estado,
    a.periodo_academico,
    p.nombre AS practica,
    i.nombre AS institucion,
    to_char(a.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
    to_char(a.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
    to_char(
      LEAST(
        COALESCE(
          a.fecha_inicio,
          (a.creado_en AT TIME ZONE 'America/Bogota')::date
        ),
        (NOW() AT TIME ZONE 'America/Bogota')::date
      ),
      'YYYY-MM-DD'
    ) AS fecha_minima,
    to_char(
      (NOW() AT TIME ZONE 'America/Bogota')::date,
      'YYYY-MM-DD'
    ) AS hoy
  FROM practices.asignacion_practica a
  INNER JOIN practices.practica p
    ON p.id_practica = a.id_practica
  INNER JOIN practices.institucion i
    ON i.id_institucion = a.id_institucion
`;

function mapVisit(row: any, idDocente: number | null) {
  return {
    id_visita: row.id_visita,
    id_docente: row.id_docente,
    fecha: row.fecha,
    descripcion: row.descripcion,
    observaciones: row.observaciones,
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
    editada:
      new Date(row.actualizado_en).getTime() -
        new Date(row.creado_en).getTime() >
      1000,
    propia: idDocente !== null && Number(row.id_docente) === idDocente,
  };
}

async function listVisits(idAsignacion: number) {
  const result = await pool.query(
    `
      SELECT
        id_visita,
        id_docente,
        to_char(fecha, 'YYYY-MM-DD') AS fecha,
        descripcion,
        observaciones,
        creado_en,
        actualizado_en
      FROM practices.visita_docente
      WHERE id_asignacion = $1
      ORDER BY fecha DESC, id_visita DESC
    `,
    [idAsignacion]
  );

  return result.rows;
}

// Grupo del docente + pertenencia actual del estudiante +
// asignación enlazada (o null). null si el grupo no es suyo.
async function findVisitContext(
  idDocente: number,
  idGrupo: number,
  idEstudiante: number
) {
  const group = await pool.query(
    `
      SELECT
        g.id_practica,
        g.periodo_academico,
        EXISTS (
          SELECT 1
          FROM practices.grupo_estudiante ge
          WHERE ge.id_grupo = g.id_grupo
            AND ge.id_estudiante = $3
        ) AS en_grupo
      FROM practices.grupo g
      WHERE g.id_grupo = $1
        AND g.id_docente = $2
    `,
    [idGrupo, idDocente, idEstudiante]
  );

  if ((group.rowCount ?? 0) === 0) {
    return null;
  }

  const { id_practica, periodo_academico, en_grupo } = group.rows[0];

  const assignment = await pool.query(
    `${VISIT_ASSIGNMENT_SQL}
     WHERE a.id_estudiante = $1
       AND a.id_practica = $2
       AND a.periodo_academico = $3
     ORDER BY
       (a.estado <> 'CANCELADA') DESC,
       a.id_asignacion DESC
     LIMIT 1`,
    [idEstudiante, id_practica, periodo_academico]
  );

  return {
    enGrupo: Boolean(en_grupo),
    assignment: assignment.rows[0] ?? null,
  };
}

function visitAssignmentInfo(row: any) {
  return {
    id_asignacion: row.id_asignacion,
    estado: row.estado,
    practica: row.practica,
    institucion: row.institucion,
    periodo_academico: row.periodo_academico,
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
  };
}

// Motivo por el que no se pueden registrar visitas (o null).
function visitBlockReason(context: {
  enGrupo: boolean;
  assignment: any;
}): string | null {
  if (!context.assignment) {
    return 'El estudiante no tiene una asignación de práctica para este período';
  }

  if (!context.enGrupo) {
    return 'El estudiante ya no pertenece al grupo';
  }

  if (context.assignment.estado !== 'EN_CURSO') {
    return 'Solo se registran visitas con la práctica en curso';
  }

  return null;
}

function validateVisit(
  body: any,
  assignment: any
):
  | { error: string }
  | { fecha: string; descripcion: string; observaciones: string | null } {
  const fecha =
    typeof body?.fecha === 'string' ? body.fecha.trim() : '';

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    Number.isNaN(Date.parse(fecha + 'T00:00:00Z')) ||
    new Date(fecha + 'T00:00:00Z').toISOString().slice(0, 10) !==
      fecha
  ) {
    return { error: 'La fecha de la visita no es válida' };
  }

  if (fecha > assignment.hoy) {
    return { error: 'La fecha de la visita no puede ser futura' };
  }

  if (fecha < assignment.fecha_minima) {
    return {
      error:
        'La fecha de la visita no puede ser anterior al inicio de la práctica',
    };
  }

  const descripcion =
    typeof body?.descripcion === 'string' ? body.descripcion.trim() : '';

  if (!descripcion) {
    return { error: 'La descripción de la visita es obligatoria' };
  }

  if (descripcion.length > MAX_TEXTO_VISITA) {
    return {
      error: `La descripción no puede superar ${MAX_TEXTO_VISITA} caracteres`,
    };
  }

  const observaciones =
    typeof body?.observaciones === 'string'
      ? body.observaciones.trim()
      : '';

  if (observaciones.length > MAX_TEXTO_VISITA) {
    return {
      error: `Las observaciones no pueden superar ${MAX_TEXTO_VISITA} caracteres`,
    };
  }

  return { fecha, descripcion, observaciones: observaciones || null };
}

function parseVisitParams(req: express.Request) {
  return {
    idDocente: parsePositiveId(req.params.idDocente),
    idGrupo: parsePositiveId(req.params.idGrupo),
    idEstudiante: parsePositiveId(req.params.idEstudiante),
  };
}

const TEACHER_VISITS_PATH =
  '/api/internal/teachers/:idDocente/groups/:idGrupo/students/:idEstudiante/visits';

// Docente: historial de visitas del estudiante del grupo.
app.get(TEACHER_VISITS_PATH, async (req, res) => {
  const { idDocente, idGrupo, idEstudiante } = parseVisitParams(req);

  if (!idDocente || !idGrupo || !idEstudiante) {
    return res.status(400).json({
      message: 'Docente, grupo o estudiante no válidos',
    });
  }

  try {
    const context = await findVisitContext(idDocente, idGrupo, idEstudiante);

    if (!context) {
      return res.status(404).json({ message: 'Grupo no encontrado' });
    }

    const { assignment } = context;
    const motivo = visitBlockReason(context);

    return res.json({
      data: {
        asignacion: assignment ? visitAssignmentInfo(assignment) : null,
        en_grupo: context.enGrupo,
        puede_registrar: motivo === null,
        motivo_bloqueo: motivo,
        fecha_minima: assignment?.fecha_minima ?? null,
        fecha_maxima: assignment?.hoy ?? null,
        visitas: assignment
          ? (await listVisits(assignment.id_asignacion)).map((row) =>
              mapVisit(row, idDocente)
            )
          : [],
      },
    });
  } catch (error) {
    console.error('Error consultando visitas del docente:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las visitas',
    });
  }
});

// Docente: registrar una visita.
app.post(TEACHER_VISITS_PATH, async (req, res) => {
  const { idDocente, idGrupo, idEstudiante } = parseVisitParams(req);

  if (!idDocente || !idGrupo || !idEstudiante) {
    return res.status(400).json({
      message: 'Docente, grupo o estudiante no válidos',
    });
  }

  try {
    const context = await findVisitContext(idDocente, idGrupo, idEstudiante);

    if (!context) {
      return res.status(404).json({ message: 'Grupo no encontrado' });
    }

    const motivo = visitBlockReason(context);

    if (motivo) {
      return res.status(409).json({ message: motivo });
    }

    const valid = validateVisit(req.body, context.assignment);

    if ('error' in valid) {
      return res.status(400).json({ message: valid.error });
    }

    const result = await pool.query(
      `
        INSERT INTO practices.visita_docente (
          id_asignacion,
          id_docente,
          fecha,
          descripcion,
          observaciones
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id_visita,
          id_docente,
          to_char(fecha, 'YYYY-MM-DD') AS fecha,
          descripcion,
          observaciones,
          creado_en,
          actualizado_en
      `,
      [
        context.assignment.id_asignacion,
        idDocente,
        valid.fecha,
        valid.descripcion,
        valid.observaciones,
      ]
    );

    return res.status(201).json({
      message: 'Visita registrada correctamente',
      data: mapVisit(result.rows[0], idDocente),
    });
  } catch (error) {
    console.error('Error registrando visita:', error);

    return res.status(500).json({
      message: 'No fue posible registrar la visita',
    });
  }
});

// Docente: corregir una visita propia.
app.put(TEACHER_VISITS_PATH + '/:idVisita', async (req, res) => {
  const { idDocente, idGrupo, idEstudiante } = parseVisitParams(req);
  const idVisita = parsePositiveId(req.params.idVisita);

  if (!idDocente || !idGrupo || !idEstudiante || !idVisita) {
    return res.status(400).json({
      message: 'Visita no válida',
    });
  }

  try {
    const context = await findVisitContext(idDocente, idGrupo, idEstudiante);

    if (!context) {
      return res.status(404).json({ message: 'Grupo no encontrado' });
    }

    const visit = context.assignment
      ? await pool.query(
          `
            SELECT id_docente
            FROM practices.visita_docente
            WHERE id_visita = $1
              AND id_asignacion = $2
          `,
          [idVisita, context.assignment.id_asignacion]
        )
      : null;

    if (!visit || (visit.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }

    if (Number(visit.rows[0].id_docente) !== idDocente) {
      return res.status(403).json({
        message: 'Solo puede corregir las visitas que usted registró',
      });
    }

    const motivo = visitBlockReason(context);

    if (motivo) {
      return res.status(409).json({ message: motivo });
    }

    const valid = validateVisit(req.body, context.assignment);

    if ('error' in valid) {
      return res.status(400).json({ message: valid.error });
    }

    const result = await pool.query(
      `
        UPDATE practices.visita_docente
        SET
          fecha = $2,
          descripcion = $3,
          observaciones = $4,
          actualizado_en = NOW()
        WHERE id_visita = $1
        RETURNING
          id_visita,
          id_docente,
          to_char(fecha, 'YYYY-MM-DD') AS fecha,
          descripcion,
          observaciones,
          creado_en,
          actualizado_en
      `,
      [idVisita, valid.fecha, valid.descripcion, valid.observaciones]
    );

    return res.json({
      message: 'Visita actualizada correctamente',
      data: mapVisit(result.rows[0], idDocente),
    });
  } catch (error) {
    console.error('Error actualizando visita:', error);

    return res.status(500).json({
      message: 'No fue posible actualizar la visita',
    });
  }
});

// Coordinador: visitas de una asignación (solo lectura).
app.get('/api/practice-assignments/:id/visits', async (req, res) => {
  const idAsignacion = parsePositiveId(req.params.id);

  if (!idAsignacion) {
    return res.status(400).json({
      message: 'El identificador de la asignación no es válido',
    });
  }

  try {
    const exists = await pool.query(
      `SELECT 1 FROM practices.asignacion_practica WHERE id_asignacion = $1`,
      [idAsignacion]
    );

    if ((exists.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Asignación no encontrada' });
    }

    return res.json({
      data: (await listVisits(idAsignacion)).map((row) =>
        mapVisit(row, null)
      ),
    });
  } catch (error) {
    console.error('Error consultando visitas de la asignación:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las visitas',
    });
  }
});

// ========================================================
// REPORTES DEL COORDINADOR (CU "Generar Reportes")
//
// Datos internos (solo IDs de personas) para los reportes
// que arma el Gateway. Los filtros llegan ya validados por
// el Gateway; aquí se vuelven a normalizar por seguridad.
// ========================================================

const ESTADOS_ASIGNACION = [
  'ASIGNADA',
  'EN_CURSO',
  'FINALIZADA',
  'CANCELADA',
];

function reportFilters(query: any) {
  const text = (value: unknown) =>
    typeof value === 'string' ? value.trim() : '';

  const periodo = text(query.periodo);
  const estado = text(query.estado);
  const isoDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z'))
      ? value
      : null;

  return {
    programa: parsePositiveId(query.programa),
    practica: parsePositiveId(query.practica),
    estudiante: parsePositiveId(query.estudiante),
    docente: parsePositiveId(query.docente),
    grupo: parsePositiveId(query.grupo),
    periodo: /^\d{4}-[12]$/.test(periodo) ? periodo : null,
    estado: ESTADOS_ASIGNACION.includes(estado) ? estado : null,
    desde: isoDate(text(query.desde)),
    hasta: isoDate(text(query.hasta)),
  };
}

// Opciones de los filtros: catálogos y relaciones para
// encadenar Programa → Práctica → Grupo → Estudiante.
app.get('/api/internal/reports/options', async (_req, res) => {
  try {
    const [programas, practicas, periodos, grupos, estudiantes] =
      await Promise.all([
        pool.query(`
          SELECT id_programa, nombre
          FROM practices.programa
          ORDER BY nombre
        `),
        pool.query(`
          SELECT id_practica, nombre, id_programa
          FROM practices.practica
          ORDER BY nombre
        `),
        pool.query(`
          SELECT periodo_academico
          FROM practices.asignacion_practica
          UNION
          SELECT periodo_academico
          FROM practices.grupo
          ORDER BY periodo_academico DESC
        `),
        pool.query(`
          SELECT
            g.id_grupo,
            g.nombre,
            g.id_practica,
            p.id_programa,
            g.periodo_academico,
            g.id_docente,
            g.estado,
            COALESCE(
              array_agg(ge.id_estudiante ORDER BY ge.id_estudiante)
                FILTER (WHERE ge.id_estudiante IS NOT NULL),
              '{}'
            ) AS estudiantes
          FROM practices.grupo g
          INNER JOIN practices.practica p
            ON p.id_practica = g.id_practica
          LEFT JOIN practices.grupo_estudiante ge
            ON ge.id_grupo = g.id_grupo
          GROUP BY g.id_grupo, p.id_programa
          ORDER BY g.periodo_academico DESC, g.nombre
        `),
        // Estudiante con práctica y período (asignaciones y grupos)
        pool.query(`
          SELECT DISTINCT
            x.id_estudiante,
            x.id_practica,
            p.id_programa,
            x.periodo_academico
          FROM (
            SELECT id_estudiante, id_practica, periodo_academico
            FROM practices.asignacion_practica
            UNION
            SELECT ge.id_estudiante, g.id_practica, g.periodo_academico
            FROM practices.grupo_estudiante ge
            INNER JOIN practices.grupo g
              ON g.id_grupo = ge.id_grupo
          ) x
          INNER JOIN practices.practica p
            ON p.id_practica = x.id_practica
        `),
      ]);

    return res.json({
      data: {
        programas: programas.rows,
        practicas: practicas.rows,
        periodos: periodos.rows.map((row) => row.periodo_academico),
        grupos: grupos.rows,
        estudiantes: estudiantes.rows,
      },
    });
  } catch (error) {
    console.error('Error consultando opciones de reportes:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las opciones de los reportes',
    });
  }
});

// Reporte 2: asignaciones de práctica (rango = fecha de inicio)
app.get('/api/internal/reports/assignments', async (req, res) => {
  const f = reportFilters(req.query);

  try {
    const result = await pool.query(
      `
        SELECT
          a.id_asignacion,
          a.id_estudiante,
          a.id_tutor,
          a.periodo_academico,
          a.estado,
          to_char(a.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
          to_char(a.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
          p.nombre AS practica,
          pr.nombre AS programa,
          i.nombre AS institucion,
          p.horas_requeridas,
          COALESCE(h.total, 0)::float AS horas_realizadas,
          ev.calificacion::float AS evaluacion_tutor,
          ev.recomienda_aprobacion
        FROM practices.asignacion_practica a
        INNER JOIN practices.practica p
          ON p.id_practica = a.id_practica
        INNER JOIN practices.programa pr
          ON pr.id_programa = p.id_programa
        INNER JOIN practices.institucion i
          ON i.id_institucion = a.id_institucion
        LEFT JOIN (
          SELECT id_asignacion, SUM(horas) AS total
          FROM practices.registro_horas
          GROUP BY id_asignacion
        ) h
          ON h.id_asignacion = a.id_asignacion
        LEFT JOIN practices.evaluacion_tutor ev
          ON ev.id_asignacion = a.id_asignacion
        WHERE ($1::int IS NULL OR p.id_programa = $1::int)
          AND ($2::int IS NULL OR a.id_practica = $2::int)
          AND ($3::varchar IS NULL OR a.periodo_academico = $3::varchar)
          AND ($4::varchar IS NULL OR a.estado = $4::varchar)
          AND ($5::date IS NULL OR a.fecha_inicio >= $5::date)
          AND ($6::date IS NULL OR a.fecha_inicio <= $6::date)
        ORDER BY
          a.periodo_academico DESC,
          p.nombre,
          a.id_asignacion
      `,
      [f.programa, f.practica, f.periodo, f.estado, f.desde, f.hasta]
    );

    return res.json({ data: result.rows });
  } catch (error) {
    console.error('Error consultando reporte de asignaciones:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las asignaciones',
    });
  }
});

// Reporte 3: horas de práctica (rango = fecha del registro).
// Asignaciones no canceladas; horas del rango y acumuladas.
app.get('/api/internal/reports/hours', async (req, res) => {
  const f = reportFilters(req.query);

  try {
    const assignments = await pool.query(
      `
        SELECT
          a.id_asignacion,
          a.id_estudiante,
          a.periodo_academico,
          a.estado,
          p.nombre AS practica,
          i.nombre AS institucion,
          p.horas_requeridas,
          COALESCE(SUM(r.horas), 0)::float AS horas_totales,
          COALESCE(SUM(r.horas) FILTER (
            WHERE ($6::date IS NULL OR r.fecha >= $6::date)
              AND ($7::date IS NULL OR r.fecha <= $7::date)
          ), 0)::float AS horas_rango,
          COUNT(r.id_registro) FILTER (
            WHERE ($6::date IS NULL OR r.fecha >= $6::date)
              AND ($7::date IS NULL OR r.fecha <= $7::date)
          )::int AS registros_rango
        FROM practices.asignacion_practica a
        INNER JOIN practices.practica p
          ON p.id_practica = a.id_practica
        INNER JOIN practices.institucion i
          ON i.id_institucion = a.id_institucion
        LEFT JOIN practices.registro_horas r
          ON r.id_asignacion = a.id_asignacion
        WHERE a.estado <> 'CANCELADA'
          AND ($1::int IS NULL OR p.id_programa = $1::int)
          AND ($2::int IS NULL OR a.id_practica = $2::int)
          AND ($3::varchar IS NULL OR a.periodo_academico = $3::varchar)
          AND ($4::int IS NULL OR a.id_estudiante = $4::int)
          AND ($5::varchar IS NULL OR a.estado = $5::varchar)
        GROUP BY a.id_asignacion, p.id_practica, i.id_institucion
        ORDER BY a.periodo_academico DESC, p.nombre, a.id_asignacion
      `,
      [
        f.programa,
        f.practica,
        f.periodo,
        f.estudiante,
        f.estado,
        f.desde,
        f.hasta,
      ]
    );

    const ids = assignments.rows.map((row) => row.id_asignacion);

    const records = ids.length
      ? await pool.query(
          `
            SELECT
              id_asignacion,
              to_char(fecha, 'YYYY-MM-DD') AS fecha,
              horas::float AS horas,
              observacion
            FROM practices.registro_horas
            WHERE id_asignacion = ANY($1::int[])
              AND ($2::date IS NULL OR fecha >= $2::date)
              AND ($3::date IS NULL OR fecha <= $3::date)
            ORDER BY fecha, id_registro
          `,
          [ids, f.desde, f.hasta]
        )
      : { rows: [] };

    return res.json({
      data: {
        asignaciones: assignments.rows,
        registros: records.rows,
      },
    });
  } catch (error) {
    console.error('Error consultando reporte de horas:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las horas de práctica',
    });
  }
});

// Reporte 5: visitas por grupo del docente (rango = fecha de
// la visita). La visita cuenta para el grupo si es del mismo
// docente sobre la asignación (misma práctica + período, no
// cancelada) de un integrante actual.
app.get('/api/internal/reports/teacher-visits', async (req, res) => {
  const f = reportFilters(req.query);

  try {
    const result = await pool.query(
      `
        SELECT
          g.id_grupo,
          g.nombre,
          g.id_docente,
          g.periodo_academico,
          g.estado,
          p.nombre AS practica,
          COUNT(DISTINCT ge.id_estudiante)::int AS integrantes,
          COUNT(DISTINCT v.id_visita)::int AS visitas,
          COUNT(DISTINCT a.id_estudiante) FILTER (
            WHERE v.id_visita IS NOT NULL
          )::int AS estudiantes_visitados
        FROM practices.grupo g
        INNER JOIN practices.practica p
          ON p.id_practica = g.id_practica
        LEFT JOIN practices.grupo_estudiante ge
          ON ge.id_grupo = g.id_grupo
        LEFT JOIN practices.asignacion_practica a
          ON a.id_estudiante = ge.id_estudiante
         AND a.id_practica = g.id_practica
         AND a.periodo_academico = g.periodo_academico
         AND a.estado <> 'CANCELADA'
        LEFT JOIN practices.visita_docente v
          ON v.id_asignacion = a.id_asignacion
         AND v.id_docente = g.id_docente
         AND ($3::date IS NULL OR v.fecha >= $3::date)
         AND ($4::date IS NULL OR v.fecha <= $4::date)
        WHERE ($1::varchar IS NULL OR g.periodo_academico = $1::varchar)
          AND ($2::int IS NULL OR g.id_docente = $2::int)
        GROUP BY g.id_grupo, p.id_practica
        ORDER BY g.periodo_academico DESC, g.nombre
      `,
      [f.periodo, f.docente, f.desde, f.hasta]
    );

    return res.json({ data: result.rows });
  } catch (error) {
    console.error('Error consultando visitas por grupo:', error);

    return res.status(500).json({
      message: 'No fue posible consultar las visitas de los docentes',
    });
  }
});

const port = process.env.PORT || 3335;

const server = app.listen(port, () => {
  console.log(`Practice Service listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
