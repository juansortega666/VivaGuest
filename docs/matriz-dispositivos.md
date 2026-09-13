# Matriz de dispositivos y procedimientos manuales de avisos

> Fase 5, plan `05-17`. Este documento **no es complementario** a la suite E2E: es
> la mitad que la suite no alcanza, y la única que dice algo sobre iPhone.

## Por qué existe este documento

Playwright solo ejecuta service workers en navegadores basados en Chromium. El
proyecto WebKit no puede, así que **no hay ni una aserción automatizada sobre
Safari ni sobre iOS en todo el repositorio**, y no es algo que se arregle
añadiendo un proyecto a `playwright.config.ts`. La entrega real en un iPhone pasa
por APNs contra un dispositivo físico.

Lo que sí está automatizado vive en `e2e/push-instalacion.spec.ts` (casos E1 a
E6). Su cabecera dice explícitamente lo que no cubre.

## Estado de los seis casos automatizados

| Caso | Qué mide | Estado |
|---|---|---|
| E1 | Con el permiso concedido queda una suscripción viva en la base | ⛔ Pendiente por el navegador de pruebas (ver abajo) |
| E2 | Un push real entregado al service worker produce la notificación | ✅ Verde |
| E3 | Un payload ilegible **también** produce notificación | ✅ Verde |
| E4 | El clic reusa la ventana abierta | ⛔ No existe el comando en el protocolo de DevTools |
| E5 | El manifest declara `standalone`, iconos 192 y 512, sin `orientation` | ✅ Verde |
| E6 | El service worker se sirve sin caché | ✅ Verde |

### Por qué E1 está pendiente, medido el 2026-09-12

El camino funciona hasta el último paso. Con un contexto **persistente** (los
contextos normales de Playwright son de incógnito, y Chrome no implementa la API
de push en incógnito) el permiso queda concedido y `pushManager.subscribe()`
devuelve una suscripción real. Pero el endpoint que emite ese navegador es
`https://jmt17.google.com/fcm/send/…`, el servicio **antiguo**, porque el
Chromium que empaqueta Playwright no lleva las claves de API de Google. La
allowlist `HOSTS_DE_PUSH` de `lib/domain/suscripcion.schema.ts` solo admite
`fcm.googleapis.com`, `push.apple.com`, `push.services.mozilla.com` y
`notify.windows.com`, así que `registrarSuscripcion` lo rechaza y la tabla queda
vacía.

**La aplicación se comporta bien. El navegador de pruebas no es representativo.**
Un Chrome de verdad emite `fcm.googleapis.com` y pasa la allowlist.

Se desbloquea con `npx playwright install chrome` y corriendo ese caso con
`channel: 'chrome'`. Es una instalación en la máquina, así que es decisión del
desarrollador. Lo que **no** se hace: ampliar la allowlist para que un test pase
—es la defensa que decide a qué host escribe el servidor— ni insertar la fila a
mano y afirmar que está —eso mide el `insert` del test, no la aplicación—.

### Por qué E4 está pendiente

El protocolo de DevTools tiene `ServiceWorker.deliverPushMessage`, pero no tiene
ningún comando que dispare `notificationclick`: no hay forma de tocar desde fuera
una notificación que pinta el sistema operativo. Llamar a `manejarClick()`
directamente desde el test sería repetir lo que ya hace
`lib/push/sw-handlers.test.ts` disfrazado de E2E. Queda cubierto por **M2**.

## Procedimientos manuales

Para probar desde un teléfono hace falta una URL HTTPS: `localhost` no le sirve
al móvil. Túnel temporal:

```
brew install cloudflared
PORT=3100 npm run start
cloudflared tunnel --url http://localhost:3100
```

Y apuntar `APP_BASE_URL` en `.env.local` a la URL que imprime el túnel. **Cambia
en cada arranque**, así que la prueba conviene hacerla de corrido.

### M1 — Instalación y concesión de permiso (camino feliz)

1. Abrir el enlace de onboarding en Safari (iOS) o Chrome (Android). **No** en el
   navegador embebido de WhatsApp.
