import 'dotenv/config';
import express from 'express';
import { pool } from './database/database';
import { randomUUID } from 'crypto';
import { EVIDENCE_BUCKET, storage } from './storage/storage';
import {
  ALLOWED_FORMATS_LABEL,
  MAX_EVIDENCE_BYTES,
  detectEvidenceType,
  sanitizeFileName,
} from './storage/file-type';

const app = express();

app.use(express.json());


// ======================================================
// HEALTH - ACTIVITY SERVICE
// ======================================================

app.get('/api', (_req, res) => {
  return res.json({
    service: 'activity-service',
    status: 'ok',
  });
});


// ======================================================
// HEALTH - DATABASE
// ======================================================

app.get('/api/database/health', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT NOW() AS time'
    );

    return res.json({
      service: 'activity-service',
      database: 'connected',
      time: result.rows[0].time,
    });
  } catch (error) {
    console.error(
      'Error conectando Activity Service a la base de datos:',
      error
    );

    return res.status(500).json({
      service: 'activity-service',
      database: 'error',
    });
  }
});


// ======================================================
// SERVER
// ======================================================

// ======================================================
// CU04 - ACTIVIDADES DE SEGUIMIENTO
// ======================================================

interface TeacherGroup {
  id_grupo: number;
  nombre: string;
  semestre: number | null;
  estado: string;
  id_docente: number;
  id_practica: number;
  practica: string;
  periodo_academico: string;
  total_estudiantes: number;
}


// ------------------------------------------------------
// Obtener grupos asignados al docente desde
// practice-service
// ------------------------------------------------------

async function getTeacherGroups(
  idDocente: number
): Promise<TeacherGroup[]> {
  const response = await fetch(
    'http://localhost:3335/api/internal/groups/by-teacher/' +
      idDocente
  );

  if (!response.ok) {
    throw new Error(
      'No fue posible consultar los grupos del docente'
    );
  }

  const body = (await response.json()) as {
    data: TeacherGroup[];
  };

  return body.data ?? [];
}

// ------------------------------------------------------
// Obtener estudiantes pertenecientes a un grupo
// desde practice-service
// ------------------------------------------------------

async function getGroupStudentIds(
  idGrupo: number
): Promise<number[]> {
  const response = await fetch(
    'http://localhost:3335/api/internal/groups/' +
      idGrupo +
      '/students'
  );

  if (!response.ok) {
    throw new Error(
      'No fue posible consultar los estudiantes del grupo'
    );
  }

  const body = (await response.json()) as {
    data: number[];
  };

  return (body.data ?? []).map(Number);
}


// ======================================================
// LISTAR ACTIVIDADES DEL DOCENTE
// ======================================================

app.get(
  '/api/activities/teacher/:idDocente',
  async (req, res) => {
    const idDocente = Number(req.params.idDocente);

    const idGrupo =
      req.query.groupId !== undefined
        ? Number(req.query.groupId)
        : null;

    if (
      !Number.isInteger(idDocente) ||
      idDocente <= 0
    ) {
      return res.status(400).json({
        message:
          'El identificador del docente no es válido',
      });
    }

    if (
      idGrupo !== null &&
      (
        !Number.isInteger(idGrupo) ||
        idGrupo <= 0
      )
    ) {
      return res.status(400).json({
        message:
          'El identificador del grupo no es válido',
      });
    }

    try {
      const grupos = await getTeacherGroups(
        idDocente
      );

      const groupIds = grupos.map(
        (grupo) => grupo.id_grupo
      );

      if (
        idGrupo !== null &&
        !groupIds.includes(idGrupo)
      ) {
        return res.status(403).json({
          message:
            'El grupo seleccionado no pertenece al Docente Asesor',
        });
      }

      if (groupIds.length === 0) {
        return res.json({
          data: [],
        });
      }

      const params: unknown[] = [idDocente];

      let groupFilter = '';

      if (idGrupo !== null) {
        params.push(idGrupo);

        groupFilter =
          'AND a.id_grupo = $2';
      }

      const result = await pool.query(
        `
          SELECT
            a.id_actividad,
            a.id_grupo,
            a.id_docente,
            a.titulo,
            a.descripcion,
            a.fecha_limite,
            a.hora_limite,
            a.estado,
            a.creado_en,
            a.actualizado_en,

            COUNT(p.id_pregunta)::int
              AS total_preguntas

          FROM activities.actividad a

          LEFT JOIN activities.pregunta p
            ON p.id_actividad =
               a.id_actividad

          WHERE
            a.id_docente = $1

            ${groupFilter}

          GROUP BY
            a.id_actividad

          ORDER BY
            a.creado_en DESC
        `,
        params
      );

      const data = result.rows.map(
        (actividad) => {
          const grupo = grupos.find(
            (item) =>
              Number(item.id_grupo) ===
              Number(actividad.id_grupo)
          );

          return {
            ...actividad,

            grupo: grupo
              ? {
                  id_grupo:
                    grupo.id_grupo,

                  nombre:
                    grupo.nombre,

                  practica:
                    grupo.practica,

                  semestre:
                    grupo.semestre,

                  estado:
                    grupo.estado,
                }
              : null,
          };
        }
      );

      return res.json({
        data,
      });
    } catch (error) {
      console.error(
        'Error consultando actividades:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar las actividades',
      });
    }
  }
);


// ======================================================
// PUBLICAR ACTIVIDAD
// ======================================================

