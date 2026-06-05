# CUNABIT

CUNABIT es un monitor de bebé P2P para navegador. Usa dos dispositivos en la misma WiFi o en el mismo hotspot compartido: uno queda como cámara y el otro como monitor.

## Cómo funciona

- La cámara pide permiso de cámara y micrófono.
- El monitor introduce el mismo PIN y el código temporal que muestra la cámara.
- El emparejamiento usa `/api/box` como buzón temporal cifrado.
- Después del emparejamiento, el vídeo y el audio van directos entre los dispositivos mediante WebRTC.
- No se configura STUN/TURN: el producto está pensado para red local primero.

## Uso

1. Abre `https://cunabit.vercel.app/` en los dos dispositivos.
2. En el móvil que queda con el bebé, toca `Soy la cámara`.
3. Crea un PIN de 6 dígitos y activa la cámara.
4. En el otro móvil, toca `Soy el monitor`.
5. Introduce el mismo PIN y el código temporal.

También funciona si un móvil comparte datos y el otro se conecta a ese hotspot, siempre que ambos queden en la misma red privada.

## Desarrollo local

```bash
npm test
npm run check
npm run dev
```

`npm run dev` sirve la app y el buzón temporal en `http://127.0.0.1:4173/`. La cámara y el micrófono requieren HTTPS en producción; en local los navegadores permiten `localhost`.

## Vercel

El proyecto está preparado para Vercel:

- `index.html` sirve la app.
- `api/box.js` sirve el buzón temporal en `/api/box`.
- `vercel.json` define cabeceras de seguridad y cache.
- `robots.txt` y `sitemap.xml` apuntan a `https://cunabit.vercel.app/`.
- `favicon.svg`, `site.webmanifest` y `og-image.svg` mejoran identidad, instalación y vista previa al compartir.

Guía paso a paso sin instalar Vercel CLI: [VERCEL_SETUP.md](VERCEL_SETUP.md).

Para ver visitas, activa Web Analytics desde el dashboard de Vercel del proyecto. El HTML incluye el script de Vercel Analytics para sitios estáticos.

Variable opcional de producción:

- `CUNABIT_ALLOWED_ORIGIN`: origen permitido por CORS para `/api/box`. Por defecto usa `https://cunabit.vercel.app`.

Variables recomendadas para producción estable:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

También son compatibles los nombres de Upstash:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Si esas variables existen, `/api/box` guarda el buzón temporal en Redis/KV con TTL real. Si no existen, usa memoria local para desarrollo. El vídeo y el audio siguen yendo P2P; Redis/KV solo guarda durante unos minutos los mensajes cifrados de emparejamiento.

## Límites de privacidad

CUNABIT evita relays externos y mantiene el vídeo/audio en conexión directa dentro de la red privada. El emparejamiento sí usa un buzón temporal en Vercel con datos cifrados y caducidad de 5 minutos. El PIN de 6 dígitos protege el emparejamiento cómodo, pero no debe tratarse como una contraseña fuerte ni compartirse fuera del momento de conexión.

## Enlaces

- Web: https://www.mabarcodev.com/
- GitHub: https://github.com/mabarcodev
- Instagram: https://www.instagram.com/mabarcodev
