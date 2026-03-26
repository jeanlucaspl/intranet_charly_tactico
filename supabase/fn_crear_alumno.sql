-- Función atómica para crear perfil + alumno en una sola transacción.
-- Si cualquier INSERT falla, todo se revierte automáticamente.
-- Se llama desde el cliente con: sb.rpc('crear_perfil_alumno', { ... })

CREATE OR REPLACE FUNCTION crear_perfil_alumno(
  p_uid            UUID,
  p_nombre         TEXT,
  p_apellido       TEXT,
  p_dni            TEXT,
  p_email          TEXT,
  p_telefono       TEXT DEFAULT NULL,
  p_telefono2      TEXT DEFAULT NULL,
  p_sexo           TEXT DEFAULT NULL,
  p_peso           NUMERIC DEFAULT NULL,
  p_talla          NUMERIC DEFAULT NULL,
  p_fecha_nac      DATE DEFAULT NULL,
  p_direccion      TEXT DEFAULT NULL,
  p_talla_uniforme TEXT DEFAULT NULL,
  p_escuela        TEXT DEFAULT NULL,
  p_pass           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id UUID;
BEGIN
  -- Verificar que el llamador es admin o dueno
  IF NOT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid() AND rol IN ('admin','dueno')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para crear alumnos';
  END IF;

  -- Insertar perfil (idempotente: si ya existe con mismo id, no falla)
  INSERT INTO perfiles (id, nombre, apellido, dni, rol, email_ref, telefono, telefono2)
  VALUES (p_uid, p_nombre, p_apellido, p_dni, 'alumno', p_email, p_telefono, p_telefono2)
  ON CONFLICT (id) DO NOTHING;

  -- Insertar alumno (idempotente)
  INSERT INTO alumnos (perfil_id, activo, sexo, peso, talla,
                       fecha_nacimiento, direccion, talla_uniforme, escuela)
  VALUES (p_uid, true, p_sexo, p_peso, p_talla,
          p_fecha_nac, p_direccion, p_talla_uniforme, p_escuela)
  ON CONFLICT (perfil_id) DO NOTHING
  RETURNING id INTO v_alumno_id;

  -- Si ya existía el alumno, obtener su id
  IF v_alumno_id IS NULL THEN
    SELECT id INTO v_alumno_id FROM alumnos WHERE perfil_id = p_uid;
  END IF;

  -- Guardar contraseña si se proporcionó
  IF p_pass IS NOT NULL THEN
    INSERT INTO gestion_contrasenas (perfil_id, contrasena_actual)
    VALUES (p_uid, p_pass)
    ON CONFLICT (perfil_id) DO UPDATE SET contrasena_actual = p_pass, actualizado_en = NOW();
  END IF;

  RETURN v_alumno_id;
END;
$$;