app.post(
  '/api/activities',
  async (req, res) => {
    const idDocente = Number(
      req.body?.id_docente
    );

    const idGrupo = Number(
      req.body?.id_grupo
    );

    const titulo = String(
      req.body?.titulo ?? ''
    ).trim();

    const descripcion = String(
      req.body?.descripcion ?? ''
    ).trim();

    const fechaLimite = String(
      req.body?.fecha_limite ?? ''
    ).trim();

    const horaLimite = String(
      req.body?.hora_limite ?? ''
    ).trim();

    const preguntas = Array.isArray(
      req.body?.preguntas
    )
      ? req.body.preguntas
          .map(
            (pregunta: unknown) =>
              String(pregunta).trim()
          )
          .filter(
            (pregunta: string) =>
              pregunta.length > 0
          )
      : [];

    // --------------------------------------------------
    // Campos obligatorios
    // --------------------------------------------------

    if (
      !Number.isInteger(idDocente) ||
      idDocente <= 0 ||
      !Number.isInteger(idGrupo) ||
      idGrupo <= 0 ||
      !titulo ||
      !descripcion ||
      !fechaLimite ||
      !horaLimite
    ) {
      return res.status(400).json({
        message:
          'Docente, grupo, título, descripción, fecha límite y hora límite son obligatorios',
      });
    }

    // --------------------------------------------------
    // Formato fecha
    // YYYY-MM-DD
    // --------------------------------------------------

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        fechaLimite
      )
    ) {
      return res.status(400).json({
        message:
          'La fecha límite no tiene un formato válido',
      });
    }

    // --------------------------------------------------
    // Formato hora
    // HH:mm o HH:mm:ss
    // --------------------------------------------------

    if (
      !/^\d{2}:\d{2}(:\d{2})?$/.test(
        horaLimite
      )
    ) {
      return res.status(400).json({
        message:
          'La hora límite no tiene un formato válido',
      });
    }

    // --------------------------------------------------
    // Al menos una pregunta
    // --------------------------------------------------

    if (preguntas.length === 0) {
      return res.status(400).json({
        message:
          'La actividad debe contener al menos una pregunta',
      });
    }

    // --------------------------------------------------
    // Preguntas duplicadas
    // --------------------------------------------------

    const preguntasNormalizadas =
      preguntas.map(
        (pregunta: string) =>
          pregunta.toLowerCase()
      );

    if (
      new Set(preguntasNormalizadas)
        .size !==
      preguntasNormalizadas.length
    ) {
      return res.status(400).json({
        message:
          'La actividad contiene preguntas duplicadas',
      });
    }

    const client =
      await pool.connect();

    try {
      // ------------------------------------------------
      // Validar que el grupo realmente pertenezca
      // al docente
      // ------------------------------------------------

      const grupos =
        await getTeacherGroups(
          idDocente
        );

      const grupo = grupos.find(
        (item) =>
          Number(item.id_grupo) ===
          idGrupo
      );

      if (!grupo) {
        return res.status(403).json({
          message:
            'El grupo seleccionado no pertenece al Docente Asesor',
        });
      }

      // ------------------------------------------------
      // El grupo debe estar activo
      // ------------------------------------------------

      if (grupo.estado !== 'ACTIVO') {
        return res.status(409).json({
          message:
            'No es posible publicar actividades en un grupo cerrado',
        });
      }

      // ------------------------------------------------
// Obtener estudiantes actuales del grupo
//
// La actividad queda asignada a los estudiantes
// que pertenecen al grupo al momento de publicarla.
// ------------------------------------------------

const estudiantes =
  await getGroupStudentIds(idGrupo);

if (estudiantes.length === 0) {
  return res.status(409).json({
    message:
      'No es posible publicar una actividad en un grupo sin estudiantes',
  });
}



      // ------------------------------------------------
      // Validar fecha/hora futura
      // usando zona horaria Colombia
      // ------------------------------------------------

      const deadlineResult =
        await client.query(
          `
            SELECT
              (
                ($1::date + $2::time)
                AT TIME ZONE
                'America/Bogota'
              ) > NOW()
              AS valid
          `,
          [
            fechaLimite,
            horaLimite,
          ]
        );

      if (
        !deadlineResult.rows[0]?.valid
      ) {
        return res.status(400).json({
          message:
            'La fecha y hora límite deben ser posteriores al momento actual',
        });
      }

      // ------------------------------------------------
      // Transacción
      // ------------------------------------------------

      await client.query('BEGIN');

      const activityResult =
        await client.query(
          `
            INSERT INTO activities.actividad (
              id_grupo,
              id_docente,
              titulo,
              descripcion,
              fecha_limite,
              hora_limite
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6
            )

            RETURNING
              id_actividad,
              id_grupo,
              id_docente,
              titulo,
              descripcion,
              fecha_limite,
              hora_limite,
              estado,
              creado_en,
              actualizado_en
          `,
          [
            idGrupo,
            idDocente,
            titulo,
            descripcion,
            fechaLimite,
            horaLimite,
          ]
        );

      const actividad =
        activityResult.rows[0];

      const preguntasCreadas = [];

      for (
        let index = 0;
        index < preguntas.length;
        index++
      ) {
        const questionResult =
          await client.query(
            `
              INSERT INTO activities.pregunta (
                id_actividad,
                enunciado,
                orden
              )
              VALUES (
                $1,
                $2,
                $3
              )

              RETURNING
                id_pregunta,
                id_actividad,
                enunciado,
                orden
            `,
            [
              actividad.id_actividad,
              preguntas[index],
              index + 1,
            ]
          );

        preguntasCreadas.push(
          questionResult.rows[0]
        );
      }

     for (
  const idEstudiante of estudiantes
) {
  await client.query(
    `
      INSERT INTO
        activities.actividad_estudiante (
          id_actividad,
          id_estudiante,
          estado
        )
      VALUES (
        $1,
        $2,
        'PENDIENTE'
      )
      ON CONFLICT (
        id_actividad,
        id_estudiante
      )
      DO NOTHING
    `,
    [
      actividad.id_actividad,
      idEstudiante,
    ]
  );
}

await client.query(
  'COMMIT'
);

      return res
        .status(201)
        .json({
          data: {
            ...actividad,

            grupo: {
              id_grupo:
                grupo.id_grupo,

              nombre:
                grupo.nombre,

              practica:
                grupo.practica,
            },

            preguntas:
              preguntasCreadas,

            total_estudiantes_asignados:
              estudiantes.length,
          },

          message:
            'Actividad publicada correctamente',
        });
    } catch (error) {
      await client
        .query('ROLLBACK')
        .catch(() => {});

      console.error(
        'Error publicando actividad:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible publicar la actividad',
      });
    } finally {
      client.release();
    }
  }
);

// ======================================================
// DETALLE DE ACTIVIDAD
// ======================================================

app.get('/api/activities/:id', async (req, res) => {
  const idActividad = Number(req.params.id);
  const idDocente = Number(req.query.teacherId);

  if (
    !Number.isInteger(idActividad) ||
    idActividad <= 0 ||
    !Number.isInteger(idDocente) ||
    idDocente <= 0
  ) {
    return res.status(400).json({
      message: 'Actividad o docente no válido',
    });
  }

  try {
    const activityResult = await pool.query(
      `
        SELECT
          id_actividad,
          id_grupo,
          id_docente,
          titulo,
          descripcion,
          fecha_limite,
          hora_limite,
          estado,
          creado_en,
          actualizado_en
        FROM activities.actividad
        WHERE
          id_actividad = $1
          AND id_docente = $2
      `,
      [idActividad, idDocente]
    );

    if ((activityResult.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: 'Actividad no encontrada',
      });
    }

    const questionsResult = await pool.query(
      `
        SELECT
          id_pregunta,
          enunciado,
          orden
        FROM activities.pregunta
        WHERE id_actividad = $1
        ORDER BY orden ASC
      `,
      [idActividad]
    );

    return res.json({
      data: {
        ...activityResult.rows[0],
        preguntas: questionsResult.rows,
      },
    });
  } catch (error) {
    console.error(
      'Error consultando actividad:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar la actividad',
    });
  }
});

// ======================================================
// ACTUALIZAR ACTIVIDAD
// ======================================================

app.patch('/api/activities/:id', async (req, res) => {
  const idActividad = Number(req.params.id);
  const idDocente = Number(req.body?.id_docente);

  const titulo = String(
    req.body?.titulo ?? ''
  ).trim();

  const descripcion = String(
    req.body?.descripcion ?? ''
  ).trim();

  const fechaLimite = String(
    req.body?.fecha_limite ?? ''
  ).trim();

  const horaLimite = String(
    req.body?.hora_limite ?? ''
  ).trim();

  const preguntas = Array.isArray(
    req.body?.preguntas
  )
    ? req.body.preguntas
        .map((item: unknown) =>
          String(item).trim()
        )
        .filter((item: string) => item)
    : [];

  if (
    !Number.isInteger(idActividad) ||
    idActividad <= 0 ||
    !Number.isInteger(idDocente) ||
    idDocente <= 0 ||
    !titulo ||
    !descripcion ||
    !fechaLimite ||
    !horaLimite ||
    preguntas.length === 0
  ) {
    return res.status(400).json({
      message:
        'La información de la actividad está incompleta',
    });
  }

  const client = await pool.connect();

  try {
    const current = await client.query(
      `
        SELECT
          id_actividad,
          estado
        FROM activities.actividad
        WHERE
          id_actividad = $1
          AND id_docente = $2
      `,
      [idActividad, idDocente]
    );

    if ((current.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: 'Actividad no encontrada',
      });
    }

    if (current.rows[0].estado === 'CERRADA') {
      return res.status(409).json({
        message:
          'No es posible modificar una actividad cerrada',
      });
    }

    // La edición reemplaza las preguntas; si ya hay
    // entregas, se perderían las respuestas asociadas.
    const submissions = await client.query(
      `
        SELECT 1
        FROM activities.entrega en
        INNER JOIN activities.actividad_estudiante ae
          ON ae.id_actividad_estudiante =
             en.id_actividad_estudiante
        WHERE ae.id_actividad = $1
        LIMIT 1
      `,
      [idActividad]
    );

    if ((submissions.rowCount ?? 0) > 0) {
      return res.status(409).json({
        message:
          'No es posible modificar la actividad porque ya tiene entregas de estudiantes',
      });
    }

    const deadlineResult = await client.query(
      `
        SELECT
          (
            ($1::date + $2::time)
            AT TIME ZONE 'America/Bogota'
          ) > NOW() AS valid
      `,
      [fechaLimite, horaLimite]
    );

    if (!deadlineResult.rows[0]?.valid) {
      return res.status(400).json({
        message:
          'La fecha y hora límite deben ser posteriores al momento actual',
      });
    }

    await client.query('BEGIN');

    const updated = await client.query(
      `
        UPDATE activities.actividad
        SET
          titulo = $1,
          descripcion = $2,
          fecha_limite = $3,
          hora_limite = $4,
          actualizado_en = NOW()
        WHERE id_actividad = $5
        RETURNING *
      `,
      [
        titulo,
        descripcion,
        fechaLimite,
        horaLimite,
        idActividad,
      ]
    );

    await client.query(
      `
        DELETE FROM activities.pregunta
        WHERE id_actividad = $1
      `,
      [idActividad]
    );

    const preguntasCreadas = [];

    for (
      let index = 0;
      index < preguntas.length;
      index++
    ) {
      const result = await client.query(
        `
          INSERT INTO activities.pregunta (
            id_actividad,
            enunciado,
            orden
          )
          VALUES ($1, $2, $3)
          RETURNING
            id_pregunta,
            enunciado,
            orden
        `,
        [
          idActividad,
          preguntas[index],
          index + 1,
        ]
      );

      preguntasCreadas.push(
        result.rows[0]
      );
    }

    await client.query('COMMIT');

    return res.json({
      data: {
        ...updated.rows[0],
        preguntas: preguntasCreadas,
      },
      message:
        'Actividad actualizada correctamente',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    console.error(
      'Error actualizando actividad:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible actualizar la actividad',
    });
  } finally {
    client.release();
  }
});

