Cambios incluidos:

1. Ajustes / notificaciones
- El boton de Ajustes ahora queda como "Notificacion de prueba".
- Al tocarlo pide permiso y muestra una notificacion real desde el service worker cuando sea posible.
- El service worker queda preparado con notificationclick y listener push basico para fase futura.

2. Dictado en registrar novedad
- El boton anterior queda como "Dictado web".
- Se agrega "Mic del teclado" como alternativa para Android cuando Chrome bloquea el permiso de microfono por superposiciones/burbujas.
- Si Android/Chrome bloquea el permiso, la app ya no deja un mensaje generico: muestra la alternativa del teclado.

3. PDF directo con jsPDF
- Los reportes ya no abren HTML + asistente de impresion.
- Se cargan jsPDF y jsPDF AutoTable por CDN desde index.html.
- Planilla mensual, detalle mensual, resumen por docente y todo-en-uno descargan PDF directo.
- La columna T de la planilla recibe el mismo formato condicional por total:
  amarillo si total > 3, naranja si total > 6, rojo si total >= 9.

Archivos tocados:
- index.html
- service-worker.js
- js/app.js
- js/pdf.js
