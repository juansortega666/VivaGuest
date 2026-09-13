# RETOMAR — punto de pausa del 2026-09-12 (noche)

> Escribe **`RETOMAR`** en una sesión nueva, parada en la raíz del repo.
> Este archivo primero. Después `.planning/STATE.md`.

---

## LO PRIMERO: DÓNDE QUEDÓ LA CONVERSACIÓN

Se estaba planeando la **Fase 7 (Financiero)**. El research está hecho y
commiteado (`.planning/phases/07-financiero/07-RESEARCH.md`, 1412 líneas), y el
contexto con las decisiones del dueño también (`07-CONTEXT.md`).

**Falta una sola cosa para poder planear: cuatro decisiones del dueño.** Se le
iban a preguntar y se interrumpió para dormir. Están abajo, en "LAS CUATRO
PREGUNTAS". Con esas respuestas se lanza `/gsd-plan-phase 7` y sigue solo.

---

## LO QUE PASÓ HOY, Y POR QUÉ IMPORTA

Se probó la aplicación **en un iPhone real por primera vez**. Esa sola prueba
destapó **dos bugs que los 112 tests en verde no veían, y cada uno bastaba por
sí solo para que ningún aseador recibiera jamás un aviso.**

1. **El alta de la suscripción fallaba siempre con 42501.** El `upsert on
   conflict` desde el cliente necesita UPDATE sobre `user_id`, que la migración
   16 había revocado a propósito. Postgres lo exige aunque no haya conflicto.
   Arreglado con la migración 22 (función definer). Seis aserciones pgTAP nuevas,
   una de ellas señuelo.
2. **El middleware redirigía `POST /api/push/drain` a `/login`,** que contesta
   405 a un POST. La notificación se quedaba en `pendiente` para siempre, sin un
   error visible en ninguna parte. El matcher excluía `api/cron` pero no
   `api/push`.

Y un tercero, menor pero que costó un diagnóstico entero: **las aseadoras de la
semilla de desarrollo no podían entrar**, porque su `role` estaba solo en
`profiles` y no en `raw_app_meta_data`, que es de donde el middleware lo lee. El
síntoma era "le doy a Entrar y no pasa nada", y se le echó la culpa a Safari.

**La lección, escrita para que no se repita: la Fase 5 no se podía validar sin un
teléfono.** Todo verde y dos fallos mortales conviviendo.

### Qué quedó probado en el iPhone (iOS 18.7, Safari 26.6.1)

Instalación en pantalla de inicio, permiso concedido, suscripción guardada
contra `web.push.apple.com`, **aviso entregado y visto**, y el aseo pasando a
`en_curso` desde el teléfono. Apple respondió 201, 3 de 3 entregadas.

**Lo que NO se probó todavía: la Fase 6 desde el teléfono.** El checklist por
cuartos, la foto de evidencia, terminar el aseo, y el reporte de daño o gasto.
Quedó un aseo en curso en la base para retomarlo. Es lo primero que conviene
hacer mañana, antes de construir encima.

---

## LAS CUATRO PREGUNTAS QUE BLOQUEAN LA FASE 7

Salen del research. Ninguna la puede tomar un agente: son de negocio.

### 1. El mes que termina en fin de semana (BLOQUEA EL SCHEMA)

En **8 de cada 24 meses** el mes termina sábado o domingo. Cerrando el último día
hábil quedan **5 días huérfanos en 2026 y 7 en 2027**: aseos que ocurren después
del cierre de su mes y que hoy no pagaría nadie.

- **(a)** El periodo termina el día del cierre. "Enero" va del 1 al 30 y el 31 es
  de febrero. **Si se elige esta, la cabecera necesita `periodo_desde` y
  `periodo_hasta` DESDE EL DÍA UNO**; añadirlas después de cerrar meses reales es
  caro.
- **(b)** Cerrar contando días que aún no ocurrieron. Inaceptable: paga por
  adelantado.
- **(c, recomendada por el research)** El periodo es el mes calendario y el
  cierre se mueve al **primer día hábil del mes siguiente**. Cierra el mes
  completo sin inventar nada. Contradice la letra de FIN-03, así que necesita que
  el dueño confirme que la intención era "cerrar el mes" y no "cerrar ese día".

