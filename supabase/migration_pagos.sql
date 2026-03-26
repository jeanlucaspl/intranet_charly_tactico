-- ============================================================
-- Migración: Tabla de pagos de alumnos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS pagos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id      UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  monto          NUMERIC(10,2) NOT NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  concepto       TEXT NOT NULL DEFAULT 'Inscripción',
  metodo_pago    TEXT NOT NULL DEFAULT 'Efectivo',
  notas          TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  creado_en      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

-- Admin/dueno/instructor: acceso total
CREATE POLICY "pagos_admin_all" ON pagos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
      AND rol IN ('admin','dueno','instructor')
    )
  );

-- Alumno: puede ver sus propios pagos
CREATE POLICY "pagos_alumno_select" ON pagos
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT id FROM alumnos WHERE perfil_id = auth.uid()
    )
  );

-- Padre: puede ver pagos de sus hijos
CREATE POLICY "pagos_padre_select" ON pagos
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT alumno_id FROM padres_alumnos
      WHERE padre_id IN (
        SELECT id FROM alumnos WHERE perfil_id = auth.uid()
      )
    )
  );

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pagos'
ORDER BY ordinal_position;