// ======================================================
// CERRAR ACTIVIDAD
// ======================================================

app.patch(
  '/api/activities/:id/status',
  async (req, res) => {
    const idActividad = Number(req.params.id);
    const idDocente = Number(
      req.body?.id_docente
    );

    if (
      !Number.isInteger(idActividad) ||
      idActividad <= 0 ||
      !Number.isInteger(idDocente) ||
      idDocente <= 0
    ) {
      return res.status(400).json({
        message:
          'Actividad o docente no válido',
      });
    }

    try {
      const result = await pool.query(
        `
          UPDATE activities.actividad
          SET
            estado = 'CERRADA',
            actualizado_en = NOW()
          WHERE
            id_actividad = $1
            AND id_docente = $2
            AND estado = 'ABIERTA'
          RETURNING
            id_actividad,
            titulo,
            estado
        `,
        [idActividad, idDocente]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message:
            'La actividad no existe o ya está cerrada',
        });
      }

      return res.json({
        data: result.rows[0],
        message:
          'Actividad cerrada correctamente',
      });
    } catch (error) {
      console.error(
        'Error cerrando actividad:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible cerrar la actividad',
      });
    }
  }
);

// ======================================================
// ENTREGAS DE ACTIVIDADES
//
// Una entrega pertenece a una fila de actividad_estudiante
// y contiene una respuesta por cada pregunta.
// Reglas:
// - Solo el estudiante dueño de la actividad asignada.
// - La actividad debe estar ABIERTA y dentro del plazo
//   (fecha + hora límite en America/Bogota).
// - Deben responderse todas las preguntas.
// - Puede corregirse mientras siga abierta y en plazo.
// ======================================================

const MAX_RESPUESTA = 10000;

function positiveInt(value: unknown): number | null {
  const n = Number(value);

  return Number.isInteger(n) && n > 0 ? n : null;
}

// Datos de la actividad asignada al estudiante.
// $1 = id_estudiante, $2 = id_actividad_estudiante (opcional)
const STUDENT_ACTIVITY_SELECT = `
  SELECT
    ae.id_actividad_estudiante,
    ae.id_actividad,
    ae.estado AS estado_entrega,
    ae.asignado_en,
    a.id_grupo,
    a.titulo,
    a.descripcion,
    a.fecha_limite,
    a.hora_limite,
    a.estado AS estado_actividad,
    (
      (a.fecha_limite + a.hora_limite)
      AT TIME ZONE 'America/Bogota'
    ) <= NOW() AS vencida,
    (
      SELECT COUNT(*)::int
      FROM activities.pregunta p
      WHERE p.id_actividad = a.id_actividad
    ) AS total_preguntas,
    en.id_entrega,
    en.entregado_en,
    en.actualizado_en AS entrega_actualizada_en,
    rt.calificacion::float AS calificacion,
    rt.comentario AS comentario_docente,
    rt.actualizado_en AS calificado_en
  FROM activities.actividad_estudiante ae
  INNER JOIN activities.actividad a
    ON a.id_actividad = ae.id_actividad
  LEFT JOIN activities.entrega en
    ON en.id_actividad_estudiante =
       ae.id_actividad_estudiante
  LEFT JOIN activities.retroalimentacion rt
    ON rt.id_entrega = en.id_entrega
  WHERE ae.id_estudiante = $1
`;

function withPermissions(row: any) {
  return {
    ...row,
    puede_entregar:
      row.estado_actividad === 'ABIERTA' &&
      !row.vencida,
  };
}

// ------------------------------------------------------
// Listar actividades asignadas al estudiante
// ------------------------------------------------------

app.get(
  '/api/student/:idEstudiante/activities',
  async (req, res) => {
    const idEstudiante = positiveInt(
      req.params.idEstudiante
    );

    if (!idEstudiante) {
      return res.status(400).json({
        message: 'El estudiante no es válido',
      });
    }

    try {
      const result = await pool.query(
        STUDENT_ACTIVITY_SELECT +
          `
          ORDER BY
            (a.estado = 'ABIERTA') DESC,
            a.fecha_limite ASC,
            a.hora_limite ASC
          `,
        [idEstudiante]
      );

      return res.json({
        data: result.rows.map(withPermissions),
      });
    } catch (error) {
      console.error(
        'Error consultando actividades del estudiante:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar las actividades del estudiante',
      });
    }
  }
);

// ------------------------------------------------------
// Detalle de actividad asignada + preguntas + respuestas
// ------------------------------------------------------

app.get(
  '/api/student/:idEstudiante/activities/:idActividadEstudiante',
  async (req, res) => {
    const idEstudiante = positiveInt(
      req.params.idEstudiante
    );

    const idActividadEstudiante = positiveInt(
      req.params.idActividadEstudiante
    );

    if (!idEstudiante || !idActividadEstudiante) {
      return res.status(400).json({
        message: 'La actividad solicitada no es válida',
      });
    }

    try {
      const result = await pool.query(
        STUDENT_ACTIVITY_SELECT +
          ' AND ae.id_actividad_estudiante = $2',
        [idEstudiante, idActividadEstudiante]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Actividad no encontrada',
        });
      }

      const actividad = result.rows[0];

      const questions = await pool.query(
        `
          SELECT
            p.id_pregunta,
            p.enunciado,
            p.orden,
            r.contenido AS respuesta
          FROM activities.pregunta p
          LEFT JOIN activities.respuesta r
            ON r.id_pregunta = p.id_pregunta
           AND r.id_entrega = $2
          WHERE p.id_actividad = $1
          ORDER BY p.orden ASC
        `,
        [
          actividad.id_actividad,
          actividad.id_entrega,
        ]
      );

      const evidences = actividad.id_entrega
        ? await listEvidences([actividad.id_entrega])
        : new Map<number, any[]>();

      return res.json({
        data: {
          ...withPermissions(actividad),
          preguntas: questions.rows,
          evidencias:
            evidences.get(actividad.id_entrega) ?? [],
        },
      });
    } catch (error) {
      console.error(
        'Error consultando actividad del estudiante:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar la actividad',
      });
    }
  }
);

// ------------------------------------------------------
// Registrar o corregir entrega
// Body: { respuestas: [{ id_pregunta, contenido }] }
// ------------------------------------------------------

