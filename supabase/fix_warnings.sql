-- ================================================================
-- FIX WARNINGS — CHARLY TÁCTICO INTRANET
-- Ejecutar en Supabase Dashboard → SQL Editor
-- DESPUÉS de haber ejecutado fix_rls.sql
-- ================================================================


-- ----------------------------------------------------------------
-- 1. FUNCTION SEARCH PATH MUTABLE (4 funciones)
--    Riesgo: un atacante podría crear un esquema malicioso y
--    redirigir los lookups de tablas si search_path no está fijo.
--    Solución: fijar search_path = public en todas las funciones.
-- ----------------------------------------------------------------

-- Nuestra función es_admin (recrear con search_path fijo)
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'instructor', 'dueno')
  )
$$;

-- Funciones pre-existentes: fijar search_path sin cambiar el cuerpo
ALTER FUNCTION public.check_rol_profesor() SET search_path = public;
ALTER FUNCTION public.check_rol_alumno()   SET search_path = public;
ALTER FUNCTION public.check_rol_padre()    SET search_path = public;


-- ----------------------------------------------------------------
-- 2. RLS POLICY ALWAYS TRUE — tabla notas
--    La política pre-existente "profesor_upsert_notas" tiene
--    USING (true) + WITH CHECK (true) → acceso irrestricto.
--    Ya tenemos políticas correctas en fix_rls.sql, la eliminamos.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "profesor_upsert_notas" ON notas;


-- ----------------------------------------------------------------
-- 3. RLS POLICY ALWAYS TRUE — tabla notificaciones
--    "notificaciones_auth_insert" tiene WITH CHECK (true).
--    Restricción: cualquier autenticado puede insertar, pero
--    solo admin/dueno puede crear notificaciones globales.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "notificaciones_auth_insert" ON notificaciones;

CREATE POLICY "notificaciones_auth_insert" ON notificaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Notificaciones dirigidas a alguien: cualquier autenticado puede crear
    -- Notificaciones globales: solo admin/dueno
    (global = false AND destinatario_id IS NOT NULL)
    OR es_admin()
  );


-- ================================================================
-- 4. LEAKED PASSWORD PROTECTION (no es SQL)
--    Activar en: Supabase Dashboard → Authentication →
--    Sign In / Up → Password Protection → Enable "Leaked password protection"
-- ================================================================
