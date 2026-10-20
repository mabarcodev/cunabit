# Configuración de producción en Vercel sin CLI

No necesitas instalar Vercel CLI. Toda la configuración se puede hacer desde el dashboard de Vercel y GitHub.

## 1. Repositorio

Usa el repositorio canónico de CUNABIT:

```txt
https://github.com/mabarcodev/cunabit
```

En Vercel, el proyecto `cunabit.vercel.app` debe estar conectado a ese repositorio y rama `main`.

## 2. Redis/KV para emparejamiento estable

CUNABIT necesita un buzón temporal para intercambiar oferta/respuesta WebRTC cifradas. En local puede usar memoria, pero en producción conviene usar Redis/KV para que todas las funciones serverless lean el mismo buzón.

Opción recomendada en Vercel:

1. Abre el proyecto en Vercel.
2. Ve a `Storage` o `Marketplace`.
3. Añade `Upstash Redis` al proyecto.
4. Conecta la base al entorno `Production`.
5. Comprueba que Vercel creó estas variables:

```txt
KV_REST_API_URL
KV_REST_API_TOKEN
```

También valen estas si Upstash las crea con su nombre propio:

```txt
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

## 3. Variables de entorno

En `Settings > Environment Variables`, añade o confirma:

```txt
CUNABIT_ALLOWED_ORIGIN=https://cunabit.vercel.app
CUNABIT_KV_PREFIX=cunabit:box
```

`CUNABIT_KV_PREFIX` evita mezclar claves si algún día reutilizas el mismo Redis para otro proyecto.

## 4. Analytics

Para contar visitas:

1. Entra en el proyecto en Vercel.
2. Ve a `Analytics`.
3. Activa `Web Analytics`.

El HTML ya incluye el script necesario.

## 5. Deploy

Después de conectar Redis/KV y variables:

1. Haz push a `main`.
2. Vercel desplegará automáticamente.
3. Abre `https://cunabit.vercel.app/`.
4. Prueba con dos móviles en la misma WiFi o hotspot.

## 6. Comprobación

Antes de publicar:

```bash
npm run check
```

Opcionalmente, si tienes las variables de producción cargadas en tu terminal, puedes ejecutar:

```bash
npm run check:prod
```

Este paso opcional no usa Vercel CLI; solo comprueba que las variables esperadas existen.

## Nota de rendimiento

Redis/KV solo participa durante el emparejamiento. La carga inicial de la web y el vídeo/audio P2P no pasan por Redis/KV. El impacto normal es solo unos milisegundos extra al crear o leer el código temporal.

## Runbook: el emparejamiento falla con error de servidor

Síntoma en la app: `Error: Servidor: 503 — el servicio de emparejamiento no está disponible` (versiones anteriores mostraban `Servidor: 500 server_error`).

1. Confirma que es el almacén. Una petición con código inválido debe responder `400 invalid_code`; si responde `503 store_unavailable` (o `500` en versiones antiguas), Redis/KV está configurado pero no responde:

   ```bash
   curl -s -X POST -H "content-type: application/json" -d '{"action":"get","code":"bad","role":"offer"}' https://cunabit.vercel.app/api/box
   ```

2. Mira la causa en Vercel, `Logs`, filtrando por `[box]`:
   - `redis unreachable` con `ENOTFOUND`: la base ya no existe. Upstash archiva las bases gratuitas tras 30 días o más sin actividad.
   - `redis failed` con `401` o `WRONGPASS`: token caducado o variables de otra base.
   - `redis unreachable` con `TimeoutError`: Upstash lento o caído; revisa su página de estado.
3. En Vercel, `Storage`: restaura la base desde la consola de Upstash, o crea una nueva y conéctala al proyecto en el entorno `Production`.
4. En `Settings > Environment Variables`, deja un solo par válido. `/api/box` prefiere `KV_REST_API_*` sobre `UPSTASH_REDIS_REST_*`: si quedan variables `KV_*` de la base antigua, seguirán ganando aunque la nueva cree `UPSTASH_*`.
5. Los cambios de variables no se aplican a despliegues ya hechos: `Deployments`, último despliegue de `main`, `Redeploy`.
6. Repite el paso 1: tiene que responder `400 invalid_code`. Después prueba un emparejamiento real con dos dispositivos.

Para evitar que vuelva a pasar: el plan gratuito de Upstash archiva por inactividad. Si CUNABIT pasa temporadas sin uso, basta con un emparejamiento (o la petición del paso 1) cada pocas semanas para mantenerla activa; si no, valora un plan de pago.
