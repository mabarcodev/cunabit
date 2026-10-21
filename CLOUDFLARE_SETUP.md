# CUNABIT en Cloudflare

Producción: `https://cunabit.mabarcodev.workers.dev/` (Worker `cunabit` en la cuenta de Cloudflare de MabarcoDev).

No hace falta base de datos externa, variables de entorno ni claves: el buzón de emparejamiento vive en Durable Objects dentro del propio Worker.

## Cómo se publica

El Worker está conectado al repositorio `mabarcodev/cunabit` con Workers Builds:

- Cada push a `main` ejecuta `npx wrangler deploy` y publica en producción en uno o dos minutos. También vale editar desde la web de GitHub.
- Las compilaciones de vista previa están desactivadas: Cloudflare no genera URLs de vista previa para Workers con Durable Objects.
- Cloudflare Access está desactivado: la web tiene que ser pública para que cualquiera pueda emparejar sus dispositivos.

Antes de hacer push:

```bash
npm run check         # tests + checks estáticos
npm run check:deploy  # valida wrangler.jsonc y empaqueta sin publicar
```

## Configuración desde cero

Si hubiera que recrear el Worker (otra cuenta, borrado accidental):

1. En el panel de Cloudflare, `Workers & Pages` > `Create` > `Import a repository` > GitHub.
2. Autoriza la app de Cloudflare solo para el repositorio `mabarcodev/cunabit`.
3. Nombre del proyecto: `cunabit` (debe coincidir con `name` en `wrangler.jsonc`). Comando de compilación vacío. Comando de despliegue `npx wrangler deploy`. Rama de producción `main`.
4. Desactiva las compilaciones de vista previa y deja Cloudflare Access desactivado.
5. Pulsa `Implementar`. La migración `v1` de `wrangler.jsonc` crea los Durable Objects `PairingBox` y `RateLimiter` en el primer despliegue.

## Comprobar que producción funciona

Un código inválido debe responder `400 invalid_code`:

```bash
curl -s -X POST -H "content-type: application/json" -d '{"action":"get","code":"bad","role":"offer"}' https://cunabit.mabarcodev.workers.dev/api/box
```

Después, prueba un emparejamiento real con dos dispositivos.

## Runbook: el emparejamiento falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `Servidor: 503 — el servicio de emparejamiento no está disponible` | Durable Objects sobrecargados o reiniciándose | Esperar y reintentar; la app ya reintenta sola. Si dura, revisar el estado de Cloudflare. |
| `Servidor: 429 rate_limited` | Más de 120 peticiones por minuto desde la misma IP | Esperar un minuto. Si pasa con uso normal (muchos dispositivos tras la misma red), subir `RATE_MAX_REQUESTS` en `src/worker.mjs`. |
| `Servidor: 500 server_error` | Error inesperado del Worker | Ver los logs (abajo) y el último despliegue. |
| La web no carga o da error 1101/1102 | El Worker falló al arrancar o superó límites | Revisar `Implementaciones` y volver a la versión anterior. |
| Errores a partir de cierta hora del día | Límite diario del plan gratuito (100.000 peticiones) | Se reinicia a las 00:00 UTC. Si se repite, valorar el plan de pago. |

### Logs

En el Worker, pestaña `Observabilidad` > `Logs`, filtrando por `[box]`. Solo se guardan los `console.error` del Worker (`[box] unhandled`, `[box] store unavailable`); los registros automáticos por petición están desactivados (`invocation_logs: false`) para no almacenar IPs ni metadatos de cada visita.

### Volver a una versión anterior (rollback)

1. Worker `cunabit` > `Implementaciones`.
2. Elige la última versión buena > `Revertir` (rollback). Es inmediato.
3. Corrige el problema en el código y haz push; ese push vuelve a publicar.

Alternativa desde el repo: `git revert <commit>` y push a `main`.

Los Durable Objects y su migración `v1` no se deshacen al revertir código; solo guardan datos de emparejamiento que caducan a los 5 minutos, así que no hay datos que recuperar.

## Dirección antigua

`cunabit.vercel.app` sigue existiendo como proyecto de Vercel, pero `vercel.json` solo redirige todo a la nueva dirección (redirección temporal 307, para poder cambiar el destino si algún día se usa un dominio propio).

La base Upstash Redis y sus variables `KV_REST_API_*` del proyecto de Vercel ya no se usan y se pueden borrar desde `Storage` en Vercel.

## Dominio propio (opcional)

`mabarcodev.com` ya está en Cloudflare. Para servir CUNABIT en un subdominio propio:

1. Worker `cunabit` > `Dominios` > `Añadir dominio` > `cunabit.mabarcodev.com`. Cloudflare crea el DNS y el certificado.
2. Cambia las URLs absolutas de `public/index.html`, `public/robots.txt` y `public/sitemap.xml`, y el destino de `vercel.json`.
3. Deja `workers_dev: true` o añade una redirección desde `workers.dev` para no romper enlaces guardados.
