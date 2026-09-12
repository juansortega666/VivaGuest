# RETOMAR — punto de pausa del 2026-09-12

> Escribe **`RETOMAR`** en una sesión nueva de Claude Code, parada en la raíz del repo.
> Este archivo es lo primero que hay que leer. Después `.planning/STATE.md`.

---

## ANTES QUE NADA, SI CLONASTE DE CERO

La carpeta anterior se borró a propósito. Todo el código está en GitHub, pero **hay cosas que
git no guarda** y sin ellas la app no arranca:

1. **`.env.local` no está en el repo** (es correcto, son secretos). Hay una copia en
   `~/vivaguest-env-local-20260912.txt`. Cópiala a la raíz del proyecto como `.env.local`.
   - Si esa copia se perdió: las llaves de Supabase local salen de `npx supabase status`, y el
     par VAPID se regenera con `npx --no-install web-push generate-vapid-keys --json`.
     **Regenerar el par VAPID hoy no cuesta nada porque no hay ni una suscripción viva.**
     El día que haya aseadores suscritos, sí: rotar invalida todas sin período de gracia.
   - `APP_BASE_URL` hay que reapuntarla a donde esté sirviendo la app.
2. **`npm ci`** para reinstalar dependencias.
3. **El stack local de Supabase**, con una salvedad medida en esta máquina:
   ```
   npx supabase start -x studio,logflare,vector,imgproxy,edge-runtime
   ```
   `logflare` (que el CLI llama así, **no** `analytics`) falla su healthcheck aquí y tumba a
   todos los demás contenedores con él. `-x analytics` no hace nada: el nombre correcto es
   `logflare`.

---

## DÓNDE VA EL PROYECTO

| Fase | Estado |
|---|---|
| 1 a 4 | Completas y mergeadas |
| **5 — Notificaciones push e instalación de la PWA** | **15 de 17 planes.** Mergeada a `main` sin verificar |
| **6 — PWA del aseador** | **10 de 10 planes.** Mergeada. Sin verificación en teléfono |
| 7 — Financiero | Discutida en conversación, **sin planear** |
| 8, 9 | Sin empezar |

Todo está en `main`, sincronizado con GitHub. `main` = `74776da`.

---

## LO QUE FALTA, EN ORDEN

### 1. El 404 de `/instalar` — es lo único que se ve roto en la app

Cuatro enlaces del banner del aseador llevan a `/instalar`, y **esa página no existe**. El más
usado es el de "ábrelo en Safari", porque el link de onboarding se manda por WhatsApp.

Lo bloquea **una acción humana sin sustituto**: cinco capturas de pantalla en
`public/instalar/`, con estos nombres exactos:

| Archivo | Dónde se toma | Qué muestra |
|---|---|---|
| `ios-1-compartir.png` | iPhone, Safari (pestaña normal, no la PWA) | La barra inferior, con el botón Compartir señalado |
| `ios-2-anadir-inicio.png` | iPhone, hoja de Compartir abierta | La fila "Añadir a inicio" |
| `ios-3-anadir.png` | iPhone, diálogo abierto | El botón "Añadir", arriba a la derecha |
| `android-1-menu.png` | Android, Chrome | El menú de tres puntos |
| `android-2-instalar.png` | Android, menú desplegado | La fila "Instalar aplicación" |

Formato: PNG de 560 px de ancho, **recortes y no pantallas completas** (una captura entera
reducida a 280 px deja el botón en doce píxeles y no enseña nada), con el control marcado con un
rectángulo de 2 px en el coral de la marca, alrededor y no encima. Sin datos personales visibles:
ni contactos, ni otras pestañas, ni notificaciones en la barra. Eso no lo revisa ningún test.

También hacen falta **la versión exacta de iOS y la fecha**, que van impresas al pie. Es lo único
que dirá dentro de un año si las capturas siguen sirviendo cuando Apple mueva un botón.

Se pueden mandar **sin recortar**: el recorte, el escalado y el rectángulo se hacen con script.

El plan `05-12-PLAN.md` **prohíbe explícitamente** dibujar sustitutos o usar iconos genéricos.
Si se decide no tomarlas nunca, la salida honesta es declarar PWA-02 como diferido, no fingirlo.

### 2. Ninguna de las dos fases se validó en un teléfono real

Ni la 5 ni la 6 tienen `VERIFICATION.md`. Las dos declararon ese checkpoint como bloqueante.
Para probar desde el teléfono hace falta una URL HTTPS: la app en local no le sirve al móvil.
Lo que se usó aquí fue un túnel temporal:
```
brew install cloudflared            # si no está
PORT=3100 npm run start             # el 3000 puede estar ocupado por otro proyecto
cloudflared tunnel --url http://localhost:3100
```
Y apuntar `APP_BASE_URL` en `.env.local` a la URL que imprime el túnel. **La URL cambia en cada
arranque**, así que las capturas y la prueba conviene hacerlas de corrido.