app.put(
  '/api/student/:idEstudiante/activities/:idActividadEstudiante/submission',
  async (req, res) => {
    const idEstudiante = positiveInt(
      req.params.idEstudiante
    );

    const idActividadEstudiante = positiveInt(
      req.params.idActividadEstudiante
    );

    if (!idEstudiante || !idActividadEstudiante) {
      return res.status(400).json({
        message: 'La actividad solicitada no es válida',
      });
    }

    const rawAnswers = req.body?.respuestas;

    if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
      return res.status(400).json({
        message: 'Debe responder las preguntas de la actividad',
      });
    }

    const answers = new Map<number, string>();

    for (const item of rawAnswers) {
      const idPregunta = positiveInt(item?.id_pregunta);
      const contenido =
        typeof item?.contenido === 'string'
          ? item.contenido.trim()
          : '';

      if (!idPregunta) {
        return res.status(400).json({
          message: 'Una de las respuestas no indica una pregunta válida',
        });
      }

      if (answers.has(idPregunta)) {
        return res.status(400).json({
          message: 'Hay respuestas repetidas para la misma pregunta',
        });
      }

      if (!contenido) {
        return res.status(400).json({
          message: 'Todas las preguntas deben tener una respuesta',
        });
      }

      if (contenido.length > MAX_RESPUESTA) {
        return res.status(400).json({
          message:
            'Cada respuesta puede tener como máximo ' +
            MAX_RESPUESTA +
            ' caracteres',
        });
      }

      answers.set(idPregunta, contenido);
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      // Bloquea la actividad asignada (evita entregas
      // simultáneas) y la actividad (evita cerrarla a
      // mitad de la entrega).
      const assigned = await client.query(
        `
          SELECT
            ae.id_actividad_estudiante,
            ae.id_actividad
          FROM activities.actividad_estudiante ae
          WHERE ae.id_actividad_estudiante = $1
            AND ae.id_estudiante = $2
          FOR UPDATE
        `,
        [idActividadEstudiante, idEstudiante]
      );

      if ((assigned.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(404).json({
          message: 'Actividad no encontrada',
        });
      }

      const idActividad = assigned.rows[0].id_actividad;

      const activity = await client.query(
        `
          SELECT
            estado,
            (
              (fecha_limite + hora_limite)
              AT TIME ZONE 'America/Bogota'
            ) <= NOW() AS vencida
          FROM activities.actividad
          WHERE id_actividad = $1
          FOR SHARE
        `,
        [idActividad]
      );

      if (activity.rows[0].estado !== 'ABIERTA') {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(409).json({
          message:
            'La actividad está cerrada y ya no recibe entregas',
        });
      }

      if (activity.rows[0].vencida) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(409).json({
          message:
            'La fecha límite de la actividad ya pasó',
        });
      }

      const questions = await client.query(
        `
          SELECT id_pregunta
          FROM activities.pregunta
          WHERE id_actividad = $1
        `,
        [idActividad]
      );

      const questionIds = new Set<number>(
        questions.rows.map((q) => Number(q.id_pregunta))
      );

      const unknown = [...answers.keys()].some(
        (id) => !questionIds.has(id)
      );

      if (unknown) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(400).json({
          message:
            'Una de las respuestas no corresponde a esta actividad',
        });
      }

      if (answers.size !== questionIds.size) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(400).json({
          message: 'Todas las preguntas deben tener una respuesta',
        });
      }

      const submission = await client.query(
        `
          INSERT INTO activities.entrega (
            id_actividad_estudiante
          )
          VALUES ($1)
          ON CONFLICT (id_actividad_estudiante)
          DO UPDATE SET actualizado_en = NOW()
          RETURNING
            id_entrega,
            entregado_en,
            actualizado_en,
            (xmax = 0) AS creada
        `,
        [idActividadEstudiante]
      );

      const entrega = submission.rows[0];

      for (const [idPregunta, contenido] of answers) {
        await client.query(
          `
            INSERT INTO activities.respuesta (
              id_entrega,
              id_pregunta,
              contenido
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (id_entrega, id_pregunta)
            DO UPDATE SET contenido = EXCLUDED.contenido
          `,
          [entrega.id_entrega, idPregunta, contenido]
        );
      }

      await client.query(
        `
          UPDATE activities.actividad_estudiante
          SET estado = 'ENTREGADA'
          WHERE id_actividad_estudiante = $1
        `,
        [idActividadEstudiante]
      );

      await client.query('COMMIT');
      transactionStarted = false;

      return res.status(entrega.creada ? 201 : 200).json({
        data: {
          id_entrega: entrega.id_entrega,
          id_actividad_estudiante: idActividadEstudiante,
          estado_entrega: 'ENTREGADA',
          entregado_en: entrega.entregado_en,
          actualizado_en: entrega.actualizado_en,
        },
        message: entrega.creada
          ? 'Entrega registrada correctamente'
          : 'Entrega actualizada correctamente',
      });
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK');
      }

      console.error('Error registrando entrega:', error);

      return res.status(500).json({
        message: 'No fue posible registrar la entrega',
      });
    } finally {
      client.release();
    }
  }
);

// ------------------------------------------------------
// Docente: entregas de una actividad
// Una fila por estudiante asignado (snapshot), con su
// estado y respuestas.
// ------------------------------------------------------

app.get(
  '/api/activities/:id/submissions',
  async (req, res) => {
    const idActividad = positiveInt(req.params.id);
    const idDocente = positiveInt(req.query.teacherId);

    if (!idActividad || !idDocente) {
      return res.status(400).json({
        message: 'Actividad o docente no válido',
      });
    }

    try {
      const activity = await pool.query(
        `
          SELECT
            id_actividad,
            (
              estado <> 'ABIERTA'
              OR (
                (fecha_limite + hora_limite)
                AT TIME ZONE 'America/Bogota'
              ) <= NOW()
            ) AS entregas_definitivas
          FROM activities.actividad
          WHERE id_actividad = $1
            AND id_docente = $2
        `,
        [idActividad, idDocente]
      );

      if ((activity.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Actividad no encontrada',
        });
      }

      const rows = await pool.query(
        `
          SELECT
            ae.id_actividad_estudiante,
            ae.id_estudiante,
            ae.estado AS estado_entrega,
            en.id_entrega,
            en.entregado_en,
            en.actualizado_en AS entrega_actualizada_en,
            rt.calificacion::float AS calificacion,
            rt.comentario AS comentario_docente,
            rt.actualizado_en AS calificado_en
          FROM activities.actividad_estudiante ae
          LEFT JOIN activities.entrega en
            ON en.id_actividad_estudiante =
               ae.id_actividad_estudiante
          LEFT JOIN activities.retroalimentacion rt
            ON rt.id_entrega = en.id_entrega
          WHERE ae.id_actividad = $1
          ORDER BY ae.id_estudiante
        `,
        [idActividad]
      );

      const answers = await pool.query(
        `
          SELECT
            r.id_entrega,
            r.id_pregunta,
            r.contenido
          FROM activities.respuesta r
          INNER JOIN activities.entrega en
            ON en.id_entrega = r.id_entrega
          INNER JOIN activities.actividad_estudiante ae
            ON ae.id_actividad_estudiante =
               en.id_actividad_estudiante
          WHERE ae.id_actividad = $1
        `,
        [idActividad]
      );

      const answersBySubmission = new Map<number, any[]>();

      for (const answer of answers.rows) {
        const list =
          answersBySubmission.get(answer.id_entrega) ?? [];

        list.push({
          id_pregunta: answer.id_pregunta,
          contenido: answer.contenido,
        });

        answersBySubmission.set(answer.id_entrega, list);
      }

      // Nombres desde User Service. Si no responde, se
      // devuelven las entregas sin nombre.
      const students = new Map<number, any>();

      try {
        const response = await fetch(
          'http://localhost:3334/api/internal/students/available'
        );

        if (response.ok) {
          const body: any = await response.json();

          for (const s of body.data ?? []) {
            students.set(Number(s.id_estudiante), s);
          }
        }
      } catch (error) {
        console.error(
          'No fue posible consultar nombres de estudiantes:',
          error
        );
      }

      const evidences = await listEvidences(
        rows.rows
          .map((row) => row.id_entrega)
          .filter(Boolean)
      );

      const data = rows.rows.map((row) => {
        const student = students.get(
          Number(row.id_estudiante)
        );

        return {
          ...row,
          nombres: student?.nombres ?? null,
          apellidos: student?.apellidos ?? null,
          codigo_estudiante:
            student?.codigo_estudiante ?? null,
          respuestas: row.id_entrega
            ? answersBySubmission.get(row.id_entrega) ?? []
            : [],
          evidencias: row.id_entrega
            ? evidences.get(row.id_entrega) ?? []
            : [],
        };
      });

      const entregadas = data.filter(
        (d) => d.estado_entrega === 'ENTREGADA'
      ).length;

      const calificadas = data.filter(
        (d) => d.calificacion !== null
      ).length;

      return res.json({
        data: {
          total: data.length,
          entregadas,
          pendientes: data.length - entregadas,
          calificadas,
          // El docente califica solo entregas que el
          // estudiante ya no puede modificar.
          puede_calificar:
            activity.rows[0].entregas_definitivas,
          estudiantes: data,
        },
      });
    } catch (error) {
      console.error(
        'Error consultando entregas de la actividad:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar las entregas de la actividad',
      });
    }
  }
);

