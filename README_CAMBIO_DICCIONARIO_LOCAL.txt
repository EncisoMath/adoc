Cambios realizados:
- Se eliminó el uso de IA/API/Edge Function para corregir observaciones.
- El botón sigue llamándose "Corregir y enviar".
- La corrección ahora es local: diccionario amplio de abreviaturas, errores comunes, tildes y términos frecuentes de las observaciones.
- No requiere internet, OpenAI, Gemini ni Supabase Edge Functions.
- Si existían correcciones pendientes de la versión con IA en IndexedDB, se procesan localmente.

Archivos tocados:
- js/app.js
- js/api.js
- service-worker.js

Limpieza recomendada del repo si ya habías subido la función de IA:
git rm -r supabase/functions/correct-observation 2>/dev/null || true
git rm supabase/config.toml 2>/dev/null || true
git rm README_IA_CORRECCION.md README_FIX_EDGE_FUNCTION.md README_GEMINI_CORRECCION.md README_FIX_GEMINI_GENERATE_CONTENT.md 2>/dev/null || true

Nota:
La corrección local no interpreta como un modelo de IA. Corrige patrones comunes, por ejemplo:
- wasap / wsp / wapp -> WhatsApp
- xq / pq / porq -> porque
- bino -> vino
- avixo / abiso -> avisó
- medica -> médica
- envio -> envió
