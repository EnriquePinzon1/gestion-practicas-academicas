-- ============================================================
-- 008 - BITÁCORA DE OBSERVACIONES DEL TUTOR RECEPTOR
--
-- El Tutor Receptor registra observaciones fechadas sobre el
-- desempeño del practicante en la institución. Es un registro
-- propio del tutor POR ASIGNACIÓN (practices.asignacion_practica),
-- independiente del seguimiento académico del docente.
--
-- Reglas (aplicadas por practice-service):
-- - Solo el tutor de la asignación registra y corrige, y solo
--   sus propias observaciones.
-- - La asignación debe estar EN_CURSO (el practicante está en
--   la institución). FINALIZADA y CANCELADA quedan en solo
--   lectura.
-- - fecha entre fecha_inicio de la asignación y hoy
--   (America/Bogota).
-- - No se eliminan: son historial; solo se corrigen
--   (actualizado_en).
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS practices.observacion_tutor (
  id_observacion SERIAL PRIMARY KEY,

  id_asignacion INTEGER NOT NULL,

  id_tutor INTEGER NOT NULL,

  fecha DATE NOT NULL,

  descripcion TEXT NOT NULL,

  creado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_observacion_tutor_asignacion
    FOREIGN KEY (id_asignacion)
    REFERENCES practices.asignacion_practica(id_asignacion)
    ON DELETE RESTRICT,

  CONSTRAINT chk_observacion_tutor_descripcion
    CHECK (
      length(btrim(descripcion)) > 0
      AND length(descripcion) <= 2000
    )
);

CREATE INDEX IF NOT EXISTS idx_observacion_tutor_asignacion
  ON practices.observacion_tutor (id_asignacion);

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
  AND table_name = 'observacion_tutor'
ORDER BY ordinal_position;
