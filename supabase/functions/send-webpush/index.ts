import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user_ids, title, body, url } = await req.json();
    if (!user_ids?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const SB_URL        = Deno.env.get('SUPABASE_URL')!;
    const SB_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    webpush.setVapidDetails('mailto:admin@charlytactico.com', VAPID_PUBLIC, VAPID_PRIVATE);

    // Obtener subscripciones de los usuarios
    const ids = user_ids.map((id: string) => `"${id}"`).join(',');
    const res = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?user_id=in.(${ids})`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const subs: { endpoint: string; p256dh: string; auth: string }[] = await res.json();
    if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const payload = JSON.stringify({ title, body, url: url || '/' });
    const expiredEndpoints: string[] = [];

    const results = await Promise.allSettled(
      subs.map(s =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          .catch((err: { statusCode?: number }) => {
            if (err.statusCode === 410 || err.statusCode === 404) expiredEndpoints.push(s.endpoint);
            throw err;
          })
      )
    );

    // Limpiar subscripciones expiradas
    if (expiredEndpoints.length) {
      for (const ep of expiredEndpoints) {
        await fetch(
          `${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`,
          { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
      }
    }

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent, total: subs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
