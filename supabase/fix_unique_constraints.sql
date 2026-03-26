-- ============================================================
-- Agrega constraints UNIQUE faltantes requeridas por ON CONFLICT
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- alumnos.perfil_id debe ser único (un perfil = un alumno)
ALTER TABLE alumnos
  ADD CONSTRAINT alumnos_perfil_id_key UNIQUE (perfil_id);

-- profesores.perfil_id debe ser único (un perfil = un profesor)
ALTER TABLE profesores
  ADD CONSTRAINT profesores_perfil_id_key UNIQUE (perfil_id);

-- gestion_contrasenas.perfil_id ya debería tenerla, pero por las dudas:
ALTER TABLE gestion_contrasenas
  ADD CONSTRAINT gestion_contrasenas_perfil_id_key UNIQUE (perfil_id);

-- Verificar que quedaron aplicadas:
SELECT tc.table_name, kcu.column_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name IN ('alumnos','profesores','gestion_contrasenas')
  AND tc.constraint_type IN ('UNIQUE','PRIMARY KEY')
ORDER BY tc.table_name, kcu.column_name;
