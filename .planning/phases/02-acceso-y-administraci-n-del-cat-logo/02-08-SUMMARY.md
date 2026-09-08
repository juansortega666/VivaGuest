---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 08
subsystem: alta-de-cuentas
tags: [server-actions, service-role, gotrue, zod, crypto, base-ui, playwright, ci]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Auto-registro cerrado en GoTrue, lib/env.ts y los guardarrailes de arquitectura"
  - phase: 02-03
    provides: "mapAuthError(), con email_exists ya redactado en español"
  - phase: 02-06
    provides: "exigirAdmin(), ResultadoAccion, el middleware que rutea por app_metadata.role"
  - phase: 02-07
    provides: "Shell del admin, /aseadores y el botón Crear aseador montado como stub"
provides:
  - "generarPasswordTemporal(): contraseña criptográfica, dictable por teléfono, sin sesgo de módulo"
  - "LONGITUD_MINIMA_PASSWORD: la única fuente del mínimo de 12 en todo el sistema"
  - "esquemaCrearAseador: la ÚNICA defensa contra una contraseña corta"
  - "crearAseador() y generarPassword(): el patrón guard -> Zod -> cliente de servicio"
  - "DialogoCrearAseador: alta + estado de entrega de una sola vez (ASEADOR-01)"
  - "Guardarrail 7 de CI: el guard va ANTES de construir la fábrica administrativa"
