q-- ================================================================
-- REESTRUCTURA COMPLETA DE SEGURIDAD — CHARLY TÁCTICO INTRANET
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ================================================================
-- ROLES DEL SISTEMA:
--   dueno      → acceso total a todo
--   admin      → gestión académica completa
--   instructor → igual a admin (toma asistencia, notas)
--   profesor   → gestiona sus materias asignadas
--   alumno     → ve sus propios datos (no toma asistencia)
--   padre      → ve datos de su hijo vinculado
-- ================================================================


-- ----------------------------------------------------------------
-- PASO 1: ELIMINAR TABLA REDUNDANTE
-- alumno_aula no se usa: la academia no asigna aulas fijas
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS alumno_aula CASCADE;


-- ================================================================
-- HELPER: función para verificar si el usuario es admin
-- Reutilizada en múltiples políticas (se ejecuta 1 vez por query)
-- ================================================================
CREATE OR REPLACE FUNCTION es_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'instructor', 'dueno')
  )
$$;


-- ================================================================
-- PASO 2: PERFILES
-- anon puede buscar padre/profesor por DNI (para login)
-- Cada usuario ve/edita su propio perfil
-- Admin ve y gestiona todos
-- ================================================================
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfiles_anon_login"       ON perfiles;
DROP POLICY IF EXISTS "perfiles_own_select"        ON perfiles;
DROP POLICY IF EXISTS "perfiles_own_update"        ON perfiles;
DROP POLICY IF EXISTS "perfiles_admin_all"         ON perfiles;

-- anon: solo puede leer perfiles de padre y profesor (para login por DNI)
CREATE POLICY "perfiles_anon_login" ON perfiles
  FOR SELECT TO anon
  USING (rol IN ('padre', 'profesor'));

-- usuario autenticado: ve su propio perfil
CREATE POLICY "perfiles_own_select" ON perfiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- usuario autenticado: edita su propio perfil (foto, teléfono)
CREATE POLICY "perfiles_own_update" ON perfiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- admin/instructor/dueno: control total
CREATE POLICY "perfiles_admin_all" ON perfiles
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 3: ALUMNOS
-- Alumno ve su propio registro
-- Padre ve los hijos vinculados
-- Admin gestiona todos
-- IMPORTANTE: alumno NO puede insertar asistencias (solo admin)
-- ================================================================
ALTER TABLE alumnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumnos_own_select"    ON alumnos;
DROP POLICY IF EXISTS "alumnos_padre_select"  ON alumnos;
DROP POLICY IF EXISTS "alumnos_admin_all"     ON alumnos;

CREATE POLICY "alumnos_own_select" ON alumnos
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid());

CREATE POLICY "alumnos_padre_select" ON alumnos
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT alumno_id FROM padres_alumnos
      WHERE padre_id = auth.uid()
    )
  );

CREATE POLICY "alumnos_admin_all" ON alumnos
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 4: PROFESORES
-- Profesor ve/edita su propio registro
-- Admin gestiona todos
-- ================================================================
ALTER TABLE profesores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profesores_own_select"  ON profesores;
DROP POLICY IF EXISTS "profesores_admin_all"   ON profesores;

CREATE POLICY "profesores_own_select" ON profesores
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid());

CREATE POLICY "profesores_admin_all" ON profesores
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 5: MATERIAS, AULAS, HORARIOS
-- Todos los autenticados pueden leer (para mostrar horarios, listas)
-- Solo admin gestiona
-- ================================================================
ALTER TABLE materias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "materias_auth_select"  ON materias;
DROP POLICY IF EXISTS "materias_admin_all"    ON materias;

CREATE POLICY "materias_auth_select" ON materias
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "materias_admin_all" ON materias
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE aulas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aulas_auth_select"  ON aulas;
DROP POLICY IF EXISTS "aulas_admin_all"    ON aulas;

CREATE POLICY "aulas_auth_select" ON aulas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "aulas_admin_all" ON aulas
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
-- NOTA: La tabla 'horarios' se agrega condicionalmente si existe
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='horarios') THEN
    EXECUTE 'ALTER TABLE horarios ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "horarios_auth_select" ON horarios';
    EXECUTE 'DROP POLICY IF EXISTS "horarios_admin_all"   ON horarios';
    EXECUTE 'CREATE POLICY "horarios_auth_select" ON horarios FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "horarios_admin_all"   ON horarios FOR ALL    TO authenticated USING (es_admin())';
  END IF;
