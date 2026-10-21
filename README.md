# CUNABIT

CUNABIT es un monitor de bebé P2P para navegador. Usa dos dispositivos en la misma WiFi o en el mismo hotspot compartido: uno queda como cámara y el otro como monitor.

## Cómo funciona

- La cámara pide permiso de cámara y micrófono.
- El monitor introduce el mismo PIN y el código temporal que muestra la cámara.
- El emparejamiento usa `/api/box` como buzón temporal cifrado, alojado en Cloudflare con Durable Objects.
- Después del emparejamiento, el vídeo y el audio van directos entre los dispositivos mediante WebRTC.
- No se configura STUN/TURN: el producto está pensado para red local primero.

## Uso

1. Abre `https://cunabit.mabarcodev.workers.dev/` en los dos dispositivos.
2. En el móvil que queda con el bebé, toca `Soy la cámara`.
3. Crea un PIN de 6 dígitos y activa la cámara.
4. En el otro móvil, toca `Soy el monitor`.
5. Introduce el mismo PIN y el código temporal.

También funciona si un móvil comparte datos y el otro se conecta a ese hotspot, siempre que ambos queden en la misma red privada.

## Desarrollo local

```bash
npm install
npm test            # tests del Worker
npm run check       # tests + checks estáticos
npm run dev         # wrangler dev en http://localhost:8787/
npm run check:deploy  # valida la configuración de Cloudflare sin publicar
```

`npm run dev` ejecuta la app con el mismo motor que Cloudflare, incluidos los Durable Objects reales. La cámara y el micrófono requieren HTTPS en producción; en local los navegadores permiten `localhost`.

## Cloudflare

CUNABIT se publica como un Worker de Cloudflare:

- `public/` contiene todo lo que se sirve: `index.html`, iconos, manifest, `robots.txt`, `sitemap.xml` y `_headers` (cabeceras de seguridad y caché). Nada fuera de esa carpeta se publica.
- `src/worker.mjs` atiende `/api/box`. Cada código de emparejamiento es un Durable Object (`PairingBox`) que guarda solo el paquete cifrado y los tokens efímeros, y lo borra con una alarma a los 5 minutos. `RateLimiter` limita a 120 peticiones por minuto e IP, en memoria.
- `wrangler.jsonc` define el Worker, los Durable Objects y los logs. No hace falta ninguna variable de entorno ni base de datos externa.
- Cada push a `main` se publica solo (Workers Builds conectado al repo de GitHub).

Configuración, operación y qué hacer si algo falla: [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md). Por qué se eligió esta arquitectura: [docs/adr/0001-cloudflare-durable-objects.md](docs/adr/0001-cloudflare-durable-objects.md).

## Notas de audio y pantalla

- En iPhone y Safari el sonido del monitor sale por el propio vídeo: no se corta con el interruptor lateral de silencio y el volumen se ajusta con los botones físicos. El control en pantalla llega ahí hasta el 100%; en Android y escritorio la amplificación llega al 300%.
- Si el navegador bloquea el sonido al conectar, aparece el botón «Activar audio»; un toque lo recupera. Al volver a la app tras bloquear la pantalla, el audio se reanuda solo.
- Si la cámara graba en vertical y el monitor está en horizontal (o al revés), el monitor muestra la imagen completa automáticamente. El botón de encuadre permite cambiarlo a mano y esa elección se respeta.
- La detección de llanto sigue activa con el monitor en segundo plano. Aun así, lo recomendado es dejar la app visible: el aviso con vibración y el refresco del medidor dependen del sistema cuando la app no está en primer plano.

## Límites de privacidad

CUNABIT evita relays externos y mantiene el vídeo/audio en conexión directa dentro de la red privada. El emparejamiento sí usa un buzón temporal en Cloudflare con datos cifrados en el propio dispositivo y caducidad de 5 minutos; el PIN nunca sale del dispositivo. Cloudflare ve el paquete cifrado, el código y las IPs, como cualquier servidor web. El PIN de 6 dígitos protege el emparejamiento cómodo, pero no debe tratarse como una contraseña fuerte ni compartirse fuera del momento de conexión.

## Autoría

El home usa el patrón `AUTHOR_FOOTER_MINIMAL_BRANDED`: firma discreta con isotipo pequeño, texto `Hecho con cariño por MabarcoDev` y enlaces secundarios `Web · GitHub · Instagram`.

## Enlaces

- Web: https://www.mabarcodev.com/
- GitHub: https://github.com/mabarcodev
- Instagram: https://www.instagram.com/mabarcodev
