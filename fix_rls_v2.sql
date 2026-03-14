-- ══════════════════════════════════════════════════════
-- RESET COMPLETO DE RLS
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- 1. Desactivar RLS temporalmente en todas las tablas
-- para limpiar sin problemas
alter table if exists perfiles         disable row level security;
alter table if exists alumnos          disable row level security;
alter table if exists aulas            disable row level security;
alter table if exists materias         disable row level security;
alter table if exists horario_semanal  disable row level security;
alter table if exists notas            disable row level security;
alter table if exists asistencias      disable row level security;
alter table if exists practicas        disable row level security;
alter table if exists soluciones       disable row level security;
alter table if exists notificaciones   disable row level security;
alter table if exists alumno_aula      disable row level security;
alter table if exists alumno_materia   disable row level security;
alter table if exists padres_alumnos   disable row level security;
alter table if exists contacto_mensajes disable row level security;
alter table if exists horarios         disable row level security;

-- 2. Eliminar TODAS las políticas existentes
do $$ declare
  r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 3. Eliminar función anterior si existe
drop function if exists es_admin() cascade;

-- 4. Crear función helper correcta
-- Usa SECURITY DEFINER para que siempre funcione
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select rol in ('admin','instructor')
     from public.perfiles
     where id = auth.uid()
     limit 1),
    false
  );
$$;

-- 5. Re-activar RLS en todas las tablas
alter table perfiles          enable row level security;
alter table alumnos           enable row level security;
alter table aulas             enable row level security;
alter table materias          enable row level security;
alter table horario_semanal   enable row level security;
alter table notas             enable row level security;
alter table asistencias       enable row level security;
alter table practicas         enable row level security;
alter table soluciones        enable row level security;
alter table notificaciones    enable row level security;
alter table alumno_aula       enable row level security;
alter table alumno_materia    enable row level security;
alter table padres_alumnos    enable row level security;
alter table contacto_mensajes enable row level security;

-- 6. Políticas para PERFILES
-- Admin: acceso total
create policy "admin_perfiles_all" on perfiles
  for all to authenticated
  using (es_admin())
  with check (es_admin());

-- Cada usuario ve y edita su propio perfil
create policy "user_perfiles_own" on perfiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 7. Políticas para ALUMNOS
create policy "admin_alumnos_all" on alumnos
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "alumno_ve_propio" on alumnos
  for select to authenticated
  using (perfil_id = auth.uid());

-- Padres pueden ver alumnos vinculados a ellos
create policy "padre_ve_hijo" on alumnos
  for select to authenticated
  using (
    id in (
      select alumno_id from padres_alumnos
      where padre_id = auth.uid()
    )
  );

-- 8. Políticas para AULAS
create policy "admin_aulas_all" on aulas
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "todos_ven_aulas" on aulas
  for select to authenticated
  using (true);

-- 9. Políticas para MATERIAS
create policy "admin_materias_all" on materias
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "todos_ven_materias" on materias
  for select to authenticated
  using (true);

-- 10. Políticas para HORARIO SEMANAL
create policy "admin_horario_all" on horario_semanal
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "todos_ven_horario" on horario_semanal
  for select to authenticated
  using (true);

-- 11. Políticas para NOTAS
create policy "admin_notas_all" on notas
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "alumno_ve_notas" on notas
  for select to authenticated
  using (alumno_id in (select id from alumnos where perfil_id = auth.uid()));

create policy "padre_ve_notas_hijo" on notas
  for select to authenticated
  using (alumno_id in (select alumno_id from padres_alumnos where padre_id = auth.uid()));

-- 12. Políticas para ASISTENCIAS
create policy "admin_asistencias_all" on asistencias
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "alumno_ve_asistencias" on asistencias
  for select to authenticated
  using (alumno_id in (select id from alumnos where perfil_id = auth.uid()));

create policy "padre_ve_asistencias_hijo" on asistencias
  for select to authenticated
  using (alumno_id in (select alumno_id from padres_alumnos where padre_id = auth.uid()));

-- 13. Políticas para PRÁCTICAS
create policy "admin_practicas_all" on practicas
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "todos_ven_practicas" on practicas
  for select to authenticated
  using (true);

-- 14. Políticas para SOLUCIONES
create policy "admin_soluciones_all" on soluciones
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "alumno_gestiona_soluciones" on soluciones
  for all to authenticated
  using (alumno_id in (select id from alumnos where perfil_id = auth.uid()))
  with check (alumno_id in (select id from alumnos where perfil_id = auth.uid()));

-- 15. Políticas para NOTIFICACIONES
create policy "admin_notifs_all" on notificaciones
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "user_ve_notifs" on notificaciones
  for select to authenticated
  using (global = true or destinatario_id = auth.uid());

-- 16. Políticas para ALUMNO_AULA
create policy "admin_alumno_aula_all" on alumno_aula
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "todos_ven_alumno_aula" on alumno_aula
  for select to authenticated
  using (true);

-- 17. Políticas para ALUMNO_MATERIA
create policy "admin_alumno_materia_all" on alumno_materia
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "todos_ven_alumno_materia" on alumno_materia
  for select to authenticated
  using (true);

-- 18. Políticas para PADRES_ALUMNOS
create policy "admin_padres_alumnos_all" on padres_alumnos
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "padre_ve_su_vinculo" on padres_alumnos
  for select to authenticated
  using (padre_id = auth.uid());

-- 19. Políticas para CONTACTO_MENSAJES
create policy "admin_contacto_all" on contacto_mensajes
  for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy "padre_gestiona_mensajes" on contacto_mensajes
  for all to authenticated
  using (padre_id = auth.uid())
  with check (padre_id = auth.uid());

-- ══════════════════════════════════════════════════════
-- LOGIN POR DNI PARA PADRES
-- Agregar columna dni_login a perfiles si no existe
-- ══════════════════════════════════════════════════════
alter table perfiles add column if not exists pin text;

-- El pin/contraseña para padres será su DNI por defecto
-- Se maneja desde el frontend con email ficticio: {dni}@charlytactico.pe

-- ══════════════════════════════════════════════════════
-- VERIFICAR QUE TODO QUEDÓ BIEN
-- ══════════════════════════════════════════════════════
select tablename, count(*) as num_policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
