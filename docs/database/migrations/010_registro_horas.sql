-- ============================================================
-- 010 - REGISTRO DE HORAS DE PRÁCTICA (CU "Realizar Seguimiento
-- de Prácticas", BS1 Coordinador / BS4 Estudiante)
--
-- El Coordinador registra las horas realizadas por el
-- practicante en cada ASIGNACIÓN (practices.asignacion_practica).
-- Las horas requeridas salen de practices.practica.horas_requeridas;
-- el acumulado se calcula con SUM (no se almacena).
--
-- Reglas (aplicadas por practice-service):
-- - Solo con la asignación EN_CURSO; FINALIZADA y CANCELADA
--   quedan en solo lectura.
-- - fecha entre el inicio de la asignación (fecha_inicio, o la
--   fecha de creación si es nula) y hoy (America/Bogota).
-- - horas > 0, un decimal, como máximo las horas requeridas de
--   la práctica por registro.
-- - Se pueden corregir y eliminar mientras esté EN_CURSO.
-- - Pasar la asignación a FINALIZADA exige horas completas.
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS practices.registro_horas (
  id_registro SERIAL PRIMARY KEY,

  id_asignacion INTEGER NOT NULL,

  fecha DATE NOT NULL,

  horas NUMERIC(5,1) NOT NULL,

  observacion TEXT,

  -- id_usuario del Coordinador que registró o corrigió.
  registrado_por INTEGER NOT NULL,

  creado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_registro_horas_asignacion
    FOREIGN KEY (id_asignacion)
    REFERENCES practices.asignacion_practica(id_asignacion)
    ON DELETE RESTRICT,

  CONSTRAINT chk_registro_horas_horas
    CHECK (horas > 0),

  CONSTRAINT chk_registro_horas_observacion
    CHECK (
      observacion IS NULL
      OR (
        length(btrim(observacion)) > 0
        AND length(observacion) <= 2000
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_registro_horas_asignacion
  ON practices.registro_horas (id_asignacion);

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
  AND table_name = 'registro_horas'
ORDER BY ordinal_position;
