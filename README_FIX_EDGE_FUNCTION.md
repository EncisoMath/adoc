Fix para FunctionsFetchError en correct-observation

Causa más probable:
- La Edge Function no está desplegada, o
- el navegador está fallando por CORS/preflight/JWT antes de llegar a OpenAI.

Qué cambió:
- La función ahora responde GET para probar si está viva.
- La función maneja OPTIONS/CORS.
- Se agregó supabase/config.toml con verify_jwt = false.
- La función valida manualmente que el usuario esté autenticado antes de llamar a OpenAI.
- js/api.js ahora da un error más claro si no puede conectar con la función.

IMPORTANTE en Supabase Dashboard:
1. Edge Functions > correct-observation.
2. Pegar/deployar el nuevo index.ts.
3. En Settings de esa función, desactivar Verify JWT si aparece esa opción.
   No queda pública de verdad porque el index.ts valida el JWT manualmente en POST.
4. Confirmar que el secreto OPENAI_API_KEY existe.

Prueba rápida:
Abrir en el navegador:
https://ysltyjtuwtuwnnkasmwp.supabase.co/functions/v1/correct-observation

Debe responder algo como:
{"ok":true,"function":"correct-observation","message":"Edge Function activa."}
