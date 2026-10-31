# Cuentas de CubicLauncher

Frontend Vue para `https://accounts.cubiclauncher.org`, conectado al Worker CubAuth en `https://auth.cubiclauncher.org`.

El acceso y el registro se hacen con Discord. Tras ingresar, el usuario puede elegir/cambiar su nombre, personalizar la skin y generar una contraseña temporal para el launcher: un token de un solo uso válido una hora.

La sesión web queda en `sessionStorage` de la pestaña. Los tokens del launcher solo se mantienen en memoria y desaparecen al recargar o al vencer. El callback OAuth usa un ticket temporal ligado al secreto de la pestaña que inició el flujo.

## Desarrollo

```sh
bun install --frozen-lockfile
bun run dev
```

Para usar el Worker local, configurá `.env.local`:

```dotenv
VITE_AUTH_API_URL=http://localhost:8787
```

Vite usa un proxy `/api` durante desarrollo. En producción, el navegador llama directamente al Worker. El dominio del frontend debe estar en `WEB_ORIGINS` y en `ACCOUNT_URL` del Worker.

## Comprobaciones

```sh
bun run build
bun run test:unit -- --run
bun run test:e2e
```

Los tests E2E simulan Discord y la API e incluyen login, registro, generación de tokens, historial de nombres, skins y vistas móviles.

## Publicación

La configuración existente de Vercel sigue siendo válida. La única variable pública es:

```dotenv
VITE_AUTH_API_URL=https://auth.cubiclauncher.org
```

No pongas secretos de Discord en variables `VITE_*`. La política CSP de `vercel.json` permite la API y las texturas de `auth.cubiclauncher.org`. Si cambiás ese dominio, actualizá también CSP.

El procedimiento completo del Worker y la web está en [la guía de despliegue de CubAuth](../CubAuth/DEPLOY.md).