// ======================================================
// RETROALIMENTACIÓN DEL DOCENTE
//
// Calificación (0.0 a 5.0, un decimal) y comentario
// opcional sobre una entrega. Una por entrega; el docente
// puede corregirla. Reglas:
// - Solo el docente dueño de la actividad.
// - La entrega debe pertenecer a la actividad.
// - Entrega definitiva: actividad CERRADA o plazo vencido.
// ======================================================

const MAX_COMENTARIO = 2000;

// ------------------------------------------------------
// Registrar o corregir retroalimentación
// Body: { id_docente, calificacion, comentario? }
// ------------------------------------------------------

app.put(
  '/api/activities/:id/submissions/:idEntrega/feedback',
  async (req, res) => {
    const idActividad = positiveInt(req.params.id);
    const idEntrega = positiveInt(req.params.idEntrega);
    const idDocente = positiveInt(req.body?.id_docente);

    if (!idActividad || !idEntrega || !idDocente) {
      return res.status(400).json({
        message: 'Actividad, entrega o docente no válido',
      });
    }

    const rawGrade = req.body?.calificacion;
    const calificacion =
      typeof rawGrade === 'number'
        ? rawGrade
        : typeof rawGrade === 'string' && rawGrade.trim() !== ''
          ? Number(rawGrade)
          : NaN;

    if (
      !Number.isFinite(calificacion) ||
      calificacion < 0 ||
      calificacion > 5 ||
      Math.round(calificacion * 10) !== calificacion * 10
    ) {
      return res.status(400).json({
        message:
          'La calificación debe ser un número entre 0.0 y 5.0 con máximo un decimal',
      });
    }

    const rawComment = req.body?.comentario;

    if (
      rawComment !== undefined &&
      rawComment !== null &&
      typeof rawComment !== 'string'
    ) {
      return res.status(400).json({
        message: 'El comentario no es válido',
      });
    }

    const comentario =
      typeof rawComment === 'string' && rawComment.trim()
        ? rawComment.trim()
        : null;

    if (comentario && comentario.length > MAX_COMENTARIO) {
      return res.status(400).json({
        message:
          'El comentario puede tener como máximo ' +
          MAX_COMENTARIO +
          ' caracteres',
      });
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      // FOR SHARE sobre la actividad: evita que cambie de
      // estado mientras se califica.
      const activity = await client.query(
        `
          SELECT
            (
              estado <> 'ABIERTA'
              OR (
                (fecha_limite + hora_limite)
                AT TIME ZONE 'America/Bogota'
              ) <= NOW()
            ) AS entregas_definitivas
          FROM activities.actividad
          WHERE id_actividad = $1
            AND id_docente = $2
          FOR SHARE
        `,
        [idActividad, idDocente]
      );

      if ((activity.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(404).json({
          message: 'Actividad no encontrada',
        });
      }

      const submission = await client.query(
        `
          SELECT en.id_entrega
          FROM activities.entrega en
          INNER JOIN activities.actividad_estudiante ae
            ON ae.id_actividad_estudiante =
               en.id_actividad_estudiante
          WHERE en.id_entrega = $1
            AND ae.id_actividad = $2
        `,
        [idEntrega, idActividad]
      );

      if ((submission.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(404).json({
          message: 'La entrega no pertenece a esta actividad',
        });
      }

      if (!activity.rows[0].entregas_definitivas) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(409).json({
          message:
            'Solo puede calificar cuando la actividad esté cerrada o haya vencido su fecha límite',
        });
      }

      const result = await client.query(
        `
          INSERT INTO activities.retroalimentacion (
            id_entrega,
            id_docente,
            calificacion,
            comentario
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id_entrega)
          DO UPDATE SET
            id_docente = EXCLUDED.id_docente,
            calificacion = EXCLUDED.calificacion,
            comentario = EXCLUDED.comentario,
            actualizado_en = NOW()
          RETURNING
            id_retroalimentacion,
            id_entrega,
            calificacion::float AS calificacion,
            comentario AS comentario_docente,
            actualizado_en AS calificado_en,
            (xmax = 0) AS creada
        `,
        [idEntrega, idDocente, calificacion, comentario]
      );

      await client.query('COMMIT');
      transactionStarted = false;

      const { creada, ...feedback } = result.rows[0];

      return res.status(creada ? 201 : 200).json({
        data: feedback,
        message: creada
          ? 'Retroalimentación registrada correctamente'
          : 'Retroalimentación actualizada correctamente',
      });
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK');
      }

      console.error('Error registrando retroalimentación:', error);

      return res.status(500).json({
        message: 'No fue posible registrar la retroalimentación',
      });
    } finally {
      client.release();
    }
  }
);

// ======================================================
// EVIDENCIAS DE ENTREGA
//
// Archivos adjuntos a una entrega existente, guardados en
// el bucket privado "evidencias" de Supabase Storage.
// Reglas: dueño de la entrega, actividad ABIERTA y en
// plazo, máximo 5 por entrega, 10 MB, tipo validado por
// contenido. Descarga con URL firmada de corta duración.
// ======================================================

const MAX_EVIDENCES_PER_SUBMISSION = 5;
const SIGNED_URL_SECONDS = 120;

// Evidencias agrupadas por id_entrega
async function listEvidences(
  submissionIds: number[],
): Promise<Map<number, any[]>> {
  const grouped = new Map<number, any[]>();

  if (submissionIds.length === 0) {
    return grouped;
  }

  const result = await pool.query(
    `
      SELECT
        id_evidencia,
        id_entrega,
        nombre_archivo,
        tipo_mime,
        tamano_bytes,
        subido_en
      FROM activities.evidencia
      WHERE id_entrega = ANY($1::int[])
      ORDER BY subido_en ASC
    `,
    [submissionIds],
  );

  for (const row of result.rows) {
    const list = grouped.get(row.id_entrega) ?? [];
    list.push(row);
    grouped.set(row.id_entrega, list);
  }

  return grouped;
}

// Sin strictNullChecks la discriminación por literal
// booleano no estrecha el tipo; se usa el operador "in".
type LockResult =
  { idEntrega: number } | { error: { status: number; message: string } };

