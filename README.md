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

## Notas de audio y pantalla

- En iPhone y Safari el sonido del monitor sale por el propio vídeo: no se corta con el interruptor lateral de silencio y el volumen se ajusta con los botones físicos. El control en pantalla llega ahí hasta el 100%; en Android y escritorio la amplificación llega al 300%.
- Si el navegador bloquea el sonido al conectar, aparece el botón «Activar audio»; un toque lo recupera. Al volver a la app tras bloquear la pantalla, el audio se reanuda solo.
- Si la cámara graba en vertical y el monitor está en horizontal (o al revés), el monitor muestra la imagen completa automáticamente. El botón de encuadre permite cambiarlo a mano y esa elección se respeta.
- La detección de llanto sigue activa con el monitor en segundo plano. Aun así, lo recomendado es dejar la app visible: el aviso con vibración y el refresco del medidor dependen del sistema cuando la app no está en primer plano.

## Límites de privacidad

CUNABIT evita relays externos y mantiene el vídeo/audio en conexión directa dentro de la red privada. El emparejamiento sí usa un buzón temporal en Vercel con datos cifrados y caducidad de 5 minutos. El PIN de 6 dígitos protege el emparejamiento cómodo, pero no debe tratarse como una contraseña fuerte ni compartirse fuera del momento de conexión.

## Autoría

El home usa el patrón `AUTHOR_FOOTER_MINIMAL_BRANDED`: firma discreta con isotipo pequeño, texto `Hecho con cariño por MabarcoDev` y enlaces secundarios `Web · GitHub · Instagram`.

## Enlaces

- Web: https://www.mabarcodev.com/
- GitHub: https://github.com/mabarcodev
- Instagram: https://www.instagram.com/mabarcodev
