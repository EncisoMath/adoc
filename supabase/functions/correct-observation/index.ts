const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) throw new Error('Faltan variables SUPABASE_URL o SUPABASE_ANON_KEY.');

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'apikey': anonKey,
      'Authorization': authHeader
    }
  });

  if (!res.ok) return null;
  return await res.json();
}

function extractOutputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text.trim();

  const parts: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method === 'GET') {
    return jsonResponse({ ok: true, function: 'correct-observation', message: 'Edge Function activa.' });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) return jsonResponse({ error: 'No autorizado. Inicia sesión nuevamente.' }, 401);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'Falta el secreto OPENAI_API_KEY.' }, 500);

    const { text } = await req.json();
    const raw = String(text || '').trim();

    if (!raw) return jsonResponse({ error: 'Texto vacío.' }, 400);
    if (raw.length > 2000) return jsonResponse({ error: 'Texto demasiado largo.' }, 400);

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        instructions: [
          'Eres un asistente de redacción institucional para planillas de asistencia docente en Colombia.',
          'Reescribe la observación en español claro, formal e institucional.',
          'Corrige totalmente ortografía, tildes, puntuación, mayúsculas, abreviaturas y errores de escritura.',
          'Puedes convertir expresiones informales como "xq", "wasap", "no bino", "avixo" en una redacción institucional.',
          'No inventes nombres, fechas, diagnósticos, soportes, excusas ni información que no aparezca en el texto.',
          'No cambies el sentido del hecho. No suavices una ausencia injustificada si el texto indica eso.',
          'Devuelve únicamente la observación corregida, sin comillas, sin explicación y sin lista.'
        ].join('\n'),
        input: raw,
        temperature: 0.2,
        max_output_tokens: 300
      })
    });

    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      return jsonResponse({
        error: data?.error?.message || 'OpenAI no pudo corregir la observación.'
      }, openaiRes.status);
    }

    const corrected = extractOutputText(data);
    if (!corrected) return jsonResponse({ error: 'OpenAI no devolvió texto corregido.' }, 502);

    return jsonResponse({ corrected });
  } catch (err) {
    return jsonResponse({ error: err?.message || String(err) }, 500);
  }
});