// Bloquea la actividad asignada del estudiante y su
// entrega, y verifica que aún se pueda modificar.
// Debe llamarse dentro de una transacción.
async function lockEditableSubmission(
  client: any,
  idEstudiante: number,
  idActividadEstudiante: number,
): Promise<LockResult> {
  const assigned = await client.query(
    `
      SELECT
        ae.id_actividad,
        en.id_entrega
      FROM activities.actividad_estudiante ae
      LEFT JOIN activities.entrega en
        ON en.id_actividad_estudiante =
           ae.id_actividad_estudiante
      WHERE ae.id_actividad_estudiante = $1
        AND ae.id_estudiante = $2
      FOR UPDATE OF ae
    `,
    [idActividadEstudiante, idEstudiante],
  );

  if ((assigned.rowCount ?? 0) === 0) {
    return {
      error: {
        status: 404,
        message: "Actividad no encontrada",
      },
    };
  }

  const activity = await client.query(
    `
      SELECT
        estado,
        (
          (fecha_limite + hora_limite)
          AT TIME ZONE 'America/Bogota'
        ) <= NOW() AS vencida
      FROM activities.actividad
      WHERE id_actividad = $1
      FOR SHARE
    `,
    [assigned.rows[0].id_actividad],
  );

  if (activity.rows[0].estado !== "ABIERTA") {
    return {
      error: {
        status: 409,
        message:
          "La actividad está cerrada y ya no admite cambios en la entrega",
      },
    };
  }

  if (activity.rows[0].vencida) {
    return {
      error: {
        status: 409,
        message: "La fecha límite de la actividad ya pasó",
      },
    };
  }

  if (!assigned.rows[0].id_entrega) {
    return {
      error: {
        status: 409,
        message:
          "Primero registra tus respuestas; luego podrás adjuntar evidencias",
      },
    };
  }

  return {
    idEntrega: assigned.rows[0].id_entrega,
  };
}

// ------------------------------------------------------
// Subir evidencia
// Cuerpo: contenido binario del archivo
// Query: nombre = nombre original del archivo
// ------------------------------------------------------

app.post(
  "/api/student/:idEstudiante/activities/:idActividadEstudiante/evidences",
  express.raw({
    type: () => true,
    limit: MAX_EVIDENCE_BYTES,
  }),
  async (req, res) => {
    const idEstudiante = positiveInt(req.params.idEstudiante);

    const idActividadEstudiante = positiveInt(req.params.idActividadEstudiante);

    if (!idEstudiante || !idActividadEstudiante) {
      return res.status(400).json({
        message: "La actividad solicitada no es válida",
      });
    }

    const nombre = sanitizeFileName(String(req.query.nombre ?? ""));

    if (!nombre) {
      return res.status(400).json({
        message: "El nombre del archivo es obligatorio",
      });
    }

    const buffer: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.alloc(0);

    if (buffer.length === 0) {
      return res.status(400).json({
        message: "El archivo está vacío",
      });
    }

    const detected = detectEvidenceType(nombre, buffer);

    if (!detected) {
      return res.status(400).json({
        message:
          "Tipo de archivo no permitido. Formatos aceptados: " +
          ALLOWED_FORMATS_LABEL,
      });
    }

    const client = await pool.connect();
    let transactionStarted = false;
    let uploadedPath: string | null = null;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const lock = await lockEditableSubmission(
        client,
        idEstudiante,
        idActividadEstudiante,
      );

      if ("error" in lock) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res
          .status(lock.error.status)
          .json({ message: lock.error.message });
      }

      const count = await client.query(
        `
          SELECT COUNT(*)::int AS total
          FROM activities.evidencia
          WHERE id_entrega = $1
        `,
        [lock.idEntrega],
      );

      if (count.rows[0].total >= MAX_EVIDENCES_PER_SUBMISSION) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          message:
            "La entrega ya tiene el máximo de " +
            MAX_EVIDENCES_PER_SUBMISSION +
            " evidencias",
        });
      }

      const path =
        "entregas/" +
        lock.idEntrega +
        "/" +
        randomUUID() +
        "." +
        detected.extension;

      const { error: uploadError } = await storage
        .from(EVIDENCE_BUCKET)
        .upload(path, buffer, {
          contentType: detected.mime,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error subiendo evidencia a Storage:", uploadError);

        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(502).json({
          message: "No fue posible almacenar el archivo. Intenta de nuevo.",
        });
      }

      uploadedPath = path;

      const inserted = await client.query(
        `
          INSERT INTO activities.evidencia (
            id_entrega,
            nombre_archivo,
            ruta_storage,
            tipo_mime,
            tamano_bytes
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING
            id_evidencia,
            id_entrega,
            nombre_archivo,
            tipo_mime,
            tamano_bytes,
            subido_en
        `,
        [lock.idEntrega, nombre, path, detected.mime, buffer.length],
      );

      await client.query(
        `
          UPDATE activities.entrega
          SET actualizado_en = NOW()
          WHERE id_entrega = $1
        `,
        [lock.idEntrega],
      );

      await client.query("COMMIT");
      transactionStarted = false;
      uploadedPath = null;

      return res.status(201).json({
        data: inserted.rows[0],
        message: "Evidencia adjuntada correctamente",
      });
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }

      // El archivo quedó en Storage pero no en la base de
      // datos: se elimina para no dejar huérfanos.
      if (uploadedPath) {
        await storage
          .from(EVIDENCE_BUCKET)
          .remove([uploadedPath])
          .catch((e) => console.error("Error limpiando evidencia:", e));
      }

      console.error("Error adjuntando evidencia:", error);

      return res.status(500).json({
        message: "No fue posible adjuntar la evidencia",
      });
    } finally {
      client.release();
    }
  },
);

// ------------------------------------------------------
// Eliminar evidencia
// ------------------------------------------------------

app.delete(
  "/api/student/:idEstudiante/activities/:idActividadEstudiante/evidences/:idEvidencia",
  async (req, res) => {
    const idEstudiante = positiveInt(req.params.idEstudiante);

    const idActividadEstudiante = positiveInt(req.params.idActividadEstudiante);

    const idEvidencia = positiveInt(req.params.idEvidencia);

    if (!idEstudiante || !idActividadEstudiante || !idEvidencia) {
      return res.status(400).json({
        message: "La evidencia indicada no es válida",
      });
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const lock = await lockEditableSubmission(
        client,
        idEstudiante,
        idActividadEstudiante,
      );

      if ("error" in lock) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res
          .status(lock.error.status)
          .json({ message: lock.error.message });
      }

      const deleted = await client.query(
        `
          DELETE FROM activities.evidencia
          WHERE id_evidencia = $1
            AND id_entrega = $2
          RETURNING ruta_storage
        `,
        [idEvidencia, lock.idEntrega],
      );

      if ((deleted.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(404).json({
          message: "Evidencia no encontrada",
        });
      }

      await client.query(
        `
          UPDATE activities.entrega
          SET actualizado_en = NOW()
          WHERE id_entrega = $1
        `,
        [lock.idEntrega],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      // La fila ya no existe; si falla el borrado del
      // objeto solo queda un archivo huérfano (se registra).
      const { error: removeError } = await storage
        .from(EVIDENCE_BUCKET)
        .remove([deleted.rows[0].ruta_storage]);

      if (removeError) {
        console.error(
          "Evidencia eliminada en BD pero no en Storage:",
          deleted.rows[0].ruta_storage,
          removeError,
        );
      }

      return res.json({
        message: "Evidencia eliminada correctamente",
      });
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }

      console.error("Error eliminando evidencia:", error);

      return res.status(500).json({
        message: "No fue posible eliminar la evidencia",
      });
    } finally {
      client.release();
    }
  },
);

// ------------------------------------------------------
// URL firmada de descarga
// ------------------------------------------------------

async function signedEvidenceUrl(
  res: express.Response,
  query: string,
  params: unknown[],
) {
  try {
    const result = await pool.query(query, params);

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({
        message: "Evidencia no encontrada",
      });
    }

    const evidencia = result.rows[0];

    const { data, error } = await storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(evidencia.ruta_storage, SIGNED_URL_SECONDS, {
        download: evidencia.nombre_archivo,
      });

    if (error || !data) {
      console.error("Error firmando URL de evidencia:", error);

      return res.status(502).json({
        message: "No fue posible generar el enlace de descarga",
      });
    }

    return res.json({
      data: {
        url: data.signedUrl,
        expira_en_segundos: SIGNED_URL_SECONDS,
      },
    });
  } catch (error) {
    console.error("Error consultando evidencia:", error);

    return res.status(500).json({
      message: "No fue posible consultar la evidencia",
    });
  }
}

