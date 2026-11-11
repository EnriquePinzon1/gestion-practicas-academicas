import 'dotenv/config';

import express from 'express';
import { pool } from './database/database';
import { supabaseAdmin } from './supabase/admin';

const app = express();

app.use(express.json());

// ========================================================
// HEALTH
// ========================================================

app.get('/api', (_req, res) => {
  res.json({
    service: 'user-service',
    status: 'ok',
  });
});

// ========================================================
// DATABASE HEALTH
// ========================================================

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

// ========================================================
// PERFIL INTERNO POR AUTH USER ID
// ========================================================

app.get(
  '/api/internal/users/by-auth/:authUserId',
  async (req, res) => {
    try {
      const { authUserId } = req.params;

      const result = await pool.query(
        `
        SELECT
          u.id_usuario,
          u.auth_user_id,
          u.nombres,
          u.apellidos,
          u.correo,
          u.estado,
          r.nombre AS rol
        FROM users.usuario u
        INNER JOIN users.rol r
          ON r.id_rol = u.id_rol
        WHERE u.auth_user_id = $1;
        `,
        [authUserId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: 'Perfil de usuario no encontrado',
        });
      }

      return res.json(result.rows[0]);
    } catch (error) {
      console.error('Error querying user profile:', error);

      return res.status(500).json({
        message: 'No fue posible consultar el perfil',
      });
    }
  }
);

// ========================================================
// CONSULTAR USUARIOS
// ========================================================

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
// ========================================================
// CU01 - REGISTRAR USUARIO
// ========================================================