### 2. ¿Sobrevive el recibo del gasto? (BLOQUEA UN CRITERIO YA DECIDIDO)

D7-2 exige llegar desde cada gasto a su foto. RET-06 borra las fotos **a los 30
días**, y `cleaning_photos` no distingue política por `kind`. O sea: **el enlace
ya está roto el mes siguiente**, no dentro de seis meses.

Las fotos de gasto son **~3% del volumen**. Eximirlas cuesta poco.

Recomendación del research: alinear `kind='gasto'` con los 6 meses del resto.
**Pase lo que pase, la decisión tiene que quedar escrita en `STATE.md` bajo
consecuencias para la Fase 9**, o la purga va a borrar los recibos sin saber que
rompía este requisito.

### 3. La fuga de la tarifa al huésped (SEGURIDAD, y está MEDIDA)

**Un aseador puede consultar hoy cuánto se le cobra al huésped.** Medido
impersonando a la aseadora sembrada: `select max(tarifa_huesped) from
public.cleanings` devuelve `90000`. Son dos superficies:

- La de `cleanings`: **ningún código la lee** (verificado por grep). Cerrarla es
  casi gratis.
- La de `properties`, en la ventana -1..+7: **la usa el CRUD del admin**
  (`lib/data/apartamentos.ts:106`). Cerrarla obliga a rehacer el embed
  `properties(...)` de `lib/data/aseo-aseador.ts`.

Opciones: cerrar solo la fácil y anotar la otra como deuda; cerrar las dos; o
partir las columnas de dinero a una tabla aparte (esto último es v2).

### 4. El aseo que quedó pendiente al cerrar

Un aseo del día 28 que sigue sin completarse el día del cierre no entra en ese
mes, y como su fecha es del mes cerrado, **no entrará nunca en ninguno**.

Recomendación del research: mantener la pertenencia por fecha (es coherente con
el resto del sistema) **y mostrarle al admin, antes de cerrar, cuántos aseos del
periodo quedaron sin computar y cuáles**. Cuesta una columna y convierte un
agujero silencioso en una lista que alguien puede resolver antes de pagar.

### Una quinta, menor, que se puede resolver sin el dueño

Por dónde llega la alerta del 70% de Storage (RET-07). Recomendación: banner
persistente en `/finanzas` y `/operacion`. Cumple "ve" y "alerta" sin tocar el
enum de notificaciones, y se ve aunque el push falle.

---

## OTRO PENDIENTE QUE EL DUEÑO PIDIÓ

Quiere un **documento de una página para ubicarse en el proyecto**, con el
formato de uno que usa en otro proyecto (`~/Downloads/lider_v1_bloques.html`):
pestañas por bloque, y dentro de cada una las funcionalidades con código, una
línea de contexto y bullets de alcance.

Quedaron dos preguntas sin responder: (1) si lo quiere solo con el alcance, como
el original, o con el estado encima (hecho / a medias / pendiente); y (2) si lo
quiere como archivo local o como página web con link, para abrirla desde el
celular.

---

## CÓMO LEVANTAR EL ENTORNO

```
open -a Docker                                  # esperar a que arranque
npx supabase start -x studio,logflare,vector,imgproxy,edge-runtime
npm ci
npm run db:reset
```

`logflare` (así lo llama el CLI, **no** `analytics`) falla su healthcheck en esta
máquina y tumba a los demás contenedores. `-x analytics` no hace nada.

**`.env.local` no está en el repo y la copia de respaldo YA NO EXISTE.** Se
regenera: las llaves salen de `npx supabase status`, y el par VAPID de
`npx --no-install web-push generate-vapid-keys --json`. Hoy rotar no cuesta nada
si no hay suscripciones vivas; el día que las haya, rotar las invalida todas sin
período de gracia.

Los dos secretos de Vault **se borran en cada `db:reset`** y hay que recrearlos,
o el disparo inmediato del push no sale (queda en `pendiente` y lo recoge el
cron):

```sql
select vault.create_secret('<el CRON_SHARED_SECRET de .env.local>', 'cron_shared_secret');
select vault.create_secret('<el origen de la app>', 'app_base_url');
```

### Para levantar la app

