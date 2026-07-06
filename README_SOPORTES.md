# Soportes adjuntos - Asistencia GGM

Cambios incluidos:

- En el modal de **Registrar novedad / Editar novedad** se agregó el botón **Adjuntar soportes**.
- Permite seleccionar uno o varios archivos: imágenes, PDF, Word o Excel.
- Al guardar con **Corregir y enviar**, la app:
  1. Corrige la observación con el diccionario local.
  2. Guarda la novedad en `attendance_records`.
  3. Sube los archivos al bucket `asistencia-ggm` de Supabase Storage.
  4. Registra cada archivo en la tabla `attachments`.
  5. Marca `has_attachments = true` en la novedad.
- En el detalle del día, si una novedad tiene soportes, aparece el botón **Ver soportes**.
- Cada soporte se abre mediante URL firmada temporal desde Supabase Storage.

Archivos tocados:

- `js/app.js`
- `js/api.js`
- `service-worker.js`
- `supabase/storage_policies_soportes.sql` opcional, solo si el bucket no deja subir/abrir archivos.

Notas:

- Los soportes requieren conexión. La novedad sí puede guardarse en cola offline, pero los archivos no se suben sin internet.
- Límite local por archivo: 10 MB.
- Ruta de subida usada:
  `soportes/AÑO/MES/ID_REGISTRO/archivo`

Si al adjuntar sale error de permisos del bucket, ejecuta el SQL opcional en Supabase SQL Editor.
