# Squid Game — Tablero de participantes

Aplicación estática para GitHub Pages con Supabase: 20 participantes, fotos, eliminaciones, rondas, panel privado y actualización en tiempo real.

## Publicación paso a paso

1. En Supabase abre **Project Settings > API** (o **Connect > App Frameworks**, según la interfaz). Copia la **Project URL** y la **publishable key** (`sb_publishable_...`) o la antigua clave `anon`. **Nunca copies una secret key ni `service_role`.**
2. Abre `config.js` y reemplaza `PEGA_AQUI_TU_PROJECT_URL` y `PEGA_AQUI_TU_PUBLISHABLE_KEY`. Guarda el archivo.
3. En GitHub crea el repositorio público `squid-game` bajo la cuenta `Dvillami`, si aún no existe.
4. En el repositorio usa **Add file > Upload files** y sube **todos los archivos de esta carpeta** directamente a la raíz del repositorio (no la carpeta contenedora ni el ZIP). Haz clic en **Commit changes**.
5. En **Settings > Pages**, selecciona **Deploy from a branch**, rama **main**, carpeta **/(root)**, y guarda.
6. Espera a que GitHub publique `https://dvillami.github.io/squid-game/` y entra a `https://dvillami.github.io/squid-game/admin.html` para iniciar sesión.

## Supabase

Requiere las tablas `public.participants`, `public.game_settings`, `public.elimination_history`, `public.admin_users`, las políticas RLS de administrador y el bucket público `participant-photos` con políticas de escritura para administradores que ya configuramos.

### Realtime

Para recibir cambios inmediatamente, en Supabase busca **Database > Publications** (o **Database > Replication**, según versión) y activa `participants` y `game_settings` en la publicación `supabase_realtime`. Si no está activado, el tablero sigue comprobando los cambios cada 15 segundos y al regresar a la pestaña.

### Acceso público

El bucket público permite **ver** las fotografías sin iniciar sesión. Evita subir imágenes privadas o fotos sin consentimiento. Las claves publicables son aptas para el navegador porque la seguridad real depende de las políticas RLS. La tabla `admin_users` no debe tener políticas públicas de escritura.

## Nota sobre sonido

El navegador suele bloquear el sonido hasta que el espectador pulse **Activar sonido**. El efecto incluido es original y sintetizado, no un audio extraído de la serie.

## Control desde ChatGPT

No está conectado aún. Será una segunda etapa con un plugin y una función segura de servidor; **nunca** se debe incluir una clave de servicio de Supabase en este repositorio.
