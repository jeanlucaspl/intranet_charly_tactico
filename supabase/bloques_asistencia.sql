-- ══════════════════════════════════════════════════════
-- BLOQUES DE ASISTENCIA
-- Cada bloque = una clase (materia+aula+día+franja horaria)
-- Un bloque tiene entrada Y/O salida registradas.
-- El mismo curso puede tener 2 bloques en un día
-- si hay más de 2 horas entre sesiones.
-- ══════════════════════════════════════════════════════

-- 1. Nueva tabla bloques_asistencia
CREATE TABLE IF NOT EXISTS bloques_asistencia (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id    UUID    REFERENCES materias(id) ON DELETE CASCADE,
  aula_id       UUID    REFERENCES aulas(id)    ON DELETE CASCADE,
  fecha         DATE    NOT NULL DEFAULT CURRENT_DATE,
  hora_apertura TIME    NOT NULL,
  hora_cierre   TIME,
  cerrado       BOOLEAN NOT NULL DEFAULT false,
  creado_por    UUID    REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE bloques_asistencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bloques_admin_all"     ON bloques_asistencia;
DROP POLICY IF EXISTS "bloques_auth_select"   ON bloques_asistencia;

-- Admin/instructor/dueño: control total
CREATE POLICY "bloques_admin_all" ON bloques_asistencia
  FOR ALL TO authenticated
  USING (es_admin())
  WITH CHECK (es_admin());

-- Alumno y padre: solo lectura (para el dashboard)
CREATE POLICY "bloques_auth_select" ON bloques_asistencia
  FOR SELECT TO authenticated
  USING (true);

-- 2. Agregar columnas a asistencias existente
ALTER TABLE asistencias
  ADD COLUMN IF NOT EXISTS bloque_id UUID REFERENCES bloques_asistencia(id),
  ADD COLUMN IF NOT EXISTS tipo      TEXT DEFAULT 'entrada'
    CHECK (tipo IN ('entrada','salida'));

-- 3. Quitar el unique antiguo (alumno_id, fecha, materia_id)
--    y reemplazar por (alumno_id, bloque_id, tipo) para nuevos registros
ALTER TABLE asistencias
  DROP CONSTRAINT IF EXISTS asistencias_alumno_id_fecha_materia_id_key;

-- Constraint único completo (ON CONFLICT no funciona con índices parciales).
-- NULL != NULL en PostgreSQL → múltiples filas con bloque_id NULL no colisionan,
-- por lo que los registros legacy sin bloque_id quedan intactos.
DROP INDEX IF EXISTS asistencias_alumno_bloque_tipo_idx;
ALTER TABLE asistencias
  DROP CONSTRAINT IF EXISTS asistencias_alumno_bloque_tipo_key;
ALTER TABLE asistencias
  ADD CONSTRAINT asistencias_alumno_bloque_tipo_key
  UNIQUE (alumno_id, bloque_id, tipo);
