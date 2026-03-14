-- ══════════════════════════════════════════════════
-- PASO 2: Ejecutar DESPUÉS de que el enum 'dueno' esté committeado
-- (ejecutar en una nueva consulta separada)
-- ══════════════════════════════════════════════════

-- Actualizar función es_admin para incluir dueno
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select rol in ('admin','instructor','dueno')
     from public.perfiles
     where id = auth.uid()
     limit 1),
    false
  );
$$;

-- Agregar columna email_ref si no existe
alter table perfiles add column if not exists email_ref text;

-- Crear tabla gestion_contrasenas
create table if not exists gestion_contrasenas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfiles(id) on delete cascade unique,
  contrasena_actual text not null,
  notas text,
  actualizado_en timestamptz default now()
);

alter table gestion_contrasenas enable row level security;

drop policy if exists "dueno_contrasenas_all"     on gestion_contrasenas;
drop policy if exists "admin_ve_contrasenas"       on gestion_contrasenas;
drop policy if exists "admin_inserta_contrasenas"  on gestion_contrasenas;
drop policy if exists "admin_actualiza_contrasenas" on gestion_contrasenas;

create policy "dueno_contrasenas_all" on gestion_contrasenas
  for all to authenticated
  using  (exists(select 1 from perfiles where id = auth.uid() and rol = 'dueno'))
  with check (exists(select 1 from perfiles where id = auth.uid() and rol = 'dueno'));

create policy "admin_ve_contrasenas" on gestion_contrasenas
  for select to authenticated using (es_admin());

create policy "admin_inserta_contrasenas" on gestion_contrasenas
  for insert to authenticated with check (es_admin());

create policy "admin_actualiza_contrasenas" on gestion_contrasenas
  for update to authenticated using (es_admin());

-- Fix RLS alumnos, practicas, perfiles
drop policy if exists "admin_alumnos_all"  on alumnos;
create policy "admin_alumnos_all" on alumnos
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "admin_practicas_all" on practicas;
create policy "admin_practicas_all" on practicas
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "admin_perfiles_all" on perfiles;
create policy "admin_perfiles_all" on perfiles
  for all to authenticated using (es_admin()) with check (es_admin());

-- Storage policies
drop policy if exists "admin_upload_all"         on storage.objects;
drop policy if exists "alumno_upload_soluciones"  on storage.objects;
drop policy if exists "padre_upload_contacto"     on storage.objects;
drop policy if exists "public_read"               on storage.objects;

create policy "admin_upload_all" on storage.objects
  for all to authenticated using (es_admin()) with check (es_admin());

create policy "alumno_upload_soluciones" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'soluciones' and
    exists(select 1 from alumnos where perfil_id = auth.uid())
  );

create policy "padre_upload_contacto" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contacto-padres' and
    exists(select 1 from perfiles where id = auth.uid() and rol = 'padre')
  );

create policy "public_read" on storage.objects
  for select to authenticated
  using (bucket_id in ('fotos-alumnos','practicas','notificaciones'));

-- Verificar
select rol, count(*) from perfiles group by rol;
