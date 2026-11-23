-- ============================================================
-- REDISEÑO DEL MODELO DE NEGOCIO DE PRÁCTICAS
-- FASE 2: MIGRATE
--
-- Migra los datos existentes al nuevo modelo.
-- NO elimina ni modifica las estructuras antiguas.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. MIGRAR ASIGNACIONES DE PRÁCTICA
--
-- Modelo antiguo:
--
-- estudiante
--   -> grupo
--   -> practica
--   -> institucion
--
-- Modelo nuevo:
--
-- estudiante
--   -> asignacion_practica
--   -> practica
--   -> institucion
--
-- Como el modelo anterior asociaba la institución directamente
-- a la práctica, utilizamos esa información para construir
-- las asignaciones históricas iniciales.
-- ============================================================

WITH asignaciones_anteriores AS (

  SELECT DISTINCT
    ge.id_estudiante,
    p.id_practica,
    p.id_institucion,
    p.periodo_academico,

    CASE
      WHEN p.estado = 'CERRADA'
        THEN 'FINALIZADA'
      ELSE 'EN_CURSO'
    END AS estado

  FROM practices.grupo_estudiante ge

  INNER JOIN practices.grupo g
    ON g.id_grupo = ge.id_grupo

  INNER JOIN practices.practica p
    ON p.id_practica = g.id_practica

  WHERE p.id_institucion IS NOT NULL

)

INSERT INTO practices.asignacion_practica (
  id_estudiante,
  id_practica,
  id_institucion,
  periodo_academico,
  estado
)

SELECT
  anterior.id_estudiante,
  anterior.id_practica,
  anterior.id_institucion,
  anterior.periodo_academico,
  anterior.estado

FROM asignaciones_anteriores anterior

WHERE NOT EXISTS (

  SELECT 1

  FROM practices.asignacion_practica actual

  WHERE
    actual.id_estudiante =
      anterior.id_estudiante

    AND actual.id_practica =
      anterior.id_practica

    AND actual.periodo_academico =
      anterior.periodo_academico
);


-- ============================================================
-- 2. MIGRAR ACTIVIDADES EXISTENTES
--
-- Cada actividad existente actualmente pertenece a un grupo.
--
-- Creamos una actividad_estudiante para cada integrante que
-- pertenecía a ese grupo.
-- ============================================================

INSERT INTO activities.actividad_estudiante (
  id_actividad,
  id_estudiante,
  estado
)

SELECT DISTINCT
  a.id_actividad,
  ge.id_estudiante,
  'PENDIENTE'

FROM activities.actividad a

INNER JOIN practices.grupo_estudiante ge
  ON ge.id_grupo = a.id_grupo

ON CONFLICT (
  id_actividad,
  id_estudiante
)
DO NOTHING;


COMMIT;


-- ============================================================
-- 3. COMPROBACIONES
-- ============================================================

SELECT
  id_asignacion,
  id_estudiante,
  id_practica,
  id_institucion,
  id_tutor,
  periodo_academico,
  estado
FROM practices.asignacion_practica
ORDER BY id_asignacion;


SELECT
  id_actividad_estudiante,
  id_actividad,
  id_estudiante,
  estado,
  asignado_en
FROM activities.actividad_estudiante
ORDER BY
  id_actividad,
  id_estudiante;
