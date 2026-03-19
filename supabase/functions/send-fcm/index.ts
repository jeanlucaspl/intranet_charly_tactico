// Supabase Edge Function: send-fcm
// Envía notificaciones push via Firebase Cloud Messaging HTTP v1 API.
//
// Variables de entorno requeridas en Supabase:
//   FIREBASE_SERVICE_ACCOUNT  →  contenido del archivo JSON de service account
//   SUPABASE_URL              →  automática en Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY →  automática en Edge Functions

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Acepta:
    //   { user_ids, title, body, data } — lookup de tokens server-side (recomendado)
    //   { token, title, body, data }    — token único directo (usado por location_request)
    const { token, user_ids, title, body, data } = await req.json();

    if ((!user_ids?.length && !token) || !title) {
      return new Response(JSON.stringify({ error: "token o user_ids requerido, mas title" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup de tokens con service_role (bypassa RLS) cuando se usan user_ids
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let tokens: string[];
    if (token) {
      tokens = [token];
    } else {
      const ids = user_ids.join(",");
      const tokensRes = await fetch(
        `${supabaseUrl}/rest/v1/fcm_tokens?user_id=in.(${ids})&select=token`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const tokenRows: { token: string }[] = await tokensRes.json();
      tokens = tokenRows.map((r) => r.token).filter(Boolean);
    }

    if (!tokens.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "no tokens found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
    const accessToken = await getAccessToken(sa);

    // Siempre data-only para que onMessageReceived se llame en foreground/background/killed.
    // Esto garantiza que Android use el canal personalizado con ringtone.
    const results = await Promise.all(tokens.map((token) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            android: { priority: "HIGH" },
            data: { title, body: body ?? "", ...(data ?? {}) },
          },
        }),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
    ));

    return new Response(JSON.stringify({ sent: tokens.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Genera un access token OAuth2 usando la service account
async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const sigInput = `${enc(header)}.${enc(payload)}`;

  const pemKey  = sa.private_key;
  const keyData = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binary  = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(sigInput)
  );

  const jwt = `${sigInput}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const { access_token } = await tokenRes.json();
  return access_token;
}