app.post('/api/users', async (req, res) => {
  const {
    rol,
    nombres,
    apellidos,
    tipo_documento,
    numero_documento,
    correo,
    telefono,
    codigo_estudiante,
    semestre,
    id_programa,
    cargo,
  } = req.body;

  // ------------------------------------------------------
  // Validaciones básicas
  // ------------------------------------------------------

  if (
    !rol ||
    !nombres ||
    !apellidos ||
    !tipo_documento ||
    !numero_documento ||
    !correo
  ) {
    return res.status(400).json({
      message: 'Existen campos obligatorios sin diligenciar',
    });
  }

  const rolesPermitidos = [
    'COORDINADOR',
    'DOCENTE',
    'ESTUDIANTE',
    'TUTOR_RECEPTOR',
  ];

  if (!rolesPermitidos.includes(rol)) {
    return res.status(400).json({
      message: 'El tipo de usuario no es válido',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(correo)) {
    return res.status(400).json({
      message: 'El formato del correo no es válido',
    });
  }

  if (
    rol === 'ESTUDIANTE' &&
    (!codigo_estudiante || !semestre || !id_programa)
  ) {
    return res.status(400).json({
      message:
        'Para un estudiante son obligatorios código, semestre y programa académico',
    });
  }

  // Cargo del tutor receptor: opcional, máximo 120
  // caracteres (users.tutor_receptor.cargo VARCHAR(120)).
  if (
    rol === 'TUTOR_RECEPTOR' &&
    cargo !== undefined &&
    cargo !== null &&
    (typeof cargo !== 'string' ||
      cargo.trim().length > 120)
  ) {
    return res.status(400).json({
      message:
        'El cargo del tutor receptor no puede superar 120 caracteres',
    });
  }

if (rol === 'ESTUDIANTE') {
  try {
    const programResponse = await fetch(
      'http://localhost:3335/api/programs'
    );

    if (!programResponse.ok) {
      return res.status(503).json({
        message:
          'No fue posible validar el programa académico',
      });
    }

    const programData = await programResponse.json();

    const programExists = programData.data.some(
      (program: { id_programa: number }) =>
        program.id_programa === Number(id_programa)
    );

    if (!programExists) {
      return res.status(400).json({
        message:
          'El programa académico seleccionado no existe',
      });
    }
  } catch (error) {
    console.error(
      'Error validating academic program:',
      error
    );

    return res.status(503).json({
      message:
        'No fue posible comunicarse con Practice Service',
    });
  }
}

  const client = await pool.connect();

  let authUserId: string | null = null;

  try {
    // ----------------------------------------------------
    // Comprobar duplicados antes de crear Auth
    // ----------------------------------------------------

    const duplicateResult = await client.query(
      `
      SELECT
        correo,
        numero_documento
      FROM users.usuario
      WHERE correo = $1
         OR numero_documento = $2;
      `,
      [correo.trim().toLowerCase(), numero_documento.trim()]
    );

    if (duplicateResult.rowCount !== 0) {
      return res.status(409).json({
        message:
          'Ya existe un usuario con el correo o documento ingresado',
      });
    }

    if (rol === 'ESTUDIANTE') {
      const studentDuplicate = await client.query(
        `
        SELECT id_estudiante
        FROM users.estudiante
        WHERE codigo_estudiante = $1;
        `,
        [codigo_estudiante.trim()]
      );

      if (studentDuplicate.rowCount !== 0) {
        return res.status(409).json({
          message:
            'Ya existe un estudiante con el código ingresado',
        });
      }
    }

    // ----------------------------------------------------
    // Obtener rol
    // ----------------------------------------------------

    const roleResult = await client.query(
      `
      SELECT id_rol
      FROM users.rol
      WHERE nombre = $1;
      `,
      [rol]
    );

    if (roleResult.rowCount === 0) {
      return res.status(400).json({
        message: 'El rol indicado no existe',
      });
    }

    const idRol = roleResult.rows[0].id_rol;

    // ----------------------------------------------------
    // Crear/invitar usuario en Supabase Auth
    // ----------------------------------------------------

    const {
      data: inviteData,
      error: inviteError,
    } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      correo.trim().toLowerCase(),
      {
        // El enlace de invitación debe abrir la página
        // donde el usuario define su contraseña.
        redirectTo:
          (process.env.WEB_APP_URL ??
            'http://localhost:4200') +
          '/reset-password',
        data: {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          rol,
        },
      }
    );

    if (inviteError || !inviteData.user) {
      console.error('Supabase invite error:', inviteError);

      return res.status(400).json({
        message:
          inviteError?.message ??
          'No fue posible crear la cuenta de autenticación',
      });
    }

    authUserId = inviteData.user.id;

    // ----------------------------------------------------
    // Transacción PostgreSQL
    // ----------------------------------------------------

    await client.query('BEGIN');

    const userResult = await client.query(
      `
      INSERT INTO users.usuario (
        auth_user_id,
        id_rol,
        nombres,
        apellidos,
        tipo_documento,
        numero_documento,
        correo,
        telefono,
        estado
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 'ACTIVO'
      )
      RETURNING id_usuario;
      `,
      [
        authUserId,
        idRol,
        nombres.trim(),
        apellidos.trim(),
        tipo_documento.trim(),
        numero_documento.trim(),
        correo.trim().toLowerCase(),
        telefono?.trim() || null,
      ]
    );

    const idUsuario = userResult.rows[0].id_usuario;

    // ----------------------------------------------------
    // Datos específicos por rol
    // ----------------------------------------------------

    if (rol === 'DOCENTE') {
      await client.query(
        `
        INSERT INTO users.docente_asesor (
          id_usuario
        )
        VALUES ($1);
        `,
        [idUsuario]
      );
    }

    if (rol === 'ESTUDIANTE') {
      await client.query(
        `
        INSERT INTO users.estudiante (
          id_usuario,
          codigo_estudiante,
          semestre,
          id_programa
        )
        VALUES ($1, $2, $3, $4);
        `,
        [
          idUsuario,
          codigo_estudiante.trim(),
          Number(semestre),
          Number(id_programa),
        ]
      );
    }

    if (rol === 'TUTOR_RECEPTOR') {
      await client.query(
        `
        INSERT INTO users.tutor_receptor (
          id_usuario,
          cargo
        )
        VALUES ($1, $2);
        `,
        [
          idUsuario,
          cargo?.trim() || null,
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Usuario registrado correctamente',
      data: {
        id_usuario: idUsuario,
        auth_user_id: authUserId,
        rol,
        nombres,
        apellidos,
        correo: correo.trim().toLowerCase(),
        estado: 'ACTIVO',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error creating user:', error);

    // Si Auth se creó pero PostgreSQL falló,
    // eliminamos la cuenta para evitar inconsistencias.
    if (authUserId) {
      const { error: deleteError } =
        await supabaseAdmin.auth.admin.deleteUser(
          authUserId
        );

      if (deleteError) {
        console.error(
          'Error rolling back Supabase Auth user:',
          deleteError
        );
      }
    }

    return res.status(500).json({
      message: 'No fue posible registrar el usuario',
    });
  } finally {
    client.release();
  }
});
// ========================================================
// CU01 - CAMBIAR ESTADO DE USUARIO
// ========================================================

app.patch('/api/users/:id/status', async (req, res) => {
  const idUsuario = Number(req.params.id);
  const { estado } = req.body;

  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return res.status(400).json({
      message: 'El identificador del usuario no es válido',
    });
  }

  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    return res.status(400).json({
      message: 'El estado debe ser ACTIVO o INACTIVO',
    });
  }

  try {
    const result = await pool.query(
      `
      UPDATE users.usuario
      SET estado = $1
      WHERE id_usuario = $2
      RETURNING
        id_usuario,
        nombres,
        apellidos,
        correo,
        estado;
      `,
      [estado, idUsuario]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    return res.json({
      message:
        estado === 'ACTIVO'
          ? 'Usuario activado correctamente'
          : 'Usuario desactivado correctamente',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error changing user status:', error);

    return res.status(500).json({
      message: 'No fue posible cambiar el estado del usuario',
    });
  }
});
// ========================================================
// CU01 - CONSULTAR USUARIO POR ID
// ========================================================

app.get('/api/users/:id', async (req, res) => {
  const idUsuario = Number(req.params.id);

  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return res.status(400).json({
      message: 'El identificador del usuario no es válido',
    });
  }

  try {
    const result = await pool.query(
      `
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
        r.nombre AS rol,

        e.codigo_estudiante,
        e.semestre,
        e.id_programa,

        t.id_tutor,
        t.cargo

      FROM users.usuario u

      INNER JOIN users.rol r
        ON r.id_rol = u.id_rol

      LEFT JOIN users.estudiante e
        ON e.id_usuario = u.id_usuario

      LEFT JOIN users.tutor_receptor t
        ON t.id_usuario = u.id_usuario

      WHERE u.id_usuario = $1;
      `,
      [idUsuario]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    return res.json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error querying user:', error);

    return res.status(500).json({
      message: 'No fue posible consultar el usuario',
    });
  }
});

// ========================================================
// CU01 - ACTUALIZAR USUARIO
// ========================================================

app.patch('/api/users/:id', async (req, res) => {
  const idUsuario = Number(req.params.id);

  const {
    nombres,
    apellidos,
    telefono,
    semestre,
    id_programa,
    cargo,
  } = req.body;

  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return res.status(400).json({
      message: 'El identificador del usuario no es válido',
    });
  }

  if (!nombres?.trim() || !apellidos?.trim()) {
    return res.status(400).json({
      message: 'Nombres y apellidos son obligatorios',
    });
  }

  const client = await pool.connect();

  let transactionStarted = false;

  try {
    // ----------------------------------------------------
    // Consultar rol actual del usuario
    // ----------------------------------------------------

    const userProfile = await client.query(
      `
      SELECT
        u.id_usuario,
        r.nombre AS rol
      FROM users.usuario u
      INNER JOIN users.rol r
        ON r.id_rol = u.id_rol
      WHERE u.id_usuario = $1;
      `,
      [idUsuario]
    );

    if (userProfile.rowCount === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    const rol = userProfile.rows[0].rol;

    // ----------------------------------------------------
    // Validaciones específicas del estudiante
    // ----------------------------------------------------

    if (rol === 'ESTUDIANTE') {
      const semestreNumero = Number(semestre);
      const programaNumero = Number(id_programa);

      if (
        !Number.isInteger(semestreNumero) ||
        semestreNumero <= 0 ||
        semestreNumero > 20
      ) {
        return res.status(400).json({
          message: 'El semestre ingresado no es válido',
        });
      }

      if (
        !Number.isInteger(programaNumero) ||
        programaNumero <= 0
      ) {
        return res.status(400).json({
          message:
            'Debe seleccionar un programa académico válido',
        });
      }

      // Validar que el programa realmente exista
      // en Practice Service.
      const programResponse = await fetch(
        'http://localhost:3335/api/programs'
      );

      if (!programResponse.ok) {
        return res.status(503).json({
          message:
            'No fue posible validar el programa académico',
        });
      }

      const programData = await programResponse.json();

      const programExists =
        Array.isArray(programData.data) &&
        programData.data.some(
          (program: { id_programa: number }) =>
            program.id_programa === programaNumero
        );

      if (!programExists) {
        return res.status(400).json({
          message:
            'El programa académico seleccionado no existe',
        });
      }
    }

    if (
      rol === 'TUTOR_RECEPTOR' &&
      cargo !== undefined &&
      cargo !== null &&
      (typeof cargo !== 'string' ||
        cargo.trim().length > 120)
    ) {
      return res.status(400).json({
        message:
          'El cargo del tutor receptor no puede superar 120 caracteres',
      });
    }

    // ----------------------------------------------------
    // Transacción
    // ----------------------------------------------------

    await client.query('BEGIN');
    transactionStarted = true;

    const userResult = await client.query(
      `
      UPDATE users.usuario
      SET
        nombres = $1,
        apellidos = $2,
        telefono = $3
      WHERE id_usuario = $4
      RETURNING
        id_usuario,
        nombres,
        apellidos,
        correo,
        telefono,
        estado;
      `,
      [
        nombres.trim(),
        apellidos.trim(),
        telefono?.trim() || null,
        idUsuario,
      ]
    );

    // ----------------------------------------------------
    // Actualizar información académica
    // ----------------------------------------------------

    let studentData = null;

    if (rol === 'ESTUDIANTE') {
      const studentResult = await client.query(
        `
        UPDATE users.estudiante
        SET
          semestre = $1,
          id_programa = $2
        WHERE id_usuario = $3
        RETURNING
          codigo_estudiante,
          semestre,
          id_programa;
        `,
        [
          Number(semestre),
          Number(id_programa),
          idUsuario,
        ]
      );

      if (studentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(409).json({
          message:
            'El usuario no tiene un perfil de estudiante asociado',
        });
      }

      studentData = studentResult.rows[0];
    }

    // ----------------------------------------------------
    // Actualizar cargo del tutor receptor
    // ----------------------------------------------------

    let tutorData = null;

    if (rol === 'TUTOR_RECEPTOR') {
      const tutorResult = await client.query(
        `
        UPDATE users.tutor_receptor
        SET cargo = $1
        WHERE id_usuario = $2
        RETURNING
          id_tutor,
          cargo;
        `,
        [
          typeof cargo === 'string'
            ? cargo.trim() || null
            : null,
          idUsuario,
        ]
      );

      if (tutorResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(409).json({
          message:
            'El usuario no tiene un perfil de tutor receptor asociado',
        });
      }

      tutorData = tutorResult.rows[0];
    }

    await client.query('COMMIT');
    transactionStarted = false;

    return res.json({
      message: 'Usuario actualizado correctamente',
      data: {
        ...userResult.rows[0],
        rol,
        ...(studentData ?? {}),
        ...(tutorData ?? {}),
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }

    console.error('Error updating user:', error);

    return res.status(500).json({
      message: 'No fue posible actualizar el usuario',
    });
  } finally {
    client.release();
  }
});

// ======================================================
// CU03 - DATOS INTERNOS PARA GRUPOS
// ======================================================

// Docentes asesores activos
app.get('/api/internal/teachers/available', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        d.id_docente,
        u.id_usuario,
        u.nombres,
        u.apellidos,
        u.numero_documento,
        u.correo
      FROM users.docente_asesor d
      INNER JOIN users.usuario u
        ON u.id_usuario = d.id_usuario
      INNER JOIN users.rol r
        ON r.id_rol = u.id_rol
      WHERE
        r.nombre = 'DOCENTE'
        AND u.estado = 'ACTIVO'
      ORDER BY u.nombres, u.apellidos
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error(
      'Error consultando docentes disponibles:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar los docentes asesores disponibles',
    });
  }
});

// Estudiantes activos
app.get('/api/internal/students/available', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id_estudiante,
        u.id_usuario,
        u.nombres,
        u.apellidos,
        u.numero_documento,
        u.correo,
        e.codigo_estudiante,
        e.semestre,
        e.id_programa
      FROM users.estudiante e
      INNER JOIN users.usuario u
        ON u.id_usuario = e.id_usuario
      INNER JOIN users.rol r
        ON r.id_rol = u.id_rol
      WHERE
        r.nombre = 'ESTUDIANTE'
        AND u.estado = 'ACTIVO'
      ORDER BY u.nombres, u.apellidos
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error(
      'Error consultando estudiantes disponibles:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar los estudiantes disponibles',
    });
  }
});

// ======================================================
// DATOS INTERNOS PARA ASIGNACIONES DE PRÁCTICA
// ======================================================

// Tutores receptores activos
app.get('/api/internal/tutors/available', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id_tutor,
        u.id_usuario,
        u.nombres,
        u.apellidos,
        u.numero_documento,
        u.correo,
        t.cargo
      FROM users.tutor_receptor t

      INNER JOIN users.usuario u
        ON u.id_usuario = t.id_usuario

      INNER JOIN users.rol r
        ON r.id_rol = u.id_rol

      WHERE
        r.nombre = 'TUTOR_RECEPTOR'
        AND u.estado = 'ACTIVO'

      ORDER BY
        u.nombres,
        u.apellidos
    `);

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error(
      'Error consultando tutores receptores disponibles:',
      error
    );

    return res.status(500).json({
      message:
        'No fue posible consultar los tutores receptores disponibles',
    });
  }
});


// ======================================================
// CU04 - DOCENTE POR AUTH USER
// ======================================================

app.get(
  '/api/internal/teachers/by-auth/:authUserId',
  async (req, res) => {
    const authUserId = req.params.authUserId;

    try {
      const result = await pool.query(
        `
          SELECT
            d.id_docente,
            u.id_usuario,
            u.auth_user_id,
            u.nombres,
            u.apellidos,
            u.correo,
            u.estado,
            r.nombre AS rol
          FROM users.docente_asesor d
          INNER JOIN users.usuario u
            ON u.id_usuario = d.id_usuario
          INNER JOIN users.rol r
            ON r.id_rol = u.id_rol
          WHERE u.auth_user_id = $1
          LIMIT 1
        `,
        [authUserId]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Docente Asesor no encontrado',
        });
      }

      const docente = result.rows[0];

      if (docente.estado !== 'ACTIVO') {
        return res.status(403).json({
          message: 'El Docente Asesor se encuentra inactivo',
        });
      }

      return res.json({
        data: docente,
      });
    } catch (error) {
      console.error(
        'Error consultando docente por auth:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar el Docente Asesor',
      });
    }
  }
);

// ======================================================
// ESTUDIANTE AUTENTICADO
// Usado por API Gateway para validar el rol ESTUDIANTE
// ======================================================

app.get(
  '/api/internal/students/by-auth/:authUserId',
  async (req, res) => {
    const authUserId = String(
      req.params.authUserId ?? ''
    ).trim();

    if (!authUserId) {
      return res.status(400).json({
        message:
          'El identificador de autenticación no es válido',
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT
            e.id_estudiante,
            e.id_usuario,
            e.codigo_estudiante,
            e.semestre,
            e.id_programa,
            u.auth_user_id,
            u.nombres,
            u.apellidos,
            u.correo,
            u.estado,
            r.nombre AS rol
          FROM users.estudiante e
          INNER JOIN users.usuario u
            ON u.id_usuario = e.id_usuario
          INNER JOIN users.rol r
            ON r.id_rol = u.id_rol
          WHERE u.auth_user_id = $1
          LIMIT 1
        `,
        [authUserId]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Estudiante no encontrado',
        });
      }

      return res.json({
        data: result.rows[0],
      });
    } catch (error) {
      console.error(
        'Error consultando estudiante por auth:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar el estudiante',
      });
    }
  }
);

