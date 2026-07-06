# Edge Function: correct-observation

Esta función recibe una observación escrita informalmente y la corrige con IA real usando OpenAI.

## Dashboard Supabase

1. Supabase > Edge Functions > Create function.
2. Nombre exacto: `correct-observation`.
3. Pega el contenido de `index.ts`.
4. Verifica que el secreto exista:
   - `OPENAI_API_KEY`
5. Deploy.

No pongas la API key en GitHub ni en `app.js`.
