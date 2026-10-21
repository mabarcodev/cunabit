# Changelog

## 6.0.0 - 2026-10-21

### Cambiado

- **CUNABIT se publica en Cloudflare**: nueva dirección `https://cunabit.mabarcodev.workers.dev/`. La anterior, `cunabit.vercel.app`, deja de funcionar.
- El buzón de emparejamiento usa Cloudflare Durable Objects en vez de Upstash Redis. Ya no hay base de datos externa que pueda archivarse por inactividad, que fue la causa del `500 server_error` de octubre de 2026. Detalles en `docs/adr/0001-cloudflare-durable-objects.md`.
- Cada código de emparejamiento se borra de verdad a los 5 minutos mediante una alarma, aunque nadie vuelva a consultarlo.
- Los errores transitorios del almacén responden `503 store_unavailable` y la app muestra «el servicio de emparejamiento no está disponible»; antes era un `500` genérico.
- Los logs de producción guardan solo los errores del Worker, sin un registro por petición.
- Los archivos publicados se limitan a `public/`; el resto del repositorio no se sube.
- `npm run dev` usa `wrangler dev` con Durable Objects reales; `npm run check:deploy` valida la configuración sin publicar.

### Eliminado

- `api/box.js`, la integración con Upstash/Vercel KV y sus variables de entorno.
- Vercel Analytics. Las visitas se pueden consultar en las métricas del Worker.
- El proyecto de Vercel y `vercel.json`. `VERCEL_SETUP.md` queda sustituido por `CLOUDFLARE_SETUP.md`.

### Audio y pantalla

- Actualizado el footer de autor al patrón `AUTHOR_FOOTER_MINIMAL_BRANDED`, con isotipo pequeño, firma discreta y enlaces Web, GitHub e Instagram.
- Arreglado el audio del monitor en iPhone y Safari: el sonido sale por el elemento de vídeo, que no se silencia con el interruptor lateral ni depende de Web Audio; el medidor y el aviso de llanto siguen usando Web Audio.
- En iPhone y Safari el control de volumen llega al 100% (la amplificación hasta 300% requiere Web Audio y se mantiene en Android y escritorio); el resto lo pone el volumen físico.
- Arreglado el pitido de aviso tras varias alertas: se reutiliza un único contexto de audio en vez de crear uno nuevo por pitido, que acababa bloqueado por el navegador.
- La detección de llanto sigue activa con la app en segundo plano: el análisis usa un temporizador en vez de `requestAnimationFrame`, que se congela con la pantalla apagada.
- El audio se reanuda solo al volver a la app y el botón «Activar audio» también cubre el caso de vídeo bloqueado por autoplay.
- Las pantallas de cámara y monitor cubren todo el viewport en móviles con notch, sin franjas de color ni scroll residual.
- Añadidos fallbacks de `100vh` y de colores en hex para navegadores antiguos sin `100dvh` ni `oklch` (caso típico: móvil viejo usado como cámara).
- Encuadre automático: si la cámara y el monitor están en orientaciones distintas se muestra la imagen completa; la elección manual con el botón de encuadre siempre manda.
- Vista horizontal compacta: los controles del monitor tapan menos vídeo en apaisado.
- Cambio de cámara compatible con más Android: se libera la cámara actual antes de abrir la otra, ya no se vuelve a pedir el micrófono y se restaura la cámara anterior si falla.
- El botón «Terminar» vuelve a la pantalla de inicio; antes cortaba la sesión pero dejaba una pantalla negra sin salida.

## 5.2.0 - 2026-06-05

- Endurecido el buzón temporal de emparejamiento.
- Añadido volumen real del monitor hasta 300%.
- Añadido cambio de cámara frontal/trasera.
- Añadido encuadre `cover`/`contain` para directo en vertical y horizontal.
- Añadidos SEO, sitemap, robots y Vercel Analytics.
- Añadidos favicon, manifest, datos estructurados e imagen social.
- Añadido botón para copiar el código de emparejamiento.
- Añadida limpieza del buzón temporal al cerrar la página.
- Añadido botón de recuperación si el navegador bloquea el audio del monitor.
- Ampliado `.gitignore` para evitar backups, sourcemaps y builds accidentales.
- Reforzado `/api/box` con acciones POST, tokens efímeros, rate limit básico y cabecera `X-Robots-Tag`.
- Añadido soporte Redis/KV por REST para que el buzón sea estable en Vercel serverless.
- Añadida guía de configuración de Vercel y `.env.example`.
- Añadido `npm run check:prod` para validar variables críticas.
- Añadido servidor local con `/api/box` funcional mediante `npm run dev`.
- Mejorada accesibilidad de PIN, código, modales, estados y controles táctiles.
- Limpieza de textos públicos, documentación y referencias antiguas.
- Añadidas pruebas automáticas para `/api/box` y checks estáticos.
