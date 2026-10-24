INSTALACIÓN — VIDEOS DEL SUPERVISOR

1. En Supabase > SQL Editor, ejecutar videos_setup.sql UNA VEZ. Requiere que ya exista admin_users(user_id).
2. Subir a la RAÍZ del repositorio GitHub Pages estos archivos:
   admin.html (reemplazar)
   supervisor.js (reemplazar: basado en supervisor_solo_por_llamada.zip)
   videos.html, videos.css, videos.js, videos-admin.js (nuevos)
3. NO reemplazar config.js, shared.js, supervisor.html, style.css ni funciones Edge.
4. Iniciar sesión como administrador en admin.html; agregar videos con sus enlaces de YouTube.
5. Abrir supervisor.html e iniciar la conversación. Abrir videos.html en otra pestaña del MISMO navegador y activar pantalla/sonido mediante el botón. Poner videos.html en la pantalla externa. Cambiar a la pestaña del Supervisor para hablarle (en algunos navegadores esto puede impedir la reproducción o el micrófono en segundo plano).
6. Decir «Supervisor, reproduce [nombre del video]», «Supervisor, pausa el video» o «Supervisor, detén el video».

LIMITACIONES REALES:
- YouTube puede bloquear autoplay con sonido aunque se pulse el botón de activación, especialmente iOS/Safari y al cambiar pestañas.
- En iPhone/iPad, el navegador puede suspender la pestaña en segundo plano; dos pestañas en el mismo dispositivo NO garantizan reproducción y conversación simultáneas. Para máxima fiabilidad usar un portátil con dos ventanas o un segundo dispositivo.
- Algunos videos no permiten incrustación y la publicidad de YouTube no puede controlarse.
- Solo administradores autenticados pueden acceder al catálogo y controlar reproducción (RLS). La página de proyección debe estar autenticada en el mismo origen.
- No se han ejecutado pruebas contra la base de datos real ni el micrófono real.
