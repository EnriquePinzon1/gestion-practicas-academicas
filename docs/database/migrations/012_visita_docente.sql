-- ============================================================
-- 012 - VISITAS DEL DOCENTE ASESOR
-- (CU "Realizar Seguimiento de Prácticas", BS3)
--
-- El Docente Asesor registra las visitas que hace a la
-- institución donde el estudiante realiza su práctica. La
-- visita se asocia a la ASIGNACIÓN (dónde y con quién), que se
-- enlaza al grupo del docente por misma práctica y período.
--
-- Reglas (aplicadas por practice-service):
-- - Solo el docente del grupo, con el estudiante en el grupo.
-- - Asignación EN_CURSO; fecha entre el inicio y hoy (Bogotá).
-- - descripcion obligatoria (≤ 2000); observaciones opcionales
--   (≤ 2000, internas: el estudiante solo ve fecha y descripción).
-- - Solo se corrigen las propias; no se eliminan (historial).
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS practices.visita_docente (
  id_visita SERIAL PRIMARY KEY,

  id_asignacion INTEGER NOT NULL,

  id_docente INTEGER NOT NULL,

  fecha DATE NOT NULL,

  descripcion TEXT NOT NULL,

  observaciones TEXT,

  creado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_visita_docente_asignacion
    FOREIGN KEY (id_asignacion)
    REFERENCES practices.asignacion_practica(id_asignacion)
    ON DELETE RESTRICT,

  CONSTRAINT chk_visita_docente_descripcion
    CHECK (
      length(btrim(descripcion)) > 0
      AND length(descripcion) <= 2000
    ),

  CONSTRAINT chk_visita_docente_observaciones
    CHECK (
      observaciones IS NULL
      OR (
        length(btrim(observaciones)) > 0
        AND length(observaciones) <= 2000
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_visita_docente_asignacion
  ON practices.visita_docente (id_asignacion);

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
  AND table_name = 'visita_docente'
ORDER BY ordinal_position;
