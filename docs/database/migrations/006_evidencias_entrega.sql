-- ============================================================
-- 006 - EVIDENCIAS DE ENTREGA
--
-- Una EVIDENCIA es un archivo adjunto a una ENTREGA
-- (activities.entrega). Los archivos viven en Supabase
-- Storage, en el bucket PRIVADO "evidencias"; la base de datos
-- guarda solo los metadatos y la ruta del objeto.
--
-- Reglas (aplicadas por activity-service):
-- - Solo el estudiante dueño de la entrega sube o elimina.
-- - Actividad ABIERTA y dentro del plazo.
-- - Máximo 5 evidencias por entrega, 10 MB por archivo.
-- - Tipos: PDF, JPG, PNG, WEBP, Word, Excel, PowerPoint
--   (validados por contenido, no por lo que declara el cliente).
-- - La descarga se hace con URLs firmadas de corta duración.
--
-- Migración aditiva: no modifica ni elimina datos existentes.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. BUCKET PRIVADO EN SUPABASE STORAGE
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'evidencias',
  'evidencias',
  FALSE,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. EVIDENCIA
-- ============================================================

CREATE TABLE IF NOT EXISTS activities.evidencia (
  id_evidencia SERIAL PRIMARY KEY,

  id_entrega INTEGER NOT NULL,

  nombre_archivo VARCHAR(255) NOT NULL,

  ruta_storage VARCHAR(500) NOT NULL,

  tipo_mime VARCHAR(120) NOT NULL,

  tamano_bytes INTEGER NOT NULL,

  subido_en TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT fk_evidencia_entrega
    FOREIGN KEY (id_entrega)
    REFERENCES activities.entrega(id_entrega)
    ON DELETE RESTRICT,

  CONSTRAINT uq_evidencia_ruta
    UNIQUE (ruta_storage),

  CONSTRAINT chk_evidencia_tamano
    CHECK (
      tamano_bytes > 0
      AND tamano_bytes <= 10485760
    )
);

CREATE INDEX IF NOT EXISTS
  idx_evidencia_entrega
ON activities.evidencia (
  id_entrega
);

COMMIT;


-- ============================================================
-- 3. COMPROBACIONES
-- ============================================================

SELECT
  id,
  public,
  file_size_limit
FROM storage.buckets
WHERE id = 'evidencias';
