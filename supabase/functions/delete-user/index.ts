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

  // ── VERIFICACIÓN DE AUTENTICACIÓN ──────────────────────────
  try {
    const body = await req.json()
    const { perfil_id, alumno_id, profesor_id, orphan_email, user_token } = body

    // Usar service role para verificar el token del llamador y su rol
    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    if (!user_token) {
      return new Response(JSON.stringify({ error: 'Token de usuario requerido' }), { status: 401, headers: corsHeaders })
    }
    const { data: { user }, error: userErr } = await sbAdmin.auth.getUser(user_token)
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders })
    }
    const { data: perfil } = await sbAdmin.from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !['admin','dueno'].includes(perfil.rol)) {
      return new Response(JSON.stringify({ error: 'Sin permisos' }), { status: 403, headers: corsHeaders })
    }
    const errors: string[] = []
    const sb = sbAdmin  // mismo cliente service role

    // ── HUÉRFANO POR EMAIL (usuario Auth sin perfil) ──
    if (orphan_email) {
      const { data: { users }, error: listErr } = await sb.auth.admin.listUsers()
      if (listErr) {
        return new Response(JSON.stringify({ error: 'No se pudo buscar el usuario: ' + listErr.message }), { status: 500, headers: corsHeaders })
      }
      const orphan = users.find((u: any) => u.email === orphan_email)
      if (!orphan) {
        return new Response(JSON.stringify({ ok: true, msg: 'No se encontró el huérfano' }), { headers: corsHeaders })
      }
      // Verificar que realmente no tiene perfil (seguridad extra)
      const { data: perfilCheck } = await sb.from('perfiles').select('id').eq('id', orphan.id).maybeSingle()
      if (perfilCheck) {
        return new Response(JSON.stringify({ error: 'El usuario tiene perfil, no es huérfano' }), { status: 400, headers: corsHeaders })
      }
      const { error: authErr } = await sb.auth.admin.deleteUser(orphan.id)
      if (authErr) {
        return new Response(JSON.stringify({ error: 'Error al eliminar: ' + authErr.message }), { status: 500, headers: corsHeaders })
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
    }

    // ── ALUMNO ──
    if (alumno_id) {
      const steps = [
        del(sb, 'solicitudes_ubicacion', 'alumno_id', alumno_id),
        del(sb, 'soluciones',            'alumno_id', alumno_id),
        del(sb, 'asistencias',           'alumno_id', alumno_id),
        del(sb, 'notas',                 'alumno_id', alumno_id),
        del(sb, 'alumno_materia',        'alumno_id', alumno_id),
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
    if (perfil_id) {
      const [{ data: profRows }, { data: alumRows }] = await Promise.all([
        sb.from('profesores').select('id').eq('perfil_id', perfil_id),
        sb.from('alumnos').select('id').eq('perfil_id', perfil_id),
      ])

      for (const prof of (profRows || [])) {
        const e1 = await del(sb, 'asistencias_profesores', 'profesor_id', prof.id)
        if (e1) errors.push(e1)
        const e2 = await del(sb, 'materia_profesor', 'profesor_id', prof.id)
        if (e2) errors.push(e2)
        const e3 = await del(sb, 'profesores', 'id', prof.id)
        if (e3) errors.push(e3)
      }

      for (const al of (alumRows || [])) {
        const steps = [
          del(sb, 'solicitudes_ubicacion', 'alumno_id', al.id),
          del(sb, 'soluciones',            'alumno_id', al.id),
          del(sb, 'asistencias',           'alumno_id', al.id),
          del(sb, 'notas',                 'alumno_id', al.id),
          del(sb, 'alumno_materia',        'alumno_id', al.id),
          del(sb, 'padres_alumnos',        'alumno_id', al.id),
        ]
        const results = await Promise.all(steps)
        results.forEach(e => { if(e) errors.push(e) })
        const e = await del(sb, 'alumnos', 'id', al.id)
        if (e) errors.push(e)
      }

      const steps = [
        del(sb, 'sesiones_asistencia',   'creado_por',      perfil_id),
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

      const ep = await del(sb, 'perfiles', 'id', perfil_id)
      if (ep) errors.push('PERFILES: ' + ep)

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