END $$;

-- ----
ALTER TABLE horario_semanal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "horario_semanal_auth_select"  ON horario_semanal;
DROP POLICY IF EXISTS "horario_semanal_admin_all"    ON horario_semanal;

CREATE POLICY "horario_semanal_auth_select" ON horario_semanal
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "horario_semanal_admin_all" ON horario_semanal
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE horario_plantilla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "horario_plantilla_auth_select"  ON horario_plantilla;
DROP POLICY IF EXISTS "horario_plantilla_admin_all"    ON horario_plantilla;

CREATE POLICY "horario_plantilla_auth_select" ON horario_plantilla
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "horario_plantilla_admin_all" ON horario_plantilla
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE materia_profesor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "materia_profesor_auth_select"  ON materia_profesor;
DROP POLICY IF EXISTS "materia_profesor_admin_all"    ON materia_profesor;

CREATE POLICY "materia_profesor_auth_select" ON materia_profesor
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "materia_profesor_admin_all" ON materia_profesor
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE alumno_materia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumno_materia_alumno_select"  ON alumno_materia;
DROP POLICY IF EXISTS "alumno_materia_padre_select"   ON alumno_materia;
DROP POLICY IF EXISTS "alumno_materia_admin_all"      ON alumno_materia;

CREATE POLICY "alumno_materia_alumno_select" ON alumno_materia
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE perfil_id = auth.uid())
  );

CREATE POLICY "alumno_materia_padre_select" ON alumno_materia
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT alumno_id FROM padres_alumnos WHERE padre_id = auth.uid()
    )
  );

CREATE POLICY "alumno_materia_admin_all" ON alumno_materia
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 6: ASISTENCIAS
-- Solo admin/instructor/dueno puede REGISTRAR asistencias
-- Alumno y padre solo pueden VER
-- ================================================================
ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asistencias_alumno_select"  ON asistencias;
DROP POLICY IF EXISTS "asistencias_padre_select"   ON asistencias;
DROP POLICY IF EXISTS "asistencias_admin_all"      ON asistencias;

-- Alumno: solo lee sus propias asistencias
CREATE POLICY "asistencias_alumno_select" ON asistencias
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE perfil_id = auth.uid())
  );

-- Padre: solo lee las asistencias de su hijo
CREATE POLICY "asistencias_padre_select" ON asistencias
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT alumno_id FROM padres_alumnos WHERE padre_id = auth.uid()
    )
  );

-- Admin: control total (registrar, editar, eliminar)
CREATE POLICY "asistencias_admin_all" ON asistencias
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE asistencias_profesores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asist_prof_own"       ON asistencias_profesores;
DROP POLICY IF EXISTS "asist_prof_admin_all" ON asistencias_profesores;

-- Profesor: gestiona sus propias asistencias
CREATE POLICY "asist_prof_own" ON asistencias_profesores
  FOR ALL TO authenticated
  USING (
    profesor_id IN (SELECT id FROM profesores WHERE perfil_id = auth.uid())
  );

CREATE POLICY "asist_prof_admin_all" ON asistencias_profesores
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE sesiones_asistencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sesiones_asistencia_admin_all" ON sesiones_asistencia;

CREATE POLICY "sesiones_asistencia_admin_all" ON sesiones_asistencia
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 7: NOTAS
-- Alumno y padre: solo leen
-- Profesor: lee y escribe SOLO sus materias asignadas
-- Admin/dueno: control total
-- ================================================================
ALTER TABLE notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notas_alumno_select"    ON notas;
DROP POLICY IF EXISTS "notas_padre_select"     ON notas;
DROP POLICY IF EXISTS "notas_profesor_write"   ON notas;
DROP POLICY IF EXISTS "notas_profesor_select"  ON notas;
DROP POLICY IF EXISTS "notas_admin_all"        ON notas;

CREATE POLICY "notas_alumno_select" ON notas
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE perfil_id = auth.uid())
  );

CREATE POLICY "notas_padre_select" ON notas
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT alumno_id FROM padres_alumnos WHERE padre_id = auth.uid()
    )
  );

