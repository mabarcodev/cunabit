# Cunabit — deploy en Vercel

Monitor de bebé P2P (WebRTC) con buzón de señalización efímero.
Esta carpeta es la versión adaptada para **Vercel**.

## Estructura

```
cunabit-vercel/
├── index.html        # App estática (idéntica a la original)
├── api/
│   └── box.js        # Función serverless (signaling box) en /api/box
├── vercel.json       # Cabeceras de cache
├── package.json
└── .gitignore
```

El front llama a `/api/box`. Vercel mapea automáticamente
`api/box.js` a esa ruta — no hace falta `redirects`.

## Deploy desde GitHub

1. Sube esta carpeta a tu repo (`mabarcodev/CUNABIT-VERCEL`):

   ```bash
   cd cunabit-vercel
   git init
   git add .
   git commit -m "feat: initial Vercel deploy"
   git branch -M main
   git remote add origin https://github.com/mabarcodev/CUNABIT-VERCEL.git
   git push -u origin main
   ```

2. En [vercel.com/new](https://vercel.com/new), importa el repo.
3. Framework Preset: **Other** (Vercel detecta `index.html` y `api/`).
4. Deploy. La URL final servirá la app y `/api/box`.

## Deploy local con Vercel CLI (opcional)

```bash
npm i -g vercel
cd cunabit-vercel
vercel        # primer deploy: pregunta proyecto
vercel --prod # deploy a producción
```

## Notas

- **Estado en memoria**: el `Map` del signaling vive en el contenedor
  serverless. Funciona en caliente, pero si Vercel arranca instancias
  frías distintas, el monitor puede tardar un par de reintentos en
  encontrar la oferta. La lógica del cliente ya reintenta.
- **HTTPS obligatorio**: WebRTC y `getUserMedia` requieren HTTPS.
  Vercel sirve TLS por defecto, así que no hay nada que configurar.
- **WiFi compartida**: ambos móviles deben estar en la misma red
  local; el vídeo va P2P, no por Vercel.
