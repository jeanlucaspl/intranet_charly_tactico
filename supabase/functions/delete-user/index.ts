import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

async function del(sb: any, table: string, col: string, val: string): Promise<string|null> {
  const { error } = await sb.from(table).delete().eq(col, val)
  if (error) return `${table}.${col}=${val}: ${error.message}`
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { perfil_id, alumno_id, profesor_id } = await req.json()
    const errors: string[] = []

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── ALUMNO ──
    if (alumno_id) {
      const steps = [
        del(sb, 'solicitudes_ubicacion', 'alumno_id', alumno_id),
        del(sb, 'soluciones',            'alumno_id', alumno_id),
        del(sb, 'asistencias',           'alumno_id', alumno_id),
        del(sb, 'notas',                 'alumno_id', alumno_id),
        del(sb, 'alumno_materia',        'alumno_id', alumno_id),
        del(sb, 'alumno_aula',           'alumno_id', alumno_id),
        del(sb, 'padres_alumnos',        'alumno_id', alumno_id),
      ]
      const results = await Promise.all(steps)
      results.forEach(e => { if(e) errors.push(e) })
      const e = await del(sb, 'alumnos', 'id', alumno_id)
      if (e) errors.push(e)
    }

    // ── PROFESOR ──
    if (profesor_id) {
      let e = await del(sb, 'asistencias_profesores', 'profesor_id', profesor_id)
      if (e) errors.push(e)
      e = await del(sb, 'materia_profesor', 'profesor_id', profesor_id)
      if (e) errors.push(e)
      e = await del(sb, 'profesores', 'id', profesor_id)
      if (e) errors.push(e)
    }

    // ── PERFIL + AUTH ──
    // Limpia TODAS las tablas que puedan referenciar este perfil, sin importar el rol.
    // Esto cubre casos de datos inconsistentes (ej: un profesor con rol='alumno').
    if (perfil_id) {
      // 1. Buscar si este perfil tiene fila en profesores o alumnos (por si acaso)
      const [{ data: profRows }, { data: alumRows }] = await Promise.all([
        sb.from('profesores').select('id').eq('perfil_id', perfil_id),
        sb.from('alumnos').select('id').eq('perfil_id', perfil_id),
      ])

      // 2. Limpiar registros de profesor si existen (que no se hayan borrado por profesor_id)
      for (const prof of (profRows || [])) {
        const e1 = await del(sb, 'asistencias_profesores', 'profesor_id', prof.id)
        if (e1) errors.push(e1)
        const e2 = await del(sb, 'materia_profesor', 'profesor_id', prof.id)
        if (e2) errors.push(e2)
        const e3 = await del(sb, 'profesores', 'id', prof.id)
        if (e3) errors.push(e3)
      }

      // 3. Limpiar registros de alumno si existen (datos inconsistentes)
      for (const al of (alumRows || [])) {
        const steps = [
          del(sb, 'solicitudes_ubicacion', 'alumno_id', al.id),
          del(sb, 'soluciones',            'alumno_id', al.id),
          del(sb, 'asistencias',           'alumno_id', al.id),
          del(sb, 'notas',                 'alumno_id', al.id),
          del(sb, 'alumno_materia',        'alumno_id', al.id),
          del(sb, 'alumno_aula',           'alumno_id', al.id),
          del(sb, 'padres_alumnos',        'alumno_id', al.id),
        ]
        const results = await Promise.all(steps)
        results.forEach(e => { if(e) errors.push(e) })
        const e = await del(sb, 'alumnos', 'id', al.id)
        if (e) errors.push(e)
      }

      // 4. Limpiar el resto de tablas que referencian perfil_id
      const steps = [
        del(sb, 'solicitudes_ubicacion', 'padre_id',        perfil_id),
        del(sb, 'padres_alumnos',        'padre_id',        perfil_id),
        del(sb, 'contacto_mensajes',     'padre_id',        perfil_id),
        del(sb, 'fcm_tokens',            'user_id',         perfil_id),
        del(sb, 'notificaciones_ocultas','user_id',         perfil_id),
        del(sb, 'notificaciones',        'destinatario_id', perfil_id),
        del(sb, 'gestion_contrasenas',   'perfil_id',       perfil_id),
      ]
      const results = await Promise.all(steps)
      results.forEach(e => { if(e) errors.push(e) })

      // 5. Borrar perfil
      const ep = await del(sb, 'perfiles', 'id', perfil_id)
      if (ep) errors.push('PERFILES: ' + ep)

      // 6. Borrar de auth
      const { error: authErr } = await sb.auth.admin.deleteUser(perfil_id)
      if (authErr) errors.push('AUTH: ' + authErr.message)
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: errors.join(' | ') }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
