-- ══════════════════════════════════════════════════
-- FIX COMPLETO DE PERMISOS
-- ══════════════════════════════════════════════════

-- 1. Permitir lectura pública a storage (sin autenticación)
-- Esto es necesario para que las fotos carguen correctamente
drop policy if exists "public_read" on storage.objects;
create policy "public_read" on storage.objects
  for select using (bucket_id in ('fotos-alumnos','practicas','notificaciones'));

-- 2. Permitir a admins subir/leer/borrar en todos los buckets
drop policy if exists "admin_upload_all" on storage.objects;
create policy "admin_upload_all" on storage.objects
  for all to authenticated
  using (es_admin())
  with check (es_admin());

-- 3. Alumnos pueden subir sus soluciones
drop policy if exists "alumno_upload_soluciones" on storage.objects;
create policy "alumno_upload_soluciones" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'soluciones' and
    exists(select 1 from alumnos where perfil_id = auth.uid())
  );

-- Alumnos pueden leer sus propias soluciones
drop policy if exists "alumno_read_soluciones" on storage.objects;
create policy "alumno_read_soluciones" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'soluciones' and
    (name like (auth.uid()::text || '%') or es_admin())
  );

-- 4. Padres pueden subir y leer sus mensajes
drop policy if exists "padre_upload_contacto" on storage.objects;
create policy "padre_upload_contacto" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contacto-padres' and
    exists(select 1 from perfiles where id = auth.uid() and rol = 'padre')
  );

drop policy if exists "padre_read_contacto" on storage.objects;
create policy "padre_read_contacto" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contacto-padres' and
    (es_admin() or name like (auth.uid()::text || '%'))
  );

-- 5. Fix RLS alumnos — asegurar que admin puede insertar
drop policy if exists "admin_alumnos_all" on alumnos;
create policy "admin_alumnos_all" on alumnos
  for all to authenticated
  using (es_admin())
  with check (es_admin());

-- 6. Alumno puede ver su propio registro
drop policy if exists "alumno_ve_propio" on alumnos;
create policy "alumno_ve_propio" on alumnos
  for select to authenticated
  using (perfil_id = auth.uid());

-- 7. Padre puede ver al alumno vinculado
drop policy if exists "padre_ve_hijo" on alumnos;
create policy "padre_ve_hijo" on alumnos
  for select to authenticated
  using (
    id in (
      select alumno_id from padres_alumnos where padre_id = auth.uid()
    )
  );

-- 8. Fix perfiles — admin puede insertar perfiles de otros usuarios
drop policy if exists "admin_perfiles_all" on perfiles;
create policy "admin_perfiles_all" on perfiles
  for all to authenticated
  using (es_admin())
  with check (es_admin());

drop policy if exists "user_perfiles_own" on perfiles;
create policy "user_perfiles_own" on perfiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 9. Verificar estado actual
select schemaname, tablename, count(*) as policies
from pg_policies
where schemaname in ('public','storage')
group by schemaname, tablename
order by schemaname, tablename;