// Estudiante: solo evidencias de sus entregas
app.get(
  "/api/student/:idEstudiante/evidences/:idEvidencia/url",
  async (req, res) => {
    const idEstudiante = positiveInt(req.params.idEstudiante);
    const idEvidencia = positiveInt(req.params.idEvidencia);

    if (!idEstudiante || !idEvidencia) {
      return res.status(400).json({
        message: "La evidencia indicada no es válida",
      });
    }

    return signedEvidenceUrl(
      res,
      `
        SELECT ev.ruta_storage, ev.nombre_archivo
        FROM activities.evidencia ev
        INNER JOIN activities.entrega en
          ON en.id_entrega = ev.id_entrega
        INNER JOIN activities.actividad_estudiante ae
          ON ae.id_actividad_estudiante =
             en.id_actividad_estudiante
        WHERE ev.id_evidencia = $1
          AND ae.id_estudiante = $2
      `,
      [idEvidencia, idEstudiante],
    );
  },
);

// Docente: solo evidencias de actividades propias
app.get("/api/activities/:id/evidences/:idEvidencia/url", async (req, res) => {
  const idActividad = positiveInt(req.params.id);
  const idEvidencia = positiveInt(req.params.idEvidencia);
  const idDocente = positiveInt(req.query.teacherId);

  if (!idActividad || !idEvidencia || !idDocente) {
    return res.status(400).json({
      message: "La evidencia indicada no es válida",
    });
  }

  return signedEvidenceUrl(
    res,
    `
        SELECT ev.ruta_storage, ev.nombre_archivo
        FROM activities.evidencia ev
        INNER JOIN activities.entrega en
          ON en.id_entrega = ev.id_entrega
        INNER JOIN activities.actividad_estudiante ae
          ON ae.id_actividad_estudiante =
             en.id_actividad_estudiante
        INNER JOIN activities.actividad a
          ON a.id_actividad = ae.id_actividad
        WHERE ev.id_evidencia = $1
          AND a.id_actividad = $2
          AND a.id_docente = $3
      `,
    [idEvidencia, idActividad, idDocente],
  );
});

// ======================================================
// HISTORIAL DE SEGUIMIENTO
//
// Se construye desde el snapshot actividad_estudiante:
// cada estudiante conserva las actividades que recibió
// aunque luego salga del grupo. Estado de seguimiento por
// actividad (derivado, no almacenado):
// - CALIFICADA:   entrega con retroalimentación.
// - ENTREGADA:    entrega sin retroalimentación.
// - NO_ENTREGADA: sin entrega y actividad cerrada o vencida.
// - PENDIENTE:    sin entrega, abierta y en plazo.
// ======================================================

// $1 = id_grupo
const FOLLOW_UP_SELECT = `
  SELECT
    ae.id_actividad_estudiante,
    ae.id_estudiante,
    ae.asignado_en,
    a.id_actividad,
    a.titulo,
    a.fecha_limite,
    a.hora_limite,
    a.estado AS estado_actividad,
    en.id_entrega,
    en.entregado_en,
    en.actualizado_en AS entrega_actualizada_en,
    (
      SELECT COUNT(*)::int
      FROM activities.evidencia ev
      WHERE ev.id_entrega = en.id_entrega
    ) AS total_evidencias,
    rt.calificacion::float AS calificacion,
    rt.comentario AS comentario_docente,
    rt.actualizado_en AS calificado_en,
    CASE
      WHEN rt.id_retroalimentacion IS NOT NULL
        THEN 'CALIFICADA'
      WHEN en.id_entrega IS NOT NULL
        THEN 'ENTREGADA'
      WHEN a.estado <> 'ABIERTA'
        OR (
          (a.fecha_limite + a.hora_limite)
          AT TIME ZONE 'America/Bogota'
        ) <= NOW()
        THEN 'NO_ENTREGADA'
      ELSE 'PENDIENTE'
    END AS estado_seguimiento
  FROM activities.actividad_estudiante ae
  INNER JOIN activities.actividad a
    ON a.id_actividad = ae.id_actividad
  LEFT JOIN activities.entrega en
    ON en.id_actividad_estudiante =
       ae.id_actividad_estudiante
  LEFT JOIN activities.retroalimentacion rt
    ON rt.id_entrega = en.id_entrega
  WHERE a.id_grupo = $1
`;

interface FollowUpSummary {
  total: number;
  pendientes: number;
  entregadas: number;
  no_entregadas: number;
  calificadas: number;
  promedio: number | null;
  ultima_entrega: string | null;
}

// Resumen sobre las filas de seguimiento de un estudiante.
// "entregadas" incluye las calificadas. El promedio solo
// considera actividades calificadas.
function summarizeFollowUp(rows: any[]): FollowUpSummary {
  const count = (state: string) =>
    rows.filter((row) => row.estado_seguimiento === state).length;

  const grades = rows
    .map((row) => row.calificacion)
    .filter((value): value is number => value !== null);

  const lastSubmission = rows
    .map((row) => row.entrega_actualizada_en)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return {
    total: rows.length,
    pendientes: count('PENDIENTE'),
    entregadas: count('ENTREGADA') + count('CALIFICADA'),
    no_entregadas: count('NO_ENTREGADA'),
    calificadas: grades.length,
    promedio: grades.length
      ? Math.round(
          (grades.reduce((sum, value) => sum + value, 0) /
            grades.length) *
            10
        ) / 10
      : null,
    ultima_entrega: lastSubmission ?? null,
  };
}

// Valida que el grupo pertenezca al docente y lo devuelve.
async function findTeacherGroup(
  idDocente: number,
  idGrupo: number
): Promise<TeacherGroup | null> {
  const groups = await getTeacherGroups(idDocente);

  return (
    groups.find((group) => Number(group.id_grupo) === idGrupo) ??
    null
  );
}

// Datos de identidad desde User Service (incluye inactivos).
// Si no responde, el historial se devuelve sin nombres.
async function getStudentsByIds(
  ids: number[]
): Promise<Map<number, any>> {
  const students = new Map<number, any>();

  if (ids.length === 0) {
    return students;
  }

  try {
    const response = await fetch(
      'http://localhost:3334/api/internal/students/by-ids?ids=' +
        ids.join(',')
    );

    if (response.ok) {
      const body: any = await response.json();

      for (const student of body.data ?? []) {
        students.set(Number(student.id_estudiante), student);
      }
    }
  } catch (error) {
    console.error(
      'No fue posible consultar nombres de estudiantes:',
      error
    );
  }

  return students;
}

function studentIdentity(
  id: number,
  students: Map<number, any>
) {
  const student = students.get(id);

  return {
    id_estudiante: id,
    nombres: student?.nombres ?? null,
    apellidos: student?.apellidos ?? null,
    correo: student?.correo ?? null,
    codigo_estudiante: student?.codigo_estudiante ?? null,
    estado_usuario: student?.estado ?? null,
  };
}

function groupInfo(group: TeacherGroup) {
  return {
    id_grupo: group.id_grupo,
    nombre: group.nombre,
    estado: group.estado,
    practica: group.practica,
    periodo_academico: group.periodo_academico,
  };
}

// ------------------------------------------------------
// Resumen de seguimiento de todos los estudiantes del grupo
// (miembros actuales + quienes recibieron actividades).
// ------------------------------------------------------

