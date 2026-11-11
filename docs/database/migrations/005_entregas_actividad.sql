-- ============================================================
-- 005 - ENTREGAS DE ACTIVIDADES
--
-- Una ENTREGA pertenece únicamente a una fila de
-- activities.actividad_estudiante (snapshot histórico de la
-- actividad asignada a cada estudiante). No depende de
-- actividad + estudiante + grupo.
--
-- Una entrega contiene una RESPUESTA por cada PREGUNTA de la
-- actividad. Las futuras EVIDENCIAS (archivos) se vincularán
-- a activities.entrega.
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENTREGA
--
-- Máximo una entrega por actividad asignada al estudiante.
-- Mientras la actividad esté ABIERTA y dentro del plazo, el
-- estudiante puede corregirla: entregado_en conserva la
-- primera entrega y actualizado_en la última modificación.
-- ============================================================

CREATE TABLE IF NOT EXISTS activities.entrega (
  id_entrega SERIAL PRIMARY KEY,

  id_actividad_estudiante INTEGER NOT NULL,

  entregado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_entrega_actividad_estudiante
    FOREIGN KEY (id_actividad_estudiante)
    REFERENCES activities.actividad_estudiante(id_actividad_estudiante)
    ON DELETE RESTRICT,

  CONSTRAINT uq_entrega_actividad_estudiante
    UNIQUE (id_actividad_estudiante)
);


-- ============================================================
-- 2. RESPUESTA
--
-- ON DELETE RESTRICT sobre pregunta: la base de datos impide
-- eliminar preguntas que ya tienen respuestas entregadas.
-- ============================================================

CREATE TABLE IF NOT EXISTS activities.respuesta (
  id_respuesta SERIAL PRIMARY KEY,

  id_entrega INTEGER NOT NULL,

  id_pregunta INTEGER NOT NULL,

  contenido TEXT NOT NULL,

  CONSTRAINT fk_respuesta_entrega
    FOREIGN KEY (id_entrega)
    REFERENCES activities.entrega(id_entrega)
    ON DELETE CASCADE,

  CONSTRAINT fk_respuesta_pregunta
    FOREIGN KEY (id_pregunta)
    REFERENCES activities.pregunta(id_pregunta)
    ON DELETE RESTRICT,

  CONSTRAINT uq_respuesta_entrega_pregunta
    UNIQUE (
      id_entrega,
      id_pregunta
    ),

  CONSTRAINT chk_respuesta_contenido
    CHECK (
      length(btrim(contenido)) > 0
    )
);


-- ============================================================
-- 3. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_respuesta_pregunta
ON activities.respuesta (
  id_pregunta
);

COMMIT;


-- ============================================================
-- 4. COMPROBACIONES
-- ============================================================

SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'activities'
  AND table_name IN ('entrega', 'respuesta')
ORDER BY
  table_name,
  ordinal_position;
