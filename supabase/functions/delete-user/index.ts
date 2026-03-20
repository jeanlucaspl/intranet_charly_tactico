import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { perfil_id, alumno_id } = await req.json()
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    if (alumno_id) {
      await sb.from('soluciones').delete().eq('alumno_id', alumno_id)
      await sb.from('asistencias').delete().eq('alumno_id', alumno_id)
      await sb.from('notas').delete().eq('alumno_id', alumno_id)
      await sb.from('alumno_materia').delete().eq('alumno_id', alumno_id)
      await sb.from('padres_alumnos').delete().eq('alumno_id', alumno_id)
      await sb.from('alumnos').delete().eq('id', alumno_id)
    }
    if (perfil_id) {
      await sb.from('fcm_tokens').delete().eq('user_id', perfil_id)
      await sb.from('notificaciones_ocultas').delete().eq('user_id', perfil_id)
      await sb.from('notificaciones').delete().eq('destinatario_id', perfil_id)
      await sb.from('gestion_contrasenas').delete().eq('perfil_id', perfil_id)
      await sb.from('perfiles').delete().eq('id', perfil_id)
      const { error } = await sb.auth.admin.deleteUser(perfil_id)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
    }
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