-- Profesor: puede leer y escribir notas solo de sus materias
CREATE POLICY "notas_profesor_select" ON notas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'profesor'
    )
    AND materia_id IN (
      SELECT mp.materia_id FROM materia_profesor mp
      JOIN profesores pr ON pr.id = mp.profesor_id
      WHERE pr.perfil_id = auth.uid()
    )
  );

CREATE POLICY "notas_profesor_write" ON notas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'profesor'
    )
    AND materia_id IN (
      SELECT mp.materia_id FROM materia_profesor mp
      JOIN profesores pr ON pr.id = mp.profesor_id
      WHERE pr.perfil_id = auth.uid()
    )
  );

-- Nota: usamos política separada para UPDATE del profesor
DROP POLICY IF EXISTS "notas_profesor_update" ON notas;
CREATE POLICY "notas_profesor_update" ON notas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'profesor'
    )
    AND materia_id IN (
      SELECT mp.materia_id FROM materia_profesor mp
      JOIN profesores pr ON pr.id = mp.profesor_id
      WHERE pr.perfil_id = auth.uid()
    )
  );

CREATE POLICY "notas_admin_all" ON notas
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 8: PRÁCTICAS Y SOLUCIONES
-- Prácticas: todos autenticados ven, profesor escribe sus materias
-- Soluciones: alumno gestiona las suyas, profesor/admin ven
-- ================================================================
ALTER TABLE practicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practicas_auth_select"    ON practicas;
DROP POLICY IF EXISTS "practicas_profesor_write" ON practicas;
DROP POLICY IF EXISTS "practicas_admin_all"      ON practicas;

-- Todos los autenticados ven las prácticas
CREATE POLICY "practicas_auth_select" ON practicas
  FOR SELECT TO authenticated
  USING (true);

-- Profesor: gestiona prácticas solo de sus materias
CREATE POLICY "practicas_profesor_write" ON practicas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'profesor'
    )
    AND materia_id IN (
      SELECT mp.materia_id FROM materia_profesor mp
      JOIN profesores pr ON pr.id = mp.profesor_id
      WHERE pr.perfil_id = auth.uid()
    )
  );

CREATE POLICY "practicas_admin_all" ON practicas
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE soluciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "soluciones_alumno_own"        ON soluciones;
DROP POLICY IF EXISTS "soluciones_profesor_select"   ON soluciones;
DROP POLICY IF EXISTS "soluciones_admin_all"         ON soluciones;

-- Alumno: gestiona sus propias soluciones
CREATE POLICY "soluciones_alumno_own" ON soluciones
  FOR ALL TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE perfil_id = auth.uid())
  );

-- Profesor: ve soluciones de prácticas de sus materias
CREATE POLICY "soluciones_profesor_select" ON soluciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'profesor'
    )
    AND practica_id IN (
      SELECT p.id FROM practicas p
      JOIN materia_profesor mp ON mp.materia_id = p.materia_id
      JOIN profesores pr ON pr.id = mp.profesor_id
      WHERE pr.perfil_id = auth.uid()
    )
  );

CREATE POLICY "soluciones_admin_all" ON soluciones
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 9: NOTIFICACIONES
-- Todos ven las suyas + globales
-- Todos autenticados pueden insertar (notificaciones de sistema)
-- Solo admin puede actualizar/eliminar
-- ================================================================
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificaciones_auth_select"  ON notificaciones;
DROP POLICY IF EXISTS "notificaciones_auth_insert"  ON notificaciones;
DROP POLICY IF EXISTS "notificaciones_admin_all"    ON notificaciones;

CREATE POLICY "notificaciones_auth_select" ON notificaciones
  FOR SELECT TO authenticated
  USING (
    global = true
    OR destinatario_id = auth.uid()
  );

-- Todos autenticados pueden crear notificaciones (ej: alumno rechaza ubicación)
CREATE POLICY "notificaciones_auth_insert" ON notificaciones
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "notificaciones_admin_all" ON notificaciones
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE notificaciones_ocultas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificaciones_ocultas_own" ON notificaciones_ocultas;

CREATE POLICY "notificaciones_ocultas_own" ON notificaciones_ocultas
  FOR ALL TO authenticated
  USING (user_id = auth.uid());