```
NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL=1 npm run build
NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL=1 PORT=3001 npm run start
```

**Esa variable no es opcional.** Sin ella, siete specs de `calendario.spec.ts`
salen rojos: es la concesión que permite validar feeds contra `127.0.0.1`.

### Para probar desde un teléfono

```
cloudflared tunnel --url http://localhost:3001
```

Y apuntar `APP_BASE_URL` en `.env.local` **y el secreto `app_base_url` de Vault**
a la URL que imprime. Cambia en cada arranque, así que la prueba se hace de
corrido.

Credenciales de desarrollo: `admin@vivaguest.test`, `maria@vivaguest.test`,
`luz@vivaguest.test`, todas con `VivaGuest2026!`.

Ojo: los 39 apartamentos de la semilla son placeholders **sin tarifas y
desactivados**, así que no se les puede crear un aseo. Para probar hay que
completarle a uno `tarifa_huesped`, `pago_aseador`, `responsable_id` y
`is_active`.

---

## SUITES, MEDIDAS EL 2026-09-12 A LAS 21:15

| Capa | Resultado |
|---|---|
| E2E (Chromium) | **112 pasando, 1 saltado** (E4, con su razón escrita) |
| pgTAP | 11 archivos, **275** aserciones, PASS |
| Unitarios | 55 archivos, **1006** tests |
| Integración | 19 archivos, **169** tests |
| `tsc --noEmit` | limpio |
| `ci:arch` | los tres scripts OK |

---

## TRAMPAS MEDIDAS QUE VAN A VOLVER A MORDER

1. **La suite E2E contra el proyecto equivocado.** `reuseExistingServer` está en
   `true`: si otro Next ocupa el 3000, Playwright reusa el servidor ajeno y corre
   todo contra la app equivocada. Salida: `PLAYWRIGHT_PORT=3200 npm run test:e2e`.
2. **La suite necesita `npm run db:reset` antes.** Sin eso, dos aserciones de
   `operacion.spec.ts` caen por colisión contra el índice único parcial. Y aun
   con reset hay **flake ocasional en los toasts**: se vio una corrida con dos
   rojos que en la siguiente pasaron sin tocar nada.
3. **El Chromium por defecto de Playwright no implementa notificaciones.** Es
   `chromium-headless-shell`. Por eso el proyecto fija `channel: 'chromium'`, y
   el caso E1 corre con `channel: 'chrome'` (requiere
   `npx playwright install chrome`).
4. **Chrome no tiene Push API en incógnito**, y todo contexto normal de Playwright
   lo es. El error dice "permission denied" con el permiso concedido.
5. **`max-w-<talla>` compila a cuatro u ocho píxeles.** Todo ancho nuevo va como
   `--container-<nombre-propio>`. `npm run ci:arch` lo vigila.
6. **Los guardarraíles de CI funcionan por regex.** Un comentario que mencione un
   token prohibido hace fallar la revisión aunque el código esté bien.
7. **`revalidatePath` cuelga el navegador** en las Server Actions de `(admin)`.
   El refresco se pide con `router.refresh()` desde el cliente.
8. **`coalesce` y `nullif` NO se califican con `pg_catalog`**: son construcciones
   del lenguaje, no funciones, y calificarlas da "function does not exist". En
   una función con `search_path = ''` esto muerde.
9. **En pgTAP, una escritura dentro de la subconsulta de la aserción no la ve la
   aserción**: el `select` externo lee el snapshot anterior. La escritura va en su
   propia sentencia.

---

## ESTADO DE LAS FASES

| Fase | Estado |
|---|---|
| 1 a 4 | Completas |
| **5 — Push e instalación** | **Completa y VALIDADA EN UN IPHONE REAL.** Los 17 planes, salvo el asistente `/instalar`, que el dueño descartó |
| **6 — PWA del aseador** | 10 de 10 planes. **Sin probar en teléfono todavía** |
| **7 — Financiero** | Research y contexto hechos. **Bloqueada por las cuatro preguntas de arriba** |
| 8, 9 | Sin empezar |

El asistente `/instalar` y sus cinco capturas están **descartados por decisión
del dueño**, dicha varias veces. La ruta existe y no da 404. No volver a
proponerlo.