2. Instalar en la pantalla de inicio (iOS: Compartir → Añadir a inicio).
3. Abrir la app **desde el icono**, no desde el navegador.
4. Antes de tocar nada: salir de la pantalla sin aceptar y comprobar que **no
   aparece ningún diálogo del sistema**. En iOS una denegación es irreversible
   sin reinstalar, así que el permiso no se puede quemar por accidente.
5. Tocar `Activar los avisos` y conceder.
6. Comprobar en `/aseadores` que ese aseador figura con avisos.

### M2 — Entrega de punta a punta, con el teléfono bloqueado

1. Bloquear el teléfono.
2. Confirmar un aseo para ese aseador desde el dashboard del admin.
3. El aviso llega a la pantalla de bloqueo.
4. **Comprobar el contenido: lleva apartamento y fecha, y NO lleva código de
   acceso ni nombre de huésped.** Si aparece alguno de los dos es un fallo de
   seguridad, no cosmético.
5. Tocar el aviso: aterriza en el aseo, y **no** abre una segunda ventana de la
   app (esto es lo que E4 no puede medir).

### M3 — Modo avión y cola de la plataforma

1. Poner el teléfono en modo avión.
2. Confirmar un aseo desde el admin.
3. Quitar el modo avión: el aviso llega con retraso.
4. Repetir dejando pasar más de 4 horas (`TTL_SEGUNDOS`): el aviso **no** llega,
   y eso es lo correcto.

### M4 — Denegación y recuperación

**En un dispositivo de pruebas, NUNCA en el de un aseador real.** En iOS la
denegación es irreversible sin borrar el icono y reinstalar.

1. Denegar el permiso.
2. Comprobar que el banner dice que están bloqueados y ofrece los pasos.
3. Recuperar: iOS, borrar el icono y reinstalar; Android, Ajustes → Aplicaciones
   → VivaGuest → Notificaciones.

### M5 — Revocación por push silencioso (destructivo, OPCIONAL)

Mide cuántos fallos tolera el push service antes de revocar, número que ninguna
documentación oficial da. Destruye la suscripción del dispositivo donde se corra.

### M6 — La matriz

M1 y M2 se ejecutan en **cada modelo y versión que use un aseador real**, no en
uno representativo. El supuesto de que los ocho usan Android es **probable, no
inventario**: levantar marca, modelo y versión de los ocho equipos es tarea
previa al piloto de la Fase 8.

| Aseador | Modelo | Versión de SO | Instalada | Permiso | Aviso recibido | Fecha |
|---|---|---|---|---|---|---|
| Juan (equipo propio, sesión de prueba) | iPhone | iOS 18.7 · Safari 26.6.1 | Sí | Concedido | **Sí** | 2026-09-12 |
| _(los ocho aseadores reales: sin levantar)_ | | | | | | |

> La segunda fila está vacía a propósito. Una fila inventada es peor que
> ninguna: haría creer que la fase se validó en el teléfono de alguien cuando no.

### Lo que esa única fila ya demostró, el 2026-09-12

Primera entrega real de punta a punta, sobre el túnel y contra APNs:

- La app se instala en la pantalla de inicio y abre en modo standalone.
- El permiso se concede desde el botón, y la suscripción queda guardada:
  endpoint de `web.push.apple.com`, `soporta_declarativo = true`.
- Confirmar un aseo desde el admin encoló la notificación, el dispatcher la
  drenó, y Apple respondió `201` con 3 de 3 entregadas.
- **El aviso apareció en el iPhone.**
- La aseadora tocó `Empecé` desde el teléfono y el aseo pasó a `en_curso` en la
  base.

Y destapó **dos bugs que ninguna suite había cazado**, los dos mortales para
NOTIF-01 y los dos arreglados ese mismo día:

1. El alta de la suscripción fallaba SIEMPRE con 42501 (ver migración 22).
2. El middleware redirigía `POST /api/push/drain` a `/login`, que contesta 405 a
   un POST. La notificación se quedaba en `pendiente` para siempre, sin un solo
   error visible en ninguna parte.

La lección, escrita donde se va a volver a leer: **esta fase no se podía validar
sin un teléfono**. Los 112 tests en verde convivían con dos fallos que impedían
que un aviso llegara.
