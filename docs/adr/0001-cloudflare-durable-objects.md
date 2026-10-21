# ADR 0001: Buzón de emparejamiento en Cloudflare Durable Objects

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

CUNABIT necesita un buzón temporal para que cámara y monitor intercambien la oferta y la respuesta WebRTC, cifradas en el navegador con el PIN. Las dos peticiones pueden llegar a instancias distintas del servidor, así que el buzón no puede vivir en memoria.

Hasta la 5.x la web estaba en Vercel y el buzón en Upstash Redis (plan gratuito). En octubre de 2026 el emparejamiento falló en producción con `500 server_error`: Upstash archiva las bases gratuitas tras 30 días o más sin actividad, y CUNABIT llevaba desde julio sin uso. Vercel no ofrece almacén propio para esto, así que seguir en Vercel implicaba depender siempre de un tercero.

## Decisión

Publicar toda la app como un único Worker de Cloudflare:

- La web estática se sirve desde `public/` (assets de Workers, gratis e ilimitados).
- `/api/box` lo atiende el Worker. Cada código de emparejamiento es un Durable Object `PairingBox`, con almacenamiento SQLite, que guarda el payload cifrado y los tokens efímeros. Una alarma lo borra todo al terminar el TTL de 5 minutos.
- El límite de peticiones es un Durable Object `RateLimiter` por IP con contador en memoria.

## Alternativas descartadas

- **Seguir en Vercel con Upstash y una tarea diaria** que evite el archivado: arreglo mínimo, pero mantiene la dependencia de un tercero y de las condiciones de su plan gratuito.
- **Cloudflare Workers KV**: consistencia eventual (hasta unos 60 s entre ubicaciones) y unas 1.000 escrituras al día en el plan gratuito. El límite de peticiones escribe en cada consulta y lo agotaría.
- **Cloudflare Pages**: no puede definir Durable Objects; habría hecho falta un Worker aparte y dos despliegues.
- **Binding de rate limit de Workers**: no se encontró confirmación de que esté en el plan gratuito; un Durable Object propio sí lo está.

## Consecuencias

- Sin base de datos externa, variables de entorno ni credenciales que caduquen.
- Lecturas consistentes al instante: lo que escribe la cámara lo lee el monitor en la siguiente consulta.
- Plan gratuito: 100.000 peticiones al día, de sobra para el uso actual.
- Un solo proveedor ve los datos de emparejamiento (antes, Vercel y Upstash). Lo que ve no cambia: paquete cifrado, código e IPs. El PIN nunca sale del dispositivo.
- La URL pasa de `cunabit.vercel.app` a `cunabit.mabarcodev.workers.dev`; Vercel queda solo como redirección temporal (307) por si en el futuro se usa un dominio propio.
- Para probar el Worker con `node --test` se sustituye `cloudflare:workers` por un stub mínimo (`test-support/`).
- Límite conocido que no cambia con esta decisión: un PIN de 6 dígitos protege frente a terceros, pero quien opere el buzón podría probar todas las combinaciones contra el paquete cifrado durante los 5 minutos de vida.
