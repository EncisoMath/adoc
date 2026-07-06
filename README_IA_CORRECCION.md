# Corrección de observaciones con IA

## Qué cambia

- Se elimina el dictado del modal de registrar novedad.
- El botón queda como `Corregir y enviar`.
- Si hay internet, la app llama a Supabase Edge Function `correct-observation`.
- La función usa `OPENAI_API_KEY`, que ya debe estar guardada como secreto en Supabase.
- Si no hay internet o la IA falla, la novedad se guarda igual y queda pendiente para corregirse automáticamente al volver la conexión.

## Archivos del repo

Frontend:
- `js/app.js`
- `js/api.js`
- `service-worker.js`

Edge Function:
- `supabase/functions/correct-observation/index.ts`

## Cómo subir al repo

```bash
git add js/app.js js/api.js service-worker.js supabase/functions/correct-observation/index.ts supabase/functions/correct-observation/README.md README_IA_CORRECCION.md
git commit -m "Agrega correccion real con IA para observaciones"
git push origin main
```

## En Supabase Dashboard

Como estás usando Dashboard:

1. Ve a Edge Functions.
2. Crea una función llamada exactamente:
   `correct-observation`
3. Pega el contenido de:
   `supabase/functions/correct-observation/index.ts`
4. Deploy.
5. El secreto ya debe existir con este nombre:
   `OPENAI_API_KEY`

La app no lleva la API key en el frontend.