app.get('/api/follow-up/groups/:idGrupo', async (req, res) => {
  const idGrupo = positiveInt(req.params.idGrupo);
  const idDocente = positiveInt(req.query.teacherId);

  if (!idGrupo || !idDocente) {
    return res.status(400).json({
      message: 'Grupo o docente no válido',
    });
  }

  try {
    const group = await findTeacherGroup(idDocente, idGrupo);

    if (!group) {
      return res.status(404).json({
        message: 'Grupo no encontrado',
      });
    }

    const [memberIds, rows, activities] = await Promise.all([
      getGroupStudentIds(idGrupo),
      pool.query(
        FOLLOW_UP_SELECT +
          ' ORDER BY a.fecha_limite, a.hora_limite, a.id_actividad',
        [idGrupo]
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE estado = 'ABIERTA'
            )::int AS abiertas
          FROM activities.actividad
          WHERE id_grupo = $1
        `,
        [idGrupo]
      ),
    ]);

    const rowsByStudent = new Map<number, any[]>();

    for (const row of rows.rows) {
      const id = Number(row.id_estudiante);
      const list = rowsByStudent.get(id) ?? [];

      list.push(row);
      rowsByStudent.set(id, list);
    }

    const members = new Set(memberIds);

    const studentIds = [
      ...new Set([...memberIds, ...rowsByStudent.keys()]),
    ];

    const students = await getStudentsByIds(studentIds);

    const data = studentIds
      .map((id) => ({
        ...studentIdentity(id, students),
        en_grupo: members.has(id),
        resumen: summarizeFollowUp(rowsByStudent.get(id) ?? []),
      }))
      .sort((a, b) =>
        `${a.nombres ?? ''} ${a.apellidos ?? ''}`.localeCompare(
          `${b.nombres ?? ''} ${b.apellidos ?? ''}`,
          'es'
        )
      );

    const grades = rows.rows
      .map((row) => row.calificacion)
      .filter((value): value is number => value !== null);

    return res.json({
      data: {
        grupo: groupInfo(group),
        total_actividades: activities.rows[0].total,
        actividades_abiertas: activities.rows[0].abiertas,
        promedio_grupo: grades.length
          ? Math.round(
              (grades.reduce((sum, value) => sum + value, 0) /
                grades.length) *
                10
            ) / 10
          : null,
        estudiantes: data,
      },
    });
  } catch (error) {
    console.error(
      'Error consultando seguimiento del grupo:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar el seguimiento del grupo',
    });
  }
});

// ------------------------------------------------------
// Historial de un estudiante dentro de un grupo
// ------------------------------------------------------

app.get(
  '/api/follow-up/groups/:idGrupo/students/:idEstudiante',
  async (req, res) => {
    const idGrupo = positiveInt(req.params.idGrupo);
    const idEstudiante = positiveInt(req.params.idEstudiante);
    const idDocente = positiveInt(req.query.teacherId);

    if (!idGrupo || !idEstudiante || !idDocente) {
      return res.status(400).json({
        message: 'Grupo, estudiante o docente no válido',
      });
    }

    try {
      const group = await findTeacherGroup(idDocente, idGrupo);

      if (!group) {
        return res.status(404).json({
          message: 'Grupo no encontrado',
        });
      }

      const [memberIds, rows] = await Promise.all([
        getGroupStudentIds(idGrupo),
        pool.query(
          FOLLOW_UP_SELECT +
            `
              AND ae.id_estudiante = $2
              ORDER BY
                a.fecha_limite,
                a.hora_limite,
                a.id_actividad
            `,
          [idGrupo, idEstudiante]
        ),
      ]);

      const enGrupo = memberIds.includes(idEstudiante);

      if (!enGrupo && (rows.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'El estudiante no pertenece al grupo',
        });
      }

      const students = await getStudentsByIds([idEstudiante]);

      return res.json({
        data: {
          grupo: groupInfo(group),
          estudiante: {
            ...studentIdentity(idEstudiante, students),
            en_grupo: enGrupo,
          },
          resumen: summarizeFollowUp(rows.rows),
          actividades: rows.rows,
        },
      });
    } catch (error) {
      console.error(
        'Error consultando historial del estudiante:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar el historial del estudiante',
      });
    }
  }
);

// ------------------------------------------------------
// Seguimiento interno de un estudiante en un grupo.
// Sin validación de docente: lo usa el Gateway después de
// comprobar el permiso (p. ej. el tutor de la asignación).
// Solo lectura y sin respuestas ni evidencias.
// ------------------------------------------------------

app.get(
  '/api/internal/follow-up/groups/:idGrupo/students/:idEstudiante',
  async (req, res) => {
    const idGrupo = positiveInt(req.params.idGrupo);
    const idEstudiante = positiveInt(req.params.idEstudiante);

    if (!idGrupo || !idEstudiante) {
      return res.status(400).json({
        message: 'Grupo o estudiante no válido',
      });
    }

    try {
      const rows = await pool.query(
        FOLLOW_UP_SELECT +
          `
            AND ae.id_estudiante = $2
            ORDER BY
              a.fecha_limite,
              a.hora_limite,
              a.id_actividad
          `,
        [idGrupo, idEstudiante]
      );

      return res.json({
        data: {
          resumen: summarizeFollowUp(rows.rows),
          actividades: rows.rows,
        },
      });
    } catch (error) {
      console.error(
        'Error consultando seguimiento interno:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar el seguimiento del estudiante',
      });
    }
  }
);

// ======================================================
// REPORTES DEL COORDINADOR: AVANCE ACADÉMICO POR GRUPO
//
// Agregado del snapshot actividad_estudiante con los mismos
// estados derivados del historial de seguimiento. "entregadas"
// incluye las calificadas; pendientes = abiertas y en plazo.
// Uso: ?ids=1,2,3 (máx. 200). Grupos sin actividades no
// aparecen; quien consume los completa con ceros.
// ======================================================

app.get('/api/internal/reports/groups-progress', async (req, res) => {
  const ids = [
    ...new Set(
      String(req.query.ids ?? '')
        .split(',')
        .map((value) => positiveInt(value.trim()))
        .filter((value): value is number => value !== null)
    ),
  ];

  if (ids.length === 0) {
    return res.json({ data: [] });
  }

  if (ids.length > 200) {
    return res.status(400).json({
      message: 'Se pueden consultar máximo 200 grupos',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          a.id_grupo,
          COUNT(DISTINCT a.id_actividad)::int AS actividades,
          COUNT(DISTINCT a.id_actividad) FILTER (
            WHERE a.estado = 'ABIERTA'
          )::int AS actividades_abiertas,
          COUNT(ae.id_actividad_estudiante)::int AS esperadas,
          COUNT(en.id_entrega)::int AS entregadas,
          COUNT(rt.id_retroalimentacion)::int AS calificadas,
          COUNT(ae.id_actividad_estudiante) FILTER (
            WHERE en.id_entrega IS NULL
              AND (
                a.estado <> 'ABIERTA'
                OR (
                  (a.fecha_limite + a.hora_limite)
                  AT TIME ZONE 'America/Bogota'
                ) <= NOW()
              )
          )::int AS no_entregadas,
          ROUND(AVG(rt.calificacion), 1)::float AS promedio
        FROM activities.actividad a
        LEFT JOIN activities.actividad_estudiante ae
          ON ae.id_actividad = a.id_actividad
        LEFT JOIN activities.entrega en
          ON en.id_actividad_estudiante =
             ae.id_actividad_estudiante
        LEFT JOIN activities.retroalimentacion rt
          ON rt.id_entrega = en.id_entrega
        WHERE a.id_grupo = ANY($1::int[])
        GROUP BY a.id_grupo
      `,
      [ids]
    );

    return res.json({
      data: result.rows.map((row) => ({
        ...row,
        pendientes:
          row.esperadas - row.entregadas - row.no_entregadas,
      })),
    });
  } catch (error) {
    console.error(
      'Error consultando avance académico de grupos:',
      error
    );

    return res.status(500).json({
      message: 'No fue posible consultar el avance académico',
    });
  }
});

// ------------------------------------------------------
// Errores de lectura del cuerpo (tamaño, JSON inválido)
// ------------------------------------------------------

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (error?.type === "entity.too.large") {
      return res.status(413).json({
        message: "El archivo supera el tamaño máximo de 10 MB",
      });
    }

    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({
        message: "El cuerpo de la petición no es válido",
      });
    }

    return next(error);
  },
);

const port = process.env.PORT || 3336;

const server = app.listen(port, () => {
  console.log(
    `Activity Service listening at http://localhost:${port}/api`
  );
});

server.on('error', console.error);
