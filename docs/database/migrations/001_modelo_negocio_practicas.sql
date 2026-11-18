-- ============================================================
-- REDISEÑO DEL MODELO DE NEGOCIO DE PRÁCTICAS
-- FASE 1: EXPAND
--
-- Esta migración NO elimina estructuras existentes.
-- Solo agrega las entidades necesarias para el nuevo modelo.
-- ============================================================


-- ============================================================
-- 1. NUEVO ROL: TUTOR RECEPTOR
-- ============================================================

INSERT INTO users.rol (
  nombre,
  descripcion
)
VALUES (
  'TUTOR_RECEPTOR',
  'Responsable del estudiante en la institución receptora'
)
ON CONFLICT (nombre) DO NOTHING;


-- ============================================================
-- 2. PERFIL ESPECÍFICO DEL TUTOR RECEPTOR
--
-- Se mantiene separado de usuario porque un tutor es un tipo
-- específico de usuario, igual que estudiante o docente.
-- ============================================================

CREATE TABLE IF NOT EXISTS users.tutor_receptor (
  id_tutor SERIAL PRIMARY KEY,

  id_usuario INTEGER NOT NULL UNIQUE,

  cargo VARCHAR(120),

  CONSTRAINT fk_tutor_usuario
    FOREIGN KEY (id_usuario)
    REFERENCES users.usuario(id_usuario)
);


-- ============================================================
-- 3. RELACIÓN ENTRE INSTITUCIÓN Y TUTOR
--
-- Permite indicar en qué institución puede actuar un tutor.
--
-- id_tutor es una referencia lógica al dominio users.
-- No se crea FK física entre microservicios.
-- ============================================================

CREATE TABLE IF NOT EXISTS practices.institucion_tutor (
  id_institucion_tutor SERIAL PRIMARY KEY,

  id_institucion INTEGER NOT NULL,

  id_tutor INTEGER NOT NULL,

  activo BOOLEAN NOT NULL DEFAULT TRUE,

  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_institucion_tutor_institucion
    FOREIGN KEY (id_institucion)
    REFERENCES practices.institucion(id_institucion),

  CONSTRAINT uq_institucion_tutor
    UNIQUE (
      id_institucion,
      id_tutor
    )
);


-- ============================================================
-- 4. ASIGNACIÓN INDIVIDUAL DE PRÁCTICA
--
-- Esta entidad representa la práctica REAL de cada estudiante.
--
-- Dos estudiantes del mismo grupo pueden estar vinculados a
-- instituciones distintas.
--
-- id_estudiante e id_tutor son referencias lógicas al dominio
-- users.
-- ============================================================

CREATE TABLE IF NOT EXISTS practices.asignacion_practica (
  id_asignacion SERIAL PRIMARY KEY,

  id_estudiante INTEGER NOT NULL,

  id_practica INTEGER NOT NULL,

  id_institucion INTEGER NOT NULL,

  id_tutor INTEGER,

  periodo_academico VARCHAR(20) NOT NULL,

  estado VARCHAR(20)
    NOT NULL
    DEFAULT 'ASIGNADA',

  fecha_inicio DATE,

  fecha_fin DATE,

  creado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_asignacion_practica
    FOREIGN KEY (id_practica)
    REFERENCES practices.practica(id_practica),

  CONSTRAINT fk_asignacion_institucion
    FOREIGN KEY (id_institucion)
    REFERENCES practices.institucion(id_institucion),

  CONSTRAINT chk_asignacion_estado
    CHECK (
      estado IN (
        'ASIGNADA',
        'EN_CURSO',
        'FINALIZADA',
        'CANCELADA'
      )
    ),

  CONSTRAINT chk_asignacion_fechas
    CHECK (
      fecha_fin IS NULL
      OR fecha_inicio IS NULL
      OR fecha_fin >= fecha_inicio
    )
);


-- ============================================================
-- 5. SOLO UNA ASIGNACIÓN VIGENTE POR
--    ESTUDIANTE + PRÁCTICA + PERIODO
--
-- Una asignación CANCELADA o FINALIZADA queda como histórico
-- y no impide crear posteriormente otra asignación.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_asignacion_practica_vigente
ON practices.asignacion_practica (
  id_estudiante,
  id_practica,
  periodo_academico
)
WHERE estado IN (
  'ASIGNADA',
  'EN_CURSO'
);


-- ============================================================
-- 6. ACTIVIDAD ASIGNADA A CADA ESTUDIANTE
--
-- El docente puede seguir creando UNA actividad para un grupo.
--
-- Internamente se crea una asignación individual para cada
-- estudiante del grupo.
--
-- De esta forma el historial permanece ligado al estudiante
-- incluso si posteriormente cambia de grupo.
-- ============================================================

CREATE TABLE IF NOT EXISTS activities.actividad_estudiante (
  id_actividad_estudiante SERIAL PRIMARY KEY,

  id_actividad INTEGER NOT NULL,

  id_estudiante INTEGER NOT NULL,

  estado VARCHAR(20)
    NOT NULL
    DEFAULT 'PENDIENTE',

  asignado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_actividad_estudiante_actividad
    FOREIGN KEY (id_actividad)
    REFERENCES activities.actividad(id_actividad)
    ON DELETE CASCADE,

  CONSTRAINT chk_actividad_estudiante_estado
    CHECK (
      estado IN (
        'PENDIENTE',
        'ENTREGADA'
      )
    ),

  CONSTRAINT uq_actividad_estudiante
    UNIQUE (
      id_actividad,
      id_estudiante
    )
);


-- ============================================================
-- 7. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_asignacion_estudiante
ON practices.asignacion_practica (
  id_estudiante
);


CREATE INDEX IF NOT EXISTS
  idx_asignacion_institucion
ON practices.asignacion_practica (
  id_institucion
);


CREATE INDEX IF NOT EXISTS
  idx_asignacion_practica
ON practices.asignacion_practica (
  id_practica
);


CREATE INDEX IF NOT EXISTS
  idx_asignacion_tutor
ON practices.asignacion_practica (
  id_tutor
);


CREATE INDEX IF NOT EXISTS
  idx_actividad_estudiante_estudiante
ON activities.actividad_estudiante (
  id_estudiante
);


CREATE INDEX IF NOT EXISTS
  idx_actividad_estudiante_actividad
ON activities.actividad_estudiante (
  id_actividad
);
