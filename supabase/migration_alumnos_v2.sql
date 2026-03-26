-- ============================================================
-- Migración v2: Nuevos campos alumno + segundo teléfono
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. PERFILES: segundo teléfono (aplica a alumnos y padres)
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS telefono2 TEXT;

-- 2. ALUMNOS: quitar seccion, agregar nuevos campos
ALTER TABLE alumnos
  DROP COLUMN IF EXISTS seccion;

ALTER TABLE alumnos
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS direccion       TEXT,
  ADD COLUMN IF NOT EXISTS talla_uniforme  TEXT,
  ADD COLUMN IF NOT EXISTS escuela         TEXT;

-- 3. Verificación final
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'alumnos'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'perfiles'
ORDER BY ordinal_position;
