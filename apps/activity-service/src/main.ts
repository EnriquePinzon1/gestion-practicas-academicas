import 'dotenv/config';
import express from 'express';
import { pool } from './database/database';

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

const port = process.env.PORT || 3336;

const server = app.listen(port, () => {
  console.log(
    `Activity Service listening at http://localhost:${port}/api`
  );
});

server.on('error', console.error);