// ======================================================
// TUTOR RECEPTOR AUTENTICADO
// Usado por API Gateway para validar el rol TUTOR_RECEPTOR
// ======================================================

app.get(
  '/api/internal/tutors/by-auth/:authUserId',
  async (req, res) => {
    const authUserId = String(
      req.params.authUserId ?? ''
    ).trim();

    if (!authUserId) {
      return res.status(400).json({
        message:
          'El identificador de autenticación no es válido',
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT
            t.id_tutor,
            t.id_usuario,
            t.cargo,
            u.auth_user_id,
            u.nombres,
            u.apellidos,
            u.correo,
            u.estado,
            r.nombre AS rol
          FROM users.tutor_receptor t
          INNER JOIN users.usuario u
            ON u.id_usuario = t.id_usuario
          INNER JOIN users.rol r
            ON r.id_rol = u.id_rol
          WHERE u.auth_user_id = $1
          LIMIT 1
        `,
        [authUserId]
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          message: 'Tutor receptor no encontrado',
        });
      }

      return res.json({
        data: result.rows[0],
      });
    } catch (error) {
      console.error(
        'Error consultando tutor por auth:',
        error
      );

      return res.status(500).json({
        message:
          'No fue posible consultar el tutor receptor',
      });
    }
  }
);

// ======================================================
// ESTUDIANTES POR IDENTIFICADORES
// Incluye inactivos: el historial de seguimiento debe
// mostrar a quien participó aunque hoy esté inactivo.
// Uso: ?ids=1,2,3 (máx. 500)
// ======================================================

app.get('/api/internal/students/by-ids', async (req, res) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    return res.json({ data: [] });
  }

  if (uniqueIds.length > 500) {
    return res.status(400).json({
      message: 'Se pueden consultar máximo 500 estudiantes',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          e.id_estudiante,
          u.nombres,
          u.apellidos,
          u.correo,
          u.estado,
          e.codigo_estudiante,
          e.semestre,
          e.id_programa
        FROM users.estudiante e
        INNER JOIN users.usuario u
          ON u.id_usuario = e.id_usuario
        WHERE e.id_estudiante = ANY($1::int[])
        ORDER BY u.nombres, u.apellidos
      `,
      [uniqueIds]
    );

    return res.json({
      data: result.rows,
    });
  } catch (error) {
    console.error(
      'Error consultando estudiantes por identificadores:',
      error
    );

    return res.status(500).json({
      message: 'No fue posible consultar los estudiantes',
    });
  }
});

const port = process.env.PORT || 3334;

const server = app.listen(port, () => {
  console.log(
    `User Service listening at http://localhost:${port}/api`
  );
});

server.on('error', console.error);
