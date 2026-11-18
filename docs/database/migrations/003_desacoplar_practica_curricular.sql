-- ============================================================
-- REDISEÑO DEL MODELO DE NEGOCIO DE PRÁCTICAS
-- FASE 3: ADAPT - ESTRUCTURA
--
-- Objetivo:
-- - practica representa únicamente la definición curricular.
-- - grupo representa una cohorte de seguimiento en un periodo.
-- - asignacion_practica representa dónde realiza la práctica
--   cada estudiante.
--
-- Esta migración todavía NO elimina columnas legacy.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. EL PERIODO ACADÉMICO PASA A PERTENECER AL GRUPO
-- ============================================================

ALTER TABLE practices.grupo
ADD COLUMN IF NOT EXISTS periodo_academico VARCHAR(20);


-- ============================================================
-- 2. MIGRAR EL PERIODO DE LOS GRUPOS EXISTENTES
--
-- Temporalmente lo obtenemos de practices.practica porque
-- ese era el modelo anterior.
-- ============================================================

UPDATE practices.grupo g
SET periodo_academico = p.periodo_academico
FROM practices.practica p
WHERE
  p.id_practica = g.id_practica
  AND g.periodo_academico IS NULL;


-- ============================================================
-- 3. A PARTIR DE AHORA TODO GRUPO DEBE TENER PERIODO
-- ============================================================

ALTER TABLE practices.grupo
ALTER COLUMN periodo_academico SET NOT NULL;


-- ============================================================
-- 4. CORREGIR UNICIDAD DEL GRUPO
--
-- Antes:
--   practica + nombre
--
-- Ahora:
--   practica + periodo + nombre
--
-- Esto permite reutilizar nombres de grupos en periodos
-- académicos distintos sin mezclar cohortes.
-- ============================================================

ALTER TABLE practices.grupo
DROP CONSTRAINT IF EXISTS uq_grupo_practica_nombre;


ALTER TABLE practices.grupo
ADD CONSTRAINT uq_grupo_practica_periodo_nombre
UNIQUE (
  id_practica,
  periodo_academico,
  nombre
);


-- ============================================================
-- 5. LIBERAR LAS COLUMNAS LEGACY DE PRACTICA
--
-- Todavía NO se eliminan.
--
-- Se vuelven opcionales para permitir que el backend nuevo
-- cree prácticas curriculares sin institución ni periodo.
--
-- Los registros antiguos conservan sus valores hasta la
-- fase CONTRACT.
-- ============================================================

ALTER TABLE practices.practica
ALTER COLUMN id_institucion DROP NOT NULL;


ALTER TABLE practices.practica
ALTER COLUMN periodo_academico DROP NOT NULL;


COMMIT;
