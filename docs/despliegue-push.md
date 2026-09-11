# Despliegue de las notificaciones push

Este documento cubre **lo único del motor de push que no está en git**: el par de
claves VAPID.

Es hermano de `docs/despliegue-sync.md` y se lee igual, pero hay una diferencia de
fondo que conviene tener clara desde la primera línea:

> El sync se rompe hacia adentro y se arregla en minutos. **El push se rompe hacia
> afuera y se arregla en días.** Un secreto de sync mal puesto se corrige cambiando
> el secreto. Una clave VAPID mal rotada no se corrige cambiando nada: hay que
> volver a coger los 8 teléfonos.

---

## Aquí no hay ningún secreto de Vault nuevo

Es el error que más fácil se comete al leer los dos documentos seguidos, así que va
antes que nada.

`docs/despliegue-sync.md` te hizo crear dos secretos de Vault: `app_base_url` y
`cron_shared_secret`. **El drenaje de push reusa esos dos mismos.** No hay un tercer
secreto que crear, no hay un `push_base_url`, y no hay un secreto propio del
drenaje.

| Secreto de Vault | Lo creó | Lo usa el sync | Lo usa el push |
|---|---|---|---|
| `app_base_url` | plan 03-07, Fase 3 | sí, para `/api/cron/sync-feed` | sí, para `/api/push/drain` |
| `cron_shared_secret` | plan 03-07, Fase 3 | sí, cabecera del worker | sí, misma cabecera |

Si ya corriste `docs/despliegue-sync.md` en este entorno, **el lado de Vault está
hecho**. Comprobación, sin imprimir valores:

```sql
select name, length(decrypted_secret) as bytes
  from vault.decrypted_secrets
 where name in ('app_base_url', 'cron_shared_secret');
```

Dos filas = listo. Cero o una fila = vuelve a `docs/despliegue-sync.md` antes de
seguir aquí, porque el drenaje va a fallar exactamente igual que el sync y por la
misma razón.

La distinción que hace que esto no sea arbitrario: **Vault guarda el secreto con el
que Postgres te llama a ti. El entorno de Vercel guarda el secreto con el que tú
firmas el push hacia afuera.** Son dos direcciones distintas. Meter la clave privada
VAPID en Vault no la hace más segura, solo la pone donde nadie la lee.

---

## El par VAPID

### Generarlo, una sola vez

```bash
npx --no-install web-push generate-vapid-keys --json
```

`--no-install` es deliberado: usa el `web-push@3.6.7` que ya está en
`node_modules`, en vez de descargar al vuelo lo que el registry sirva hoy bajo ese
nombre.

Devuelve:

```json
{ "publicKey": "<87 caracteres base64url>", "privateKey": "<43 caracteres base64url>" }
```

Las longitudes son la comprobación rápida de que el par está bien: la pública es la
clave P-256 sin comprimir (65 bytes) y la privada es el escalar (32 bytes). Si te
llega algo de otra longitud, no es un par VAPID.

### Dónde va cada mitad

| Variable | Ámbito | Quién la lee |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública, entra al bundle | `pushManager.subscribe()` en el cliente, como `applicationServerKey` |
| `VAPID_PRIVATE_KEY` | secreto de servidor | `lib/push/envio.ts`, vía `readServerSecret()` |
| `VAPID_SUBJECT` | secreto de servidor (no es sensible, pero se lee igual) | `lib/push/envio.ts` |

Las tres van en **dos sitios, con el mismo valor**:

1. `.env.local` de cada máquina de desarrollo.
2. Vercel → Project Settings → Environment Variables, en **Production y Preview**.

Preview no es opcional. Un despliegue de preview con la pública vacía revienta en
build (`publicEnv()` es estricto) y con la pública de otro par genera suscripciones
que producción luego no puede firmar.

**Guarda el par también fuera de Vercel**, en el gestor de contraseñas del equipo.
Vercel deja de mostrar el valor de una variable después de crearla, y si pierdes la
privada la única salida es rotar, que es justamente lo que este documento existe
para evitar.

### `VAPID_SUBJECT` no puede ser localhost

Tiene que ser un `mailto:` real o una URL pública. El README de `web-push` lo
advierte explícito y Safari rechaza el JWT con `BadJwtToken`. En local va el mismo
`mailto:` que en producción: no hay ninguna ventaja en que sean distintos y sí el
riesgo de que el desarrollo "funcione" con algo que producción rechaza.

---

## UN SOLO PAR PARA TODOS LOS ENTORNOS