-- ================================================================
-- PASO 10: PADRES Y MENSAJES
-- Padre: gestiona sus propios mensajes y relaciones
-- Admin: control total
-- ================================================================
ALTER TABLE padres_alumnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "padres_alumnos_padre_select"  ON padres_alumnos;
DROP POLICY IF EXISTS "padres_alumnos_admin_all"     ON padres_alumnos;

CREATE POLICY "padres_alumnos_padre_select" ON padres_alumnos
  FOR SELECT TO authenticated
  USING (padre_id = auth.uid());

CREATE POLICY "padres_alumnos_admin_all" ON padres_alumnos
  FOR ALL TO authenticated
  USING (es_admin());

-- ----
ALTER TABLE contacto_mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacto_padre_own"   ON contacto_mensajes;
DROP POLICY IF EXISTS "contacto_admin_all"   ON contacto_mensajes;

CREATE POLICY "contacto_padre_own" ON contacto_mensajes
  FOR ALL TO authenticated
  USING (padre_id = auth.uid());

CREATE POLICY "contacto_admin_all" ON contacto_mensajes
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 11: GESTIÓN DE CONTRASEÑAS
-- Cada usuario puede ver su propia contraseña (para recuperación)
-- Solo admin/dueno puede ver y gestionar todas
-- ================================================================
ALTER TABLE gestion_contrasenas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gestion_pass_own_select"  ON gestion_contrasenas;
DROP POLICY IF EXISTS "gestion_pass_admin_all"   ON gestion_contrasenas;

-- Usuario: solo ve su propia contraseña
CREATE POLICY "gestion_pass_own_select" ON gestion_contrasenas
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid());

-- Admin/dueno: control total (para recuperar contraseñas de alumnos)
CREATE POLICY "gestion_pass_admin_all" ON gestion_contrasenas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol IN ('admin', 'dueno')
    )
  );
-- NOTA: instructor NO tiene acceso a contraseñas (dato sensible)


-- ================================================================
-- PASO 12: CONFIGURACIÓN DE LA ACADEMIA
-- Todos autenticados leen
-- Solo dueno puede modificar
-- ================================================================
ALTER TABLE config_academia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_academia_select"  ON config_academia;
DROP POLICY IF EXISTS "config_academia_dueno"   ON config_academia;

CREATE POLICY "config_academia_select" ON config_academia
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "config_academia_dueno" ON config_academia
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'dueno'
    )
  );


-- ================================================================
-- PASO 13: FCM TOKENS (notificaciones push)
-- Cada usuario gestiona su propio token
-- Admin puede leer todos (para enviar push a cualquiera)
-- ================================================================
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcm_tokens_own"          ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_admin_select" ON fcm_tokens;

CREATE POLICY "fcm_tokens_own" ON fcm_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "fcm_tokens_admin_select" ON fcm_tokens
  FOR SELECT TO authenticated
  USING (es_admin());


-- ================================================================
-- PASO 14: SOLICITUDES DE UBICACIÓN
-- Padre: inserta y ve las suyas
-- Alumno: ve y actualiza las que le corresponden
-- Admin: control total
-- ================================================================
ALTER TABLE solicitudes_ubicacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solicit_ubic_padre_own"    ON solicitudes_ubicacion;
DROP POLICY IF EXISTS "solicit_ubic_alumno_update" ON solicitudes_ubicacion;
DROP POLICY IF EXISTS "solicit_ubic_admin_all"    ON solicitudes_ubicacion;

-- Padre: gestiona sus propias solicitudes
CREATE POLICY "solicit_ubic_padre_own" ON solicitudes_ubicacion
  FOR ALL TO authenticated
  USING (padre_id = auth.uid());

-- Alumno: ve y responde solicitudes dirigidas a él
CREATE POLICY "solicit_ubic_alumno_select" ON solicitudes_ubicacion
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE perfil_id = auth.uid())
  );

CREATE POLICY "solicit_ubic_alumno_update" ON solicitudes_ubicacion
  FOR UPDATE TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE perfil_id = auth.uid())
  );

CREATE POLICY "solicit_ubic_admin_all" ON solicitudes_ubicacion
  FOR ALL TO authenticated
  USING (es_admin());


-- ================================================================
-- FIN
-- ================================================================
-- Verificar que todas las tablas tienen RLS habilitado:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
-- ================================================================