affects: [02-09, 02-10, 02-11, 02-14, 02-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Toda action que toque la fábrica administrativa: guard PRIMERO, Zod SEGUNDO, fábrica TERCERO"
    - "El rol se escribe en app_metadata (JWT) y en user_metadata (trigger); nunca en uno solo"
    - "Un campo de formulario controlado por React sobrevive al reset que hace React 19 tras una action"
    - "Un guardarrail estructural se verifica por FUNCIÓN, no por archivo: un archivo con dos exportaciones engaña a la comprobación por archivo"
    - "Un test de distribución con umbral laxo no detecta sesgo de módulo; hace falta chi-cuadrado"

key-files:
  created:
    - lib/domain/password.ts
    - lib/domain/password.test.ts
    - lib/domain/aseador.schema.ts
    - lib/domain/aseador.schema.test.ts
    - app/(admin)/aseadores/_actions.ts
    - app/(admin)/aseadores/_components/DialogoCrearAseador.tsx
    - lib/auth/alta-aseador.integration.test.ts
    - e2e/aseadores-alta.spec.ts
  modified:
    - app/(admin)/aseadores/page.tsx
    - app/globals.css
    - scripts/ci/check-service-role.sh

key-decisions:
  - "El test de distribución que pide el plan NO detecta el sesgo de módulo: con `% 57` el exceso es del 11 %, y el umbral del plan es del 100 %. Se implementa igual y se añade un chi-cuadrado que sí lo atrapa (1433 contra un umbral de 150)"
  - "Los campos del diálogo son CONTROLADOS: React 19 resetea un `<form action>` no controlado al responder, y un email_exists dejaba el formulario en blanco pese a que §9.4 exige conservar lo escrito"
  - "El test E2E de login se crea su propia cuenta en vez de heredar la contraseña por process.env: Playwright reinicia el worker cuando un test falla y la credencial desaparecía"
  - "Guardarrail 7 nuevo en CI: borrar el guard de la action no lo atrapaba NADA, y tres planes más van a copiar este patrón"
  - "El guardarrail 7 se comprueba por función y no por archivo, porque la versión por archivo era un falso verde"
  - "generarPassword() también lleva guard: es un endpoint HTTP público como cualquier otra action"

patterns-established:
  - "Romper la invariante a propósito y exigir el rojo ANTES de creerle al verde. Ocho señuelos en este plan, ocho rojos, cero atrapados por tsc"
  - "El guardarrail que se acaba de escribir también se audita: el primero de este plan pasaba en verde con el agujero abierto"

requirements-completed: [ASEADOR-01]

# Metrics
duration: 31min
completed: 2026-09-01
---

# Fase 02 Plan 08: Alta de cuentas de aseador con entrega de una sola vez

**El administrador crea la cuenta de un aseador desde el dashboard, recibe una contraseña criptográfica que se muestra exactamente una vez y nunca se escribe en ninguna tabla, y esa cuenta entra por `/login` y aterriza en `/mis-aseos`. Queda cerrado ASEADOR-01 y fijado el patrón guard → Zod → cliente de servicio que van a repetir los planes 02-09, 02-10 y 02-14. Y el hallazgo que más vale del plan no es una línea de producto: es que borrar ese guard no lo atrapaba absolutamente nada.**

## Performance

- **Duración:** 31 min
- **Tareas:** 3 de 3, todas autónomas
- **Commits:** 5
- **Archivos creados/modificados:** 11 (+1622 líneas)

## Task Commits

1. **Tarea 1: Generador y esquema de alta** — `3d53156` (RED), `6c2d57d` (GREEN)
2. **Tarea 2: Server Action con `service_role`** — `deb0cc7`
3. **Guardarrail 7 de CI** (desviación, Regla 2) — `48d020c`
4. **Tarea 3: Diálogo con entrega de una sola vez** — `1102121`

---

## El hallazgo que importa: borrar el guard no lo atrapaba NADA

El plan lo dice con todas las letras: *"Invertir 1 y 3 convierte la action en una escalada de privilegios de una línea"*. Y la mitigación que el registro de amenazas asigna a **T-02-34** es *"verificado en el acceptance criteria de la tarea 2"*, o sea: **una persona leyendo el archivo**.

Así que se midió. Se borró `exigirAdmin()` de `crearAseador`, dejando un endpoint HTTP público que crea cuentas con un cliente que salta la RLS por completo, y se corrió todo:

| Comprobación con el guard borrado | Resultado |
|---|---|
| `npx tsc --noEmit` | **limpio** |
| `npm run ci:arch` (guardarraíles 1 a 6) | **OK** |
| `npm run test:unit` | **188 passed** |
| `npm run test:integration` | **13 passed** |
| `npx playwright test` | **33 passed** |

Cinco puertas verdes sobre el agujero más caro de la fase. Y no es un problema de este plan solamente: **02-09, 02-10 y 02-14 van a copiar este archivo como plantilla**, así que el mismo descuido tiene tres oportunidades más de colarse, cada una con un cliente privilegiado detrás.

**Arreglo (Regla 2): guardarraíl 7 en `scripts/ci/check-service-role.sh`.** Todo archivo que *construya* la fábrica administrativa tiene que llamar a `exigirAdmin()` o `exigirSesion()`, y la llamada tiene que estar **antes**. `lib/test/` queda exento por la misma razón acotada que ya documenta el guardarraíl 5.

### Y el guardarraíl nuevo también era un falso verde

La primera versión comparaba, con `grep -n`, la primera línea con un guard contra la primera que construye la fábrica **en todo el archivo**. Corrida contra el señuelo: **`check-service-role: OK`**.

La causa: `_actions.ts` exporta **dos** funciones. `generarPassword()` llama a `exigirAdmin()` en la línea 67; `crearAseador` construye la fábrica en la 106. La comparación por archivo veía «guard en 67 < fábrica en 106» y daba por bueno un archivo donde la función que importa no tenía guard ninguno.

La versión definitiva recorre **función a función** con `awk` y exige el guard dentro del mismo cuerpo. Verificada en los tres sentidos:

| Estado de `crearAseador` | Guardarrail 7 |
|---|---|
| Guard antes de la fábrica (correcto) | **OK** |
| Sin guard | **rojo**: `crearAseador() construye la fabrica administrativa sin un guard antes` |
| Fábrica antes del guard | **rojo**, mismo mensaje |
| Sin guard, con la versión por archivo | **OK** ← el falso verde |

Es la tercera vez consecutiva que el hábito de romper el verde encuentra algo, y la primera en que lo encuentra **dentro de la herramienta de verificación recién escrita**.

---

## El segundo hallazgo: el test de distribución del plan no detecta el sesgo de módulo

El plan pide, literalmente: *"Sobre 10000 muestras, la distribución por posición no tiene ningún carácter con frecuencia mayor al doble de la esperada (detecta el sesgo del módulo)"*.

No lo detecta. El alfabeto tiene 57 caracteres y `256 % 57 = 28`, así que con un `byte % 57` a secas los 28 primeros caracteres salen 5 veces de cada 256 y los otros 29 salen 4. El exceso sobre lo esperado es del **11 %**. El umbral del plan exige un **100 %**. Un señuelo con el sesgo puesto pasaría ese test sin despeinarse.

El test se implementó igual, porque es el contrato, **con el comentario que explica que no tiene dientes**. Y al lado se añadió el que sí: un chi-cuadrado de bondad de ajuste sobre 110.000 caracteres (10.000 contraseñas × 11 útiles), 57 categorías, 56 grados de libertad.

| Generador | chi² medido | Umbral 150 |
|---|---|---|
| Con rechazo de bytes fuera del mayor múltiplo (correcto) | ~56 ± 10,6 | pasa |
| `byte % ALFABETO.length` a secas (señuelo) | **1433,6** | **falla** |

Entre 90 y 1433 hay sitio de sobra para que el test no sea intermitente y siga teniendo dientes. Y el señuelo del módulo dejó **verde** al test del "doble de la esperada", que es la demostración directa de por qué hacía falta el segundo.

---

## El tercer hallazgo: React 19 resetea el formulario y borraba lo escrito

UI-SPEC §9.4 exige que ante un error de la operación **el formulario conserve todo lo escrito**. El test E2E del email duplicado lo comprueba, y falló en la primera corrida:

```
Locator:  getByRole('dialog').getByLabel('Nombre')
Expected: "Aseador Duplicado"
Received: ""
```

**Causa medida:** React 19 **resetea** un `<form action={…}>` con campos no controlados en cuanto la action responde. Con `email_exists`, el admin veía el mensaje correcto bajo el campo correcto y **el formulario en blanco**: tenía que volver a teclear nombre, email y teléfono para corregir una letra del email.

**Arreglo:** los cuatro campos pasan a controlados, y se limpian explícitamente al cerrar el diálogo. La razón queda escrita en el archivo, porque «este `useState` no hace falta, el input ya es no controlado» es exactamente la simplificación que reintroduce el bug.

Vale la pena notar que `/login` (plan 02-06) **no** tiene este problema por accidente: allí un error deja la pantalla de login, donde volver a teclear la contraseña es lo esperado. Aquí son cuatro campos y uno de ellos se genera.

---

## El cuarto hallazgo: `process.env` entre tests de Playwright se evapora

El test que cierra el requisito (crear la cuenta, leer la contraseña de la pantalla, entrar con ella en un contexto nuevo) heredaba la credencial del test anterior por `process.env`. Con `workers: 1` y `fullyParallel: false` eso debería funcionar, y funciona… **hasta que un test anterior falla**.

Medido: **Playwright reinicia el worker tras un fallo**, así que el proceso nuevo arranca con un `process.env` limpio. El síntoma fue el test de login fallando con *"el test de creación tiene que correr antes"*, que apunta a un problema de orquestación cuando la causa real estaba dos tests más arriba.

**Arreglo:** el test se crea su propia cuenta, lee la contraseña de su propio diálogo y limpia en un `finally`. Un test que cierra un requisito no debe depender del efecto lateral de otro.

---

## Los tres hechos medidos del research, confirmados contra el stack vivo

| Hecho del research | Resultado en este plan |
|---|---|
| `auth.admin.createUser` NO valida `minimum_password_length` | **Confirmado.** Hay un test de integración que crea una cuenta con `pw123456` (8 caracteres) contra un `config.toml` que declara 12, y **exige que salga bien**. Si algún día GoTrue empezara a validarlo, ese test se pone rojo y sabríamos que el Zod dejó de ser la única defensa |
| El trigger materializa `profiles` sin insertar a mano | **Confirmado:** `role='aseador'`, `full_name`, `phone`, `is_active=true`, `deactivated_at=null` |
| Email duplicado da `email_exists` con 422 | **Confirmado** |

---

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npm run ci:arch` | OK, **7 guardarraíles** (eran 6) |
| `npm run test:unit` | 12 archivos, **188 tests** verdes (eran 161) |
| `npm run test:integration` | 2 archivos, **13 tests** verdes (eran 5) |
| `npm run build` | OK, `/aseadores` sigue dinámica |
| `npx playwright test` | **33 tests** verdes (eran 26) |
| `grep -q "node:crypto" lib/domain/password.ts` | presente |
| `! grep -q` del PRNG no criptográfico en `password.ts` | ausente, **incluidos los comentarios** |
| Revisión manual: nada entre el inicio de `crearAseador` y `exigirAdmin()` | confirmado filtrando comentarios y líneas en blanco |
| Utilidades de token emitidas en el CSS | `min-w-boton-alta` y `max-w-dialogo`, las dos resuelven a `var(--…)` |
| Grep de valor arbitrario de medida en los archivos nuevos | cero |

### Los ocho señuelos, uno por uno

| Señuelo | `tsc` | Qué se puso rojo |
|---|---|---|
| `byte % ALFABETO.length` (sesgo de módulo) | **limpio** | chi-cuadrado: **1 failed** (el test del "doble" siguió **verde**) |
| Grupos `[4,3,3]`: contraseña de 12 justos | **limpio** | formato §11.2: **1 failed** |
| Grupos `[3,3,2]`: contraseña de 11 | **limpio** | **10 failed** entre los dos archivos |
| Alfabeto con `0 O 1 l I` | **limpio** | ambigüedad: **2 failed** |
| `.min(1)` en vez del mínimo en el esquema | **limpio** | **3 failed**, incluido el caso de 8 caracteres medido |
| Quitar `'use server'` de `_actions.ts` | **limpio** | guardarraíl 5: **rojo** |
| Persistir la contraseña en una columna de `profiles` | **limpio** | integración: **3 failed** |
| El diálogo se cierra al tener éxito | **limpio** | E2E: **5 failed** |
| `email_exists` a toast en vez de inline | **limpio** | E2E: **1 failed** |
| **Borrar `exigirAdmin()` de `crearAseador`** | **limpio** | **NADA, antes del guardarraíl 7** |

`tsc` no atrapó ni uno solo. Van catorce señuelos en tres planes y catorce compilaciones limpias.

### Las verdades del plan, comprobadas una a una

| Verdad declarada | Resultado |
|---|---|
| El admin crea la cuenta y recibe la contraseña una sola vez | verde: el diálogo no se cierra y pasa al estado de entrega |
| El aseador no puede registrarse por su cuenta | verde, en integración (`signUp` da 422) y en el copy de la pantalla |
| La contraseña tiene ≥ 12 caracteres y es criptográfica | verde, con el chi-cuadrado como prueba de la segunda mitad |
| La contraseña no queda en ninguna tabla, log ni URL | verde: `select *` sobre `profiles`, la tabla entera, y el usuario de GoTrue |
| El aseador creado puede entrar y aterriza en `/mis-aseos` | verde, en un contexto de navegador nuevo con la clave leída de pantalla |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 1 - Bug] El formulario perdía todo lo escrito ante un error**

- **Encontrado durante:** Tarea 3, primera corrida del spec E2E.
- Detalle completo arriba. **Archivos:** `app/(admin)/aseadores/_components/DialogoCrearAseador.tsx`. **Commit:** `1102121`.

**2. [Regla 1 - Bug] El spec leía la contraseña antes de que la action respondiera**

- **Encontrado durante:** Tarea 3. Cuatro tests fallaban con `Received: 0` en el assert de longitud, apuntando al generador cuando el problema era una carrera: `generarPassword()` es una Server Action y entre el click y el valor hay un viaje de red.
- **Arreglo:** un helper que espera con `expect(campo).not.toHaveValue('')` antes de leer. **Commit:** `1102121`.

**3. [Regla 1 - Bug] La credencial pasada entre tests por `process.env` se evaporaba**

- **Encontrado durante:** Tarea 3. Detalle completo arriba. **Commit:** `1102121`.

**4. [Regla 3 - Bloqueante] El worktree venía con la base equivocada**

- **Encontrado durante:** el arranque. `git merge-base` devolvía el propio HEAD, o sea que el worktree estaba **detrás** del commit base del plan. Se resolvió con el `git reset --hard` que el propio chequeo de arranque contempla, con el árbol limpio.
- **Archivos versionados:** ninguno.

**5. [Regla 3 - Resuelto por el entorno] `npm run setup:worktree` ya escribe el `.env.local`**

- Las cinco corridas anteriores (02-01, 02-04, 02-05, 02-06, 02-07) pagaron a mano la reconstrucción del `.env.local`. **Esta vez no.** El script resolvió `node_modules` y el entorno en un solo paso. La deuda que el plan 02-07 dejó anotada está cerrada.

### Añadidos deliberados sobre el plan

**6. [Regla 2 - Funcionalidad crítica ausente] Guardarraíl 7 de CI**

La mitigación de **T-02-34** que el plan declara es una revisión manual, y se midió que ninguna puerta automática cubre el hueco. Detalle completo arriba. **Commit:** `48d020c`.

**7. [Regla 2] El chi-cuadrado, además del test de distribución que pide el plan**

Detalle completo arriba. Sin él, la regla 3 de generación (sin sesgo de módulo) no tenía ninguna prueba con dientes.

**8. [Regla 2] `generarPassword()` también lleva guard**

El plan la describe como *"una action mínima que llama al generador y devuelve el string"*. Es igual de endpoint HTTP público que la otra, y no hay razón para dejar abierto a cualquiera un generador que consume entropía del sistema. Cuesta una línea.

**9. [Regla 2] Tests de más sobre lo que el plan pedía**

- `password.test.ts` lleva 10 casos y no 5: el chi-cuadrado, la cobertura completa del alfabeto (atrapa un `% (n-1)`), que el alfabeto no declare repetidos y que todo carácter salga de él.
- `aseador.schema.test.ts` lleva 17 y no 7: la normalización a minúsculas, que la contraseña **no** se recorte, el barrido de todas las longitudes por debajo del mínimo, y los dos casos de T-02-35 (`role` e `is_active` en el payload no llegan a la salida).
- `alta-aseador.integration.test.ts` lleva 8 y no 6: la búsqueda de la contraseña en la tabla `profiles` entera, en el usuario de GoTrue, y el test que **confirma** que la Admin API sigue aceptando 8 caracteres.
- `aseadores-alta.spec.ts` lleva 7 y no 5: el copy fijo del diálogo y el botón `Copiar` con su anuncio.

**10. [Regla 2] El error `email_exists` se comprueba por `aria-describedby`, no por "aparece en algún sitio"**

El criterio del plan es *"se pinta inline bajo el campo, no en un toast"*. Un assert de que el texto es visible pasaría **también con el mensaje en un toast**. El test exige además `aria-invalid="true"` en el input y que el `aria-describedby` apunte a un elemento con ese texto exacto. Con el señuelo que manda el error a toast, es esa mitad la que se cae.

**11. [Regla 2] El error de operación se pinta también dentro del diálogo**

§9.4 manda los errores sin campo a toast. Se hace, y además se deja visible en el diálogo: el toast vive **fuera del foco atrapado** del diálogo, así que quien navega por teclado no llega a leerlo nunca.

### Desviaciones menores del texto del plan

**12. El test de distribución del plan se implementa aunque no sirva**

Está en el contrato, así que está. Lo que se añade es el comentario que documenta que no tiene dientes y el chi-cuadrado al lado. Borrarlo habría sido más limpio y menos honesto: el siguiente que lea el plan tiene que encontrar el test que el plan pide, y la razón por la que hay otro.

**13. El encabezado del estado de entrega usa el icono `Check`, no el carácter `✓`**

§11.2 lo dibuja como `✓ Cuenta creada para María Gómez`. Se renderiza con el icono `Check` de la lista cerrada de §14.3 y `aria-hidden`, porque un `✓` literal lo lee un lector de pantalla como *"marca de verificación"* delante de cada anuncio de éxito.

**14. El diálogo lleva un botón `Cancelar` que §11.2 no dibuja**

La maqueta solo muestra `Listo` en el estado de entrega. En el estado de formulario hacía falta una salida explícita: la `X` de la esquina y `Esc` existen, pero un formulario de cuatro campos sin botón de salida visible es una trampa para quien no conoce el atajo.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-34 | mitigate | `exigirAdmin()` es la primera sentencia de `crearAseador`, verificado a mano filtrando comentarios. **Y ahora también por el guardarraíl 7**, porque se midió que la revisión manual era la única defensa y no es una defensa que sobreviva a tres planes más copiando el patrón |
| T-02-35 | mitigate | `'aseador'` es un literal del código. `esquemaCrearAseador` no declara ninguna clave `role`, y un objeto de Zod descarta lo que no declara: dos tests fijan que un `role=admin` y un `is_active=false` metidos en el payload no llegan a la salida |
| T-02-36 | mitigate | La contraseña viaja solo en el valor de retorno de la action. Tres tests de integración la buscan: en la fila de `profiles` con `select *`, en la tabla entera, y en el usuario de GoTrue. El primero busca además **cada grupo por separado**, porque guardar `Xk4m` de `Xk4m-92pT-vLq` sería una fuga que un `toContain` del string completo no vería |
| T-02-37 | mitigate | `randomBytes` de `node:crypto` con rechazo del sesgo de módulo, probado por chi-cuadrado. El mínimo de 12 lo impone el Zod, y hay un test de integración que **confirma que la Admin API no lo impone** |
| T-02-38 | mitigate | `import 'server-only'` en `admin.ts`, `'use server'` como primera línea de código del archivo de actions, y los guardarraíles 1, 5 y **7** |
| T-02-39 | mitigate | **No se añadió ningún trigger.** `on_auth_user_created` sigue siendo `AFTER INSERT` y nada más. La ruta de escalada (un usuario escribiendo su `user_metadata` y acabando con su `profiles.role`) sigue sin existir |
| T-02-40 | accept | `email_exists` solo es alcanzable por un admin autenticado creando cuentas. No hay superficie anónima |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. El plan añade dos Server Actions, las dos con guard verificado por CI, y **cero** endpoints de API, rutas de auth o cambios de schema.

## Known Stubs

Ninguno de este plan. El botón `Crear aseador` que el 02-07 dejó montado sin handler queda cableado en sus dos apariciones (cabecera y estado vacío), así que **ese stub se cierra aquí**.

Sigue abierto, y es del plan 02-09, el menú `⋯` de `TablaAseadores`.

## Notas para los planes siguientes

- **02-09, 02-10 y 02-14 (las demás actions con `service_role`):** el patrón está en `app/(admin)/aseadores/_actions.ts` y ahora es **obligatorio por CI**. El guardarraíl 7 exige que dentro de la misma función el guard aparezca antes de `createAdminClient()`. Si tu action lo necesita en otra forma (una función flecha, por ejemplo), el `awk` del guardarraíl solo reconoce `function` de nivel superior: amplíalo, no lo esquives.
- **02-09 (baja de aseador):** la reactivación son **dos** operaciones, y la baja también. Al `update` de dos columnas que midió el 02-07 (`is_active` + `deactivated_at`, por `profiles_deactivation_coherent`) hay que sumarle `updateUserById(uid, { ban_duration })`, medido en research §6.2. Y `auth.admin.signOut(id, 'global')` **no existe con esa firma**.
- **Cualquier formulario nuevo con `useActionState`:** si tiene que conservar lo escrito ante un error, **los campos van controlados**. React 19 resetea el form no controlado al responder la action. Es la trampa que este plan pagó y no está en ningún tutorial.
- **Cualquier spec de Playwright:** no pases datos entre tests por `process.env`. El worker se reinicia cuando un test falla y el síntoma aparece lejos de la causa.
- **Si escribes un guardarraíl de CI, rómpelo antes de creerle.** El de este plan pasaba en verde con el agujero abierto por ser una comprobación por archivo sobre un archivo con dos exportaciones. Costó dos minutos encontrarlo.
- **`npm run setup:worktree` ya escribe el `.env.local`.** La deuda de cinco planes está cerrada; no vuelvas a reconstruirlo a mano.
- **No hay recuperación de contraseña**, y es deliberado (deuda 4 del UI-SPEC). La salida sería `updateUserById(uid, { password })`. Está anotada en el código y **no se construye sin que alguien la pida**.
- **Bloqueante residual heredado de 02-01, 02-04, 02-05, 02-06 y 02-07:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.

## Self-Check: PASSED

Los 11 archivos que este resumen declara creados o modificados existen en disco, y los 5 hashes de commit (`3d53156`, `6c2d57d`, `deb0cc7`, `48d020c`, `1102121`) resuelven a objetos de tipo `commit` en el historial de la rama. Ni `STATE.md` ni `ROADMAP.md` aparecen en el diff del plan.