Esto rompe la regla sana de "cada entorno con sus propias credenciales", que
`cron_shared_secret` sí cumple. Es una excepción consciente y esta es la razón.

La `applicationServerKey` queda **grabada dentro de la suscripción** en el momento
en que el navegador la crea. No es un parámetro de la petición de envío: es parte
de la identidad de la suscripción. Consecuencias, en orden:

- Si en preview usas un par distinto, la suscripción que cree ese navegador **solo**
  es firmable con el par de preview. El mismo teléfono, en producción, aparece
  suscrito y no recibe nada.
- Con 34 unidades y 8 aseadores, el modo de fallo no es un error visible: es un
  aseador que "no le llega nada" y un admin que no sabe por qué.

El coste de la excepción es que el par de desarrollo es tan sensible como el de
producción. Se asume y se compensa guardándolo en el gestor de contraseñas, no en
un canal de chat.

---

## El modo de fallo cuando la pública y la privada no son del mismo par

Es el error más probable de todos, porque las dos mitades se copian por separado y
un despiste de una línea las descasa.

No falla en build. No falla al suscribirse. Falla en el envío, así:

```
WebPushError: Received unexpected response code
statusCode: 403
body: VapidPkHashMismatch
```

`VapidPkHashMismatch` significa literalmente: *la suscripción se creó con una clave
pública cuyo hash no corresponde a la privada con la que estás firmando*. Si ves ese
403, no busques el bug en el código de envío: son las dos mitades del par, que no
son del mismo par.

Comprobación de una línea, sin imprimir la privada:

```bash
node -e "
const wp=require('web-push');
const pub=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv=process.env.VAPID_PRIVATE_KEY;
console.log('pub', pub?.length, 'priv', priv?.length);
wp.setVapidDetails(process.env.VAPID_SUBJECT, pub, priv);
console.log('el par es internamente consistente');
"
```

`setVapidDetails` valida las longitudes y la forma, no que sean pareja. La prueba
real de que son pareja es un envío que no devuelva 403.

---

## Rotar el par: el procedimiento de emergencia

**Léelo entero antes de rotar. Rotar no es una operación reversible.**

Rotar la clave VAPID **invalida TODAS las suscripciones existentes, de golpe, sin
periodo de gracia y sin migración posible.** No hay forma de re-firmar una
suscripción vieja con un par nuevo: hay que crear una suscripción nueva desde cada
teléfono, y crearla requiere que la persona abra la app.

### Cuándo se rota

Solo con la privada comprometida. Nada más. No se rota "por higiene", no se rota al
cambiar de entorno y no se rota porque algo no funcione: si algo no funciona, es el
403 de la sección anterior y se arregla copiando bien la mitad que está mal.

### El procedimiento

1. **Avisa primero, rota después.** Los 8 aseadores tienen que saber, antes de que
   pase, que van a tener que abrir la app y volver a aceptar el permiso. Si rotas
   primero y avisas después, el aviso viaja por el canal que acabas de romper.
2. Genera el par nuevo y ponlo en Vercel (Production y Preview) y en `.env.local`.
3. Redespliega. Desde ese momento, **ninguna** suscripción existente sirve.
4. Cada aseador abre la PWA. El cliente detecta que su `applicationServerKey` ya no
   coincide, borra la suscripción vieja y crea una nueva.
5. **La rotación no termina en el paso 4.** Termina cuando el admin entra a
   `/aseadores` y ve que **las 8** suscripciones se renovaron. Mientras quede una
   sin renovar, esa persona no recibe absolutamente nada y no hay ninguna señal que
   se lo diga a ella.

### Por qué el paso 5 es el que importa

Es el mismo patrón que `docs/despliegue-sync.md` documenta para los secretos de
Vault: el sistema puede estar roto y decir que todo va bien. Aquí el envío a una
suscripción muerta devuelve `410 Gone`, el código la marca como caída, y el aseo
sigue su curso sin notificación. Nadie grita. La única señal es el panel de
`/aseadores`, y hay que ir a mirarlo a propósito.

En iOS hay un agravante medido: si el aseador **denegó** el permiso alguna vez, no
hay forma programática de volver a pedirlo. Toca desinstalar la PWA de la pantalla
de inicio y volver a instalarla. Por eso el paso 1 no es cortesía: un aseador que
recibe un prompt de permiso sin contexto es un aseador que le da a "No permitir", y
eso convierte una rotación de una tarde en una visita presencial.

---

## Nota sobre este archivo

No contiene ningún valor real de clave y no debe contenerlo nunca. Los marcadores
`<87 caracteres base64url>` y `reemplazame@ejemplo.com` son literalmente eso.
