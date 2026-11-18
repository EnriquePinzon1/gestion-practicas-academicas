-- =====================================================
-- MIGRACIÓN 004
-- CONTRACT DEL MODELO DE PRÁCTICA CURRICULAR
-- =====================================================
--
-- La práctica académica pasa a representar únicamente
-- el catálogo curricular.
--
-- La institución receptora y el periodo académico ya
-- pertenecen a:
--
--   - practices.asignacion_practica
--   - practices.grupo (periodo académico)
--
-- Los datos históricos fueron migrados previamente
-- mediante las migraciones 002 y 003.
-- =====================================================

BEGIN;

ALTER TABLE practices.practica
  DROP COLUMN id_institucion,
  DROP COLUMN periodo_academico;

COMMIT;
