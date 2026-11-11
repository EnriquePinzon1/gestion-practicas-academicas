-- ============================================================
-- 009 - EVALUACIÓN FINAL DEL TUTOR RECEPTOR
--
-- Al cierre de la práctica, el Tutor Receptor emite el concepto
-- de la institución sobre el practicante: una calificación
-- (0.0 a 5.0), un concepto escrito y si recomienda aprobar.
-- Máximo una evaluación por asignación.
--
-- Reglas (aplicadas por practice-service):
-- - Solo el tutor de la asignación.
-- - Se registra y corrige mientras la asignación está EN_CURSO;
--   al pasar a FINALIZADA queda fija.
-- - Una asignación con tutor no puede pasar a FINALIZADA sin
--   evaluación (409).
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS practices.evaluacion_tutor (
  id_evaluacion SERIAL PRIMARY KEY,

  id_asignacion INTEGER NOT NULL,

  id_tutor INTEGER NOT NULL,

  calificacion NUMERIC(2, 1) NOT NULL,

  concepto TEXT NOT NULL,

  recomienda_aprobacion BOOLEAN NOT NULL,

  creado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_evaluacion_tutor_asignacion
    FOREIGN KEY (id_asignacion)
    REFERENCES practices.asignacion_practica(id_asignacion)
    ON DELETE RESTRICT,

  CONSTRAINT uq_evaluacion_tutor_asignacion
    UNIQUE (id_asignacion),

  CONSTRAINT chk_evaluacion_tutor_calificacion
    CHECK (
      calificacion >= 0
      AND calificacion <= 5
    ),

  CONSTRAINT chk_evaluacion_tutor_concepto
    CHECK (
      length(btrim(concepto)) > 0
      AND length(concepto) <= 2000
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
WHERE table_schema = 'practices'
  AND table_name = 'evaluacion_tutor'
ORDER BY ordinal_position;
