-- ============================================================
-- 007 - RETROALIMENTACIÓN DEL DOCENTE SOBRE CADA ENTREGA
--
-- El Docente Asesor evalúa cada ENTREGA (activities.entrega)
-- con una calificación en escala 0.0 a 5.0 y un comentario
-- opcional. Máximo una retroalimentación por entrega; el
-- docente puede corregirla (actualizado_en).
--
-- Reglas (aplicadas por activity-service):
-- - Solo el docente dueño de la actividad.
-- - La entrega debe ser definitiva: actividad CERRADA o con
--   la fecha límite vencida (el estudiante ya no puede
--   modificarla), para no calificar una versión cambiante.
--
-- El estado "revisada" se deriva de la existencia de la
-- retroalimentación; no se modifica actividad_estudiante.
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS activities.retroalimentacion (
  id_retroalimentacion SERIAL PRIMARY KEY,

  id_entrega INTEGER NOT NULL,

  id_docente INTEGER NOT NULL,

  calificacion NUMERIC(2, 1) NOT NULL,

  comentario TEXT,

  creado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_retroalimentacion_entrega
    FOREIGN KEY (id_entrega)
    REFERENCES activities.entrega(id_entrega)
    ON DELETE RESTRICT,

  CONSTRAINT uq_retroalimentacion_entrega
    UNIQUE (id_entrega),

  CONSTRAINT chk_retroalimentacion_calificacion
    CHECK (
      calificacion >= 0
      AND calificacion <= 5
    ),

  CONSTRAINT chk_retroalimentacion_comentario
    CHECK (
      comentario IS NULL
      OR (
        length(btrim(comentario)) > 0
        AND length(comentario) <= 2000
      )
    )
);

COMMIT;


-- ============================================================
-- COMPROBACIONES
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'activities'
  AND table_name = 'retroalimentacion'
ORDER BY ordinal_position;
