-- ══════════════════════════════════════════════════
-- PASO 2: Ejecutar DESPUÉS de commitear el enum 'profesor'
-- ══════════════════════════════════════════════════

-- Tabla profesores
create table if not exists profesores (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfiles(id) on delete cascade unique,
  especialidad text,
  activo boolean default true,
  foto_url text,
  -- Descriptor facial: array de 128 números generado por face-api.js
  -- Se guarda como JSON, no como imagen → ocupa ~1KB por persona
  foto_descriptor jsonb,
  creado_en timestamptz default now()
);

-- Asistencia de profesores (separada de alumnos)
create table if not exists asistencias_profesores (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid references profesores(id) on delete cascade,
  fecha date not null default current_date,
  hora_ingreso time,
  hora_salida time,
  estado text check (estado in ('presente','tardanza','ausente')) default 'presente',
  verificado_facial boolean default false,
  latitud numeric,
  longitud numeric,
  creado_en timestamptz default now()
);

-- Agregar descriptor facial también a alumnos
alter table alumnos add column if not exists foto_descriptor jsonb;

-- Vista de horario para profesores (qué materias dictan)
-- Un profesor puede dictar varias materias
alter table materias add column if not exists profesor_id uuid references perfiles(id);

-- Verificar
select 'profesores creada' as status
where exists (
  select from information_schema.tables
  where table_name = 'profesores'
);
