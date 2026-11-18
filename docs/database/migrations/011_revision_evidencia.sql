-- ============================================================
-- 011 - REVISIÓN DE EVIDENCIAS POR EL DOCENTE ASESOR
-- (CU "Realizar Seguimiento de Prácticas", BS2)
--
-- El Docente Asesor revisa cada evidencia adjunta a una
-- entrega y puede dejar una observación. Una revisión por
-- evidencia; el estado (Pendiente / Revisada) se deriva de la
-- existencia de la fila, no se almacena.
--
-- Reglas (aplicadas por activity-service):
-- - Solo el docente de la actividad.
-- - Solo con la entrega definitiva (actividad CERRADA o plazo
--   vencido): antes el estudiante aún puede cambiar evidencias.
-- - Observación opcional (≤ 2000). Volver a guardar corrige.
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS activities.revision_evidencia (
  id_revision SERIAL PRIMARY KEY,

  id_evidencia INTEGER NOT NULL,

  id_docente INTEGER NOT NULL,

  observacion TEXT,

  revisado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  actualizado_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT uq_revision_evidencia
    UNIQUE (id_evidencia),

  CONSTRAINT fk_revision_evidencia_evidencia
    FOREIGN KEY (id_evidencia)
    REFERENCES activities.evidencia(id_evidencia)
    ON DELETE RESTRICT,

  CONSTRAINT chk_revision_evidencia_observacion
    CHECK (
      observacion IS NULL
      OR (
        length(btrim(observacion)) > 0
        AND length(observacion) <= 2000
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
  AND table_name = 'revision_evidencia'
ORDER BY ordinal_position;