Lo que hay que comprobar en el teléfono: instalar en pantalla de inicio, dar permiso, que llegue
una notificación de prueba, tocarla y aterrizar en el aseo, y hacer un aseo con fotos.

### 3. La Fase 7 (Financiero) está discutida pero sin planear

Hay cuatro decisiones abiertas y son de negocio, no de ingeniería:
- Dónde vive el dinero: ¿ruta propia `/finanzas` o columnas dentro de `/operacion`?
- Qué entra en el pago del aseador: ¿solo la suma de los aseos? ¿se le reembolsan los gastos
  que reportó? ¿se descuenta algo por daños? **Es el número que una persona cobra.**
- Qué pasa si se corrige una tarifa de un mes ya cerrado: ¿se recalcula, se queda quieto, o se
  crea un ajuste aparte?
- Qué se hace con el pago una vez calculado: ¿solo verlo, marcarlo como pagado, exportarlo?

---

## TRAMPAS MEDIDAS QUE VAN A VOLVER A MORDER

1. **La suite E2E contra el proyecto equivocado.** `playwright.config.ts` usa el puerto 3000 con
   `reuseExistingServer: true`. Si otro proyecto de Next ocupa ese puerto, Playwright **reusa el
   servidor ajeno** y corre los 107 specs contra la app equivocada: fallo total por timeout, que
   se lee como "la suite está rota". Pasó el 2026-09-12 y costó horas de diagnóstico erróneo,
   incluida la afirmación falsa de que había "tres tests rojos arrastrados desde la Fase 5".
   **Salida:** `PLAYWRIGHT_PORT=3200 npm run test:e2e`. Lo delata comparar la versión de Next que
   responde en el puerto. Está documentado en la cabecera del propio config.

2. **La suite E2E necesita `npm run db:reset` antes.** Su `beforeAll` ya lo exige pero nada lo
   automatiza. Sin eso, los aseos que dejan los specs previos chocan contra el índice único
   parcial `(property_id, scheduled_date) where estado <> 'cancelado'` y dos aserciones de
   `operacion.spec.ts` caen por colisión, no por defecto del producto.

3. **`max-w-<talla>` compila a cuatro u ocho píxeles.** Tailwind v4.3 resuelve `max-w-<nombre>`
   contra `--spacing-*` antes que contra `--container-*`, y la escala de este proyecto usa
   nombres de talla. Costó dos ciclos de arreglo. Todo ancho nuevo va como
   `--container-<nombre-propio>` y se registra en el grupo `max-w` de `cn()`. `npm run ci:arch`
   lo vigila.

4. **Los guardarraíles de CI funcionan por expresión regular, no leyendo código.** Un comentario
   que mencione literalmente un token prohibido hace fallar la revisión aunque el código esté
   bien. Ha mordido cinco veces. Si hay que escribir sobre un token vetado, se construye la
   cadena en vez de escribirla entera.

5. **`revalidatePath` cuelga el navegador** en las Server Actions de `(admin)`. Medido en la
   Fase 4: la mutación llega a la base, el servidor responde 200 en ~50 ms y el cliente no lo
   aplica nunca. El refresco se pide con `router.refresh()` desde el cliente.

---

## SUITES, MEDIDAS EL 2026-09-12 CON BASE RESETEADA Y PUERTO LIBRE

| Capa | Resultado |
|---|---|
| E2E (Chromium) | **107 / 107** |
| pgTAP | 11 archivos, **269** aserciones, PASS |
| Unitarios | 55 archivos, **1005** tests |
| Integración | 19 archivos, **169** tests |
| `tsc --noEmit` | limpio |
| `ci:arch` | los tres scripts OK |

---

## UNA NOTA SOBRE CÓMO SE TRABAJÓ ESTE TRAMO

Durante la Fase 5 y la 6 hubo **dos sesiones trabajando en paralelo** sobre el mismo repo: esta y
un subagente de planeación que quedó activo y siguió conversando y commiteando. Consecuencias que
conviene conocer al leer el historial de git:

- La Fase 5 se mergeó a `main` **incompleta y sin verificar**, por decisión de esa otra sesión.
- Hay commits revertidos y vueltos a aplicar alrededor del par VAPID y del plan `05-01`.
- Algunos mensajes de commit atribuyen decisiones al desarrollador que quizá se tomaron en la
  otra ventana; el historial no distingue cuál sesión las originó.

**Recomendación para el próximo tramo: una sola sesión a la vez.** El riesgo no es que se pisen
los archivos, es que cada sesión tenga la mitad de la historia.
