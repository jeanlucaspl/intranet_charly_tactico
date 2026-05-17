-- ================================================================
-- BANCO DE PREGUNTAS — CHARLY TÁCTICO
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ================================================================

-- Tabla principal
CREATE TABLE IF NOT EXISTS banco_preguntas (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  materia_id       uuid REFERENCES materias(id) ON DELETE SET NULL,
  subtema          text DEFAULT '',
  tipo             text NOT NULL DEFAULT 'simple' CHECK (tipo IN ('simple','texto_base')),
  enunciado_texto  text DEFAULT '',
  enunciado_imagen_url text,
  enunciado_post   text DEFAULT '',
  creado_en        timestamptz DEFAULT now(),
  creado_por       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Sub-items: sub-preguntas dentro de un texto_base (RV)
CREATE TABLE IF NOT EXISTS banco_subitems (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pregunta_id uuid NOT NULL REFERENCES banco_preguntas(id) ON DELETE CASCADE,
  orden       int  NOT NULL DEFAULT 0,
  texto       text DEFAULT '',
  imagen_url  text
);

-- Alternativas: pertenecen a una pregunta simple O a un subitem
-- Exactamente uno de pregunta_id / subitem_id debe ser NOT NULL
CREATE TABLE IF NOT EXISTS banco_alternativas (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pregunta_id uuid REFERENCES banco_preguntas(id) ON DELETE CASCADE,
  subitem_id  uuid REFERENCES banco_subitems(id)  ON DELETE CASCADE,
  orden       int  NOT NULL DEFAULT 0,   -- 0=A, 1=B, 2=C, 3=D, 4=E
  texto       text DEFAULT '',
  imagen_url  text,
  CONSTRAINT chk_alt_parent CHECK (
    (pregunta_id IS NOT NULL AND subitem_id IS NULL) OR
    (pregunta_id IS NULL     AND subitem_id IS NOT NULL)
  )
);

-- Soluciones: pertenecen a una pregunta simple O a un subitem
CREATE TABLE IF NOT EXISTS banco_soluciones (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pregunta_id          uuid REFERENCES banco_preguntas(id) ON DELETE CASCADE,
  subitem_id           uuid REFERENCES banco_subitems(id)  ON DELETE CASCADE,
  tipo                 text NOT NULL DEFAULT 'alternativa' CHECK (tipo IN ('alternativa','desarrollo')),
  alternativa_correcta int,                  -- índice 0-4 (A=0…E=4)
  desarrollo_texto     text DEFAULT '',       -- LaTeX, texto matemático
  desarrollo_imagen_url text,
  CONSTRAINT chk_sol_parent CHECK (
    (pregunta_id IS NOT NULL AND subitem_id IS NULL) OR
    (pregunta_id IS NULL     AND subitem_id IS NOT NULL)
  )
);

-- ── ÍNDICES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bp_materia   ON banco_preguntas(materia_id);
CREATE INDEX IF NOT EXISTS idx_bp_subtema   ON banco_preguntas(subtema);
CREATE INDEX IF NOT EXISTS idx_bp_tipo      ON banco_preguntas(tipo);
CREATE INDEX IF NOT EXISTS idx_bs_pregunta  ON banco_subitems(pregunta_id, orden);
CREATE INDEX IF NOT EXISTS idx_ba_pregunta  ON banco_alternativas(pregunta_id, orden);
CREATE INDEX IF NOT EXISTS idx_ba_subitem   ON banco_alternativas(subitem_id, orden);
CREATE INDEX IF NOT EXISTS idx_bsol_preg    ON banco_soluciones(pregunta_id);
CREATE INDEX IF NOT EXISTS idx_bsol_sub     ON banco_soluciones(subitem_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE banco_preguntas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE banco_subitems    ENABLE ROW LEVEL SECURITY;
ALTER TABLE banco_alternativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE banco_soluciones  ENABLE ROW LEVEL SECURITY;

-- banco_preguntas
DROP POLICY IF EXISTS "bp_auth_read"   ON banco_preguntas;
DROP POLICY IF EXISTS "bp_admin_write" ON banco_preguntas;
CREATE POLICY "bp_auth_read"   ON banco_preguntas FOR SELECT TO authenticated USING (true);
CREATE POLICY "bp_admin_write" ON banco_preguntas FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- banco_subitems
DROP POLICY IF EXISTS "bs_auth_read"   ON banco_subitems;
DROP POLICY IF EXISTS "bs_admin_write" ON banco_subitems;
CREATE POLICY "bs_auth_read"   ON banco_subitems FOR SELECT TO authenticated USING (true);
CREATE POLICY "bs_admin_write" ON banco_subitems FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- banco_alternativas
DROP POLICY IF EXISTS "ba_auth_read"   ON banco_alternativas;
DROP POLICY IF EXISTS "ba_admin_write" ON banco_alternativas;
CREATE POLICY "ba_auth_read"   ON banco_alternativas FOR SELECT TO authenticated USING (true);
CREATE POLICY "ba_admin_write" ON banco_alternativas FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- banco_soluciones
DROP POLICY IF EXISTS "bsol_auth_read"   ON banco_soluciones;
DROP POLICY IF EXISTS "bsol_admin_write" ON banco_soluciones;
CREATE POLICY "bsol_auth_read"   ON banco_soluciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "bsol_admin_write" ON banco_soluciones FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- ── STORAGE ──────────────────────────────────────────────────────
-- Crear bucket manualmente en Supabase Dashboard → Storage → New Bucket:
--   Name: banco-preguntas
--   Public: SÍ (para que las imágenes sean accesibles sin token)
-- Política sugerida (Storage → banco-preguntas → Policies):
--   SELECT: bucket_id = 'banco-preguntas'  (público)
--   INSERT: bucket_id = 'banco-preguntas' AND auth.role() = 'authenticated'
--   DELETE: bucket_id = 'banco-preguntas' AND auth.role() = 'authenticated'
