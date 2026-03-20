import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

// Borra de una tabla ignorando si la tabla no existe o no hay filas
async function del(sb: any, table: string, col: string, val: string) {
  try {
    await sb.from(table).delete().eq(col, val)
  } catch(_) {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { perfil_id, alumno_id, profesor_id } = await req.json()

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── ALUMNO ──
    if (alumno_id) {
      await del(sb, 'solicitudes_ubicacion', 'alumno_id', alumno_id)
      await del(sb, 'soluciones',            'alumno_id', alumno_id)
      await del(sb, 'asistencias',           'alumno_id', alumno_id)
      await del(sb, 'notas',                 'alumno_id', alumno_id)
      await del(sb, 'alumno_materia',        'alumno_id', alumno_id)
      await del(sb, 'alumno_aula',           'alumno_id', alumno_id)
      await del(sb, 'padres_alumnos',        'alumno_id', alumno_id)
      await del(sb, 'alumnos',               'id',        alumno_id)
    }

    // ── PROFESOR ──
    if (profesor_id) {
      await del(sb, 'asistencias_profesores', 'profesor_id', profesor_id)
      await del(sb, 'profesores',             'id',          profesor_id)
    }

    // ── PERFIL + AUTH (aplica a cualquier tipo) ──
    if (perfil_id) {
      await del(sb, 'solicitudes_ubicacion', 'padre_id',       perfil_id)
      await del(sb, 'padres_alumnos',        'padre_id',       perfil_id)
      await del(sb, 'contacto_mensajes',     'padre_id',       perfil_id)
      await del(sb, 'fcm_tokens',            'user_id',        perfil_id)
      await del(sb, 'notificaciones_ocultas','user_id',        perfil_id)
      await del(sb, 'notificaciones',        'destinatario_id',perfil_id)
      await del(sb, 'gestion_contrasenas',   'perfil_id',      perfil_id)
      await del(sb, 'perfiles',              'id',             perfil_id)

      const { error } = await sb.auth.admin.deleteUser(perfil_id)
      if (error) return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: corsHeaders }
      )
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
