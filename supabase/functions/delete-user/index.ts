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
      e = await del(sb, 'profesores', 'id', profesor_id)
      if (e) errors.push(e)
    }

    // ── PERFIL + AUTH ──
    if (perfil_id) {
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
