-- ============================================================
-- Funciones atómicas para crear admin, padre y profesor
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── ADMIN / INSTRUCTOR / DUENO ───────────────────────────────
CREATE OR REPLACE FUNCTION crear_perfil_admin(
  p_uid      UUID,
  p_nombre   TEXT,
  p_apellido TEXT,
  p_dni      TEXT,
  p_email    TEXT,
  p_rol      TEXT,
  p_pass     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','dueno')
  ) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  INSERT INTO perfiles (id, nombre, apellido, dni, rol, email_ref)
  VALUES (p_uid, p_nombre, p_apellido, p_dni, p_rol, p_email)
  ON CONFLICT (id) DO NOTHING;

  IF p_pass IS NOT NULL THEN
    INSERT INTO gestion_contrasenas (perfil_id, contrasena_actual)
    VALUES (p_uid, p_pass)
    ON CONFLICT (perfil_id) DO UPDATE SET contrasena_actual = p_pass, actualizado_en = NOW();
  END IF;
END;
$$;

-- ── PADRE ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crear_perfil_padre(
  p_uid        UUID,
  p_nombre     TEXT,
  p_apellido   TEXT,
  p_dni        TEXT,
  p_email      TEXT,
  p_telefono   TEXT DEFAULT NULL,
  p_pass       TEXT DEFAULT NULL,
  p_alumno_id  UUID DEFAULT NULL,
  p_parentesco TEXT DEFAULT 'padre'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','dueno')
  ) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  INSERT INTO perfiles (id, nombre, apellido, dni, rol, email_ref, telefono)
  VALUES (p_uid, p_nombre, p_apellido, p_dni, 'padre', p_email, p_telefono)
  ON CONFLICT (id) DO NOTHING;

  IF p_alumno_id IS NOT NULL THEN
    INSERT INTO padres_alumnos (padre_id, alumno_id, parentesco)
    VALUES (p_uid, p_alumno_id, p_parentesco)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_pass IS NOT NULL THEN
    INSERT INTO gestion_contrasenas (perfil_id, contrasena_actual)
    VALUES (p_uid, p_pass)
    ON CONFLICT (perfil_id) DO UPDATE SET contrasena_actual = p_pass, actualizado_en = NOW();
  END IF;
END;
$$;

-- ── PROFESOR ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crear_perfil_profesor(
  p_uid       UUID,
  p_nombre    TEXT,
  p_apellido  TEXT,
  p_dni       TEXT,
  p_email     TEXT,
  p_telefono  TEXT DEFAULT NULL,
  p_pass      TEXT DEFAULT NULL,
  p_materia_id UUID DEFAULT NULL,
  p_foto_url  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profesor_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','dueno')
  ) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  INSERT INTO perfiles (id, nombre, apellido, dni, rol, email_ref, telefono)
  VALUES (p_uid, p_nombre, p_apellido, p_dni, 'profesor', p_email, p_telefono)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profesores (perfil_id, activo, foto_url)
  VALUES (p_uid, true, p_foto_url)
  ON CONFLICT (perfil_id) DO NOTHING
  RETURNING id INTO v_profesor_id;

  IF v_profesor_id IS NULL THEN
    SELECT id INTO v_profesor_id FROM profesores WHERE perfil_id = p_uid;
  END IF;

  IF p_materia_id IS NOT NULL AND v_profesor_id IS NOT NULL THEN
    INSERT INTO materia_profesor (materia_id, profesor_id)
    VALUES (p_materia_id, v_profesor_id)
    ON CONFLICT (materia_id, profesor_id) DO NOTHING;
  END IF;

  IF p_pass IS NOT NULL THEN
    INSERT INTO gestion_contrasenas (perfil_id, contrasena_actual)
    VALUES (p_uid, p_pass)
    ON CONFLICT (perfil_id) DO UPDATE SET contrasena_actual = p_pass, actualizado_en = NOW();
  END IF;

  RETURN v_profesor_id;
END;
$$;
