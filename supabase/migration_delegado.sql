-- migration_delegado.sql
-- Agrega el rol 'delegado': acceso de solo lectura + tomar asistencia.
-- Sin acceso a ingresos, pagos, datos sensibles de la academia.

-- ── Agregar 'delegado' al ENUM rol_usuario ────────────────────────────────────
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'delegado';

-- ── Helper ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION es_delegado()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid() AND rol::text = 'delegado'
  );
$$;

-- ── perfiles: el delegado puede leer solo su propio perfil ────────────────────
-- (ya cubierto por la policy "perfiles_own_select" existente, no necesita cambios)

-- ── alumnos: SELECT para poder mostrar la lista en el panel facial ─────────────
DROP POLICY IF EXISTS "alumnos_delegado_select" ON alumnos;
CREATE POLICY "alumnos_delegado_select" ON alumnos
  FOR SELECT TO authenticated
  USING (es_delegado());

-- ── materias: SELECT para armar el selector de materia ───────────────────────
DROP POLICY IF EXISTS "materias_delegado_select" ON materias;
CREATE POLICY "materias_delegado_select" ON materias
  FOR SELECT TO authenticated
  USING (es_delegado());

-- ── aulas: SELECT para armar el selector de aula ─────────────────────────────
DROP POLICY IF EXISTS "aulas_delegado_select" ON aulas;
CREATE POLICY "aulas_delegado_select" ON aulas
  FOR SELECT TO authenticated
  USING (es_delegado());

-- ── sesiones_asistencia: SELECT + INSERT + UPDATE (abrir/cerrar sesión) ───────
DROP POLICY IF EXISTS "sesiones_delegado_select" ON sesiones_asistencia;
CREATE POLICY "sesiones_delegado_select" ON sesiones_asistencia
  FOR SELECT TO authenticated
  USING (es_delegado());

DROP POLICY IF EXISTS "sesiones_delegado_insert" ON sesiones_asistencia;
CREATE POLICY "sesiones_delegado_insert" ON sesiones_asistencia
  FOR INSERT TO authenticated
  WITH CHECK (es_delegado());

DROP POLICY IF EXISTS "sesiones_delegado_update" ON sesiones_asistencia;
CREATE POLICY "sesiones_delegado_update" ON sesiones_asistencia
  FOR UPDATE TO authenticated
  USING (es_delegado());

-- ── asistencias: SELECT + INSERT + UPDATE (registrar y ver histórico) ──────────
DROP POLICY IF EXISTS "asistencias_delegado_select" ON asistencias;
CREATE POLICY "asistencias_delegado_select" ON asistencias
  FOR SELECT TO authenticated
  USING (es_delegado());

DROP POLICY IF EXISTS "asistencias_delegado_insert" ON asistencias;
CREATE POLICY "asistencias_delegado_insert" ON asistencias
  FOR INSERT TO authenticated
  WITH CHECK (es_delegado());

DROP POLICY IF EXISTS "asistencias_delegado_update" ON asistencias;
CREATE POLICY "asistencias_delegado_update" ON asistencias
  FOR UPDATE TO authenticated
  USING (es_delegado());

-- ── bloques_asistencia: SELECT + INSERT + UPDATE ──────────────────────────────
DROP POLICY IF EXISTS "bloques_delegado_select" ON bloques_asistencia;
CREATE POLICY "bloques_delegado_select" ON bloques_asistencia
  FOR SELECT TO authenticated
  USING (es_delegado());

DROP POLICY IF EXISTS "bloques_delegado_insert" ON bloques_asistencia;
CREATE POLICY "bloques_delegado_insert" ON bloques_asistencia
  FOR INSERT TO authenticated
  WITH CHECK (es_delegado());

DROP POLICY IF EXISTS "bloques_delegado_update" ON bloques_asistencia;
CREATE POLICY "bloques_delegado_update" ON bloques_asistencia
  FOR UPDATE TO authenticated
  USING (es_delegado());
