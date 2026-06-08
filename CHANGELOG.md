# Changelog

## Unreleased

- Actualizado el footer de autor al patrón `AUTHOR_FOOTER_MINIMAL_BRANDED`, con isotipo pequeño, firma discreta y enlaces Web, GitHub e Instagram.

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
