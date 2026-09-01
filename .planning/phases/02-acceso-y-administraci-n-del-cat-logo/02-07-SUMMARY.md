---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 07
subsystem: admin-shell
tags: [rsc, rls, postgrest, shadcn, base-ui, tokens, playwright, accesibilidad]

# Dependency graph
requires:
  - phase: 02-02
    provides: "Tabla de ruteo pura y los formateadores del dominio"
  - phase: 02-05
    provides: "Base visual: bloques de Base UI, capa de tokens, Poppins como tipografia de marca"
  - phase: 02-06
    provides: "exigirAdmin(), createClient() de servidor, cerrarSesion() y el middleware que rutea por rol"
provides:
  - "Shell del admin: app/(admin)/layout.tsx con guard, force-dynamic y contenedor de 1440px"
  - "TopNav: barra de 56px con exactamente dos links, aria-current y menu de usuario"
  - "EstadoVacio: el bloque compartido de UI-SPEC 9.2, para los planes 02-11 y 02-13"
  - "lib/data/aseadores.ts: listarAseadoresConAsignaciones() y contarActivos(), con el cliente por parametro"
  - "/aseadores funcional con conteos reales de responsable y suplente (ASEADOR-03)"
  - "Tokens de ancho de columna, de contenedor del admin y la utilidad de transicion de 120ms"
  - "El bloque global de prefers-reduced-motion del contrato (UI-SPEC 6.4)"
affects: [02-08, 02-09, 02-10, 02-11, 02-12, 02-13, 02-14, 02-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El modulo de datos recibe el cliente de Supabase por parametro: sirve igual a un RSC y a un test"
    - "Un doble de PostgREST en test aplica de verdad los .eq() que recibe, o el test no tiene dientes"
    - "Todo valor de medida se declara como token en globals.css antes que como valor arbitrario"
    - "Un comentario NUNCA cita literalmente el token que una verificacion grepea"
    - "Estado = icono de forma distinta + etiqueta de texto + color, los tres canales siempre"

key-files:
  created:
    - app/(admin)/layout.tsx
    - app/(admin)/_components/TopNav.tsx
    - app/(admin)/_components/EstadoVacio.tsx
    - app/(admin)/aseadores/page.tsx
    - app/(admin)/aseadores/loading.tsx
    - app/(admin)/aseadores/_components/TablaAseadores.tsx
    - lib/data/aseadores.ts
    - lib/data/aseadores.test.ts
    - e2e/aseadores-lista.spec.ts
  modified:
    - app/globals.css

key-decisions:
  - "AsignacionApartamento lleva `activo`: el contrato del plan pedia {id, nombre} y con esa forma contarActivos() es literalmente incomputable"
  - "El doble de PostgREST del test unitario aplica los .eq(): la primera version los ignoraba y el test del aseador desactivado era un falso verde"
  - "El spec E2E rehace la sesion del admin en afterAll, porque signOut() tiene scope global y mata el storageState compartido de e2e/.auth"
  - "profiles_deactivation_coherent obliga a escribir deactivated_at junto con is_active: bajar solo el booleano da 23514"
  - "El encabezado sticky de la tabla NO engancha dentro del contenedor overflow-x-auto de shadcn; se documenta para el 02-11, que es donde muerde"
  - "El estado vacio usa CircleDashed, de la lista cerrada de 14.3: traer un icono de fuera seria modificar el contrato de diseno"
  - "El menu ⋯ y el boton Crear aseador quedan montados sin handler, para que el layout que esperan el 02-08 y el 02-09 no se mueva"

patterns-established:
  - "Antes de creerle a un verde, romper la invariante a proposito y exigir el rojo. Seis senuelos en este plan, seis rojos, cero atrapados por tsc"
  - "Cuando un test tiene un doble, el doble tambien se audita: un doble permisivo convierte un test bueno en decoracion"

requirements-completed: [PLAT-07, ASEADOR-03]

# Metrics
duration: 22min
completed: 2026-09-01
---

# Fase 02 Plan 07: Shell del admin y lista de aseadores

**El panel del administrador existe: barra superior con guard, ruteo marcado y cierre de sesión, y colgando de él la primera pantalla real de la fase, con conteos de asignación consultados a la base y verificados contra un sembrado de número conocido. Se cierra ASEADOR-03 y la mitad del criterio 5 del ROADMAP.**

## Performance

- **Duración:** 22 min
- **Iniciado:** 2026-09-01T21:40:26Z
- **Completado:** 2026-09-01T22:02:31Z
- **Tareas:** 3 de 3, todas autónomas
- **Commits:** 4
- **Archivos creados/modificados:** 10 (+1269 líneas)

## Task Commits

1. **Tarea 1: Shell del admin — layout, guard y barra superior** — `c725695`
2. **Tarea 2: Lectura de aseadores con conteos de asignación** — `bab06ce` (RED), `8517a79` (GREEN)
3. **Tarea 3: Pantalla de aseadores y su spec** — `2119a3d`

---

## El hallazgo que importa: el doble del test también era un falso verde

El plan 02-06 dejó escrito que un test de seguridad verde a la primera hay que romperlo antes de creerle. Aquí ese hábito encontró algo, y no en el código de producción: **en el doble de PostgREST del test unitario.**

La primera versión del doble implementaba el encadenamiento así:

```ts
select: () => encadenable,
eq: () => encadenable,          // <- ignora el filtro y devuelve la semilla entera
order: () => resultado,
```

Con ese doble, los 9 tests pasaban. Y **seguían pasando con un `.eq('is_active', true)` metido en la consulta de perfiles**, que es exactamente el bug que el test llamado *"un aseador desactivado sigue en la lista, no desaparece"* dice vigilar. El doble no podía distinguir la consulta correcta de la rota, así que ese test era decoración contada como cobertura.

**Arreglo:** el doble aplica de verdad los `.eq()` y ordena por la columna que se le pida. Efecto colateral útil: el `.eq('role', 'aseador')` pasó a ser observable, así que se añadió un perfil de admin a la semilla del test y un caso que exige que quede fuera.

Medición con los tres señuelos sobre `lib/data/aseadores.ts`:

| Señuelo | `tsc --noEmit` | `aseadores.test.ts` |
|---|---|---|
| `contarActivos` deja de filtrar por `activo` | **limpio** | **2 failed** |
| La consulta añade `.eq('is_active', true)` | **limpio** | **3 failed** |
| Se traga el error de PostgREST y devuelve `[]` | **limpio** | **1 failed** |

Con el doble permisivo, el segundo señuelo daba **0 failed**.

---

## El segundo hallazgo: el contrato del plan hacía `contarActivos` incomputable

El bloque `<interfaces>` del plan fija dos cosas que no pueden ser verdad a la vez:

- `responsableDe: { id: string; nombre: string }[]`
- `contarActivos(a)` — *"cuántos de los apartamentos donde es responsable están activos"*

Con `{id, nombre}` no hay ningún dato del que salga "activos". La forma se amplió a `{ id, nombre, activo }`, que conserva la intención declarada en el bloque `<behavior>` (**listas y no números**, porque el `Popover` de §11.1 necesita los nombres) y hace la función posible sin una segunda consulta por aseador.

Es una desviación del texto literal del contrato de interfaz, así que queda escrita aquí y en el propio tipo: **el plan 02-09 consume `contarActivos` y va a encontrar el campo extra.**

---

## El tercer hallazgo: `signOut()` mata el `storageState` de los demás specs

El menú de usuario del admin es nuevo, así que su cierre de sesión necesitaba test propio. Y ahí hay una trampa que el plan 02-06 esquivó sin nombrarla: su test de cierre usó `paginaAseador2`, el **usuario de sacrificio**, y no `paginaAseador`.

La razón, medida: `signOut()` de `@supabase/supabase-js` tiene **scope `global` por defecto**, así que GoTrue borra *todas* las sesiones del usuario, incluida la que vive en `e2e/.auth/admin.storage.json`. Ese archivo lo comparten todos los specs, y `aseadores-lista.spec.ts` corre **primero** por orden alfabético: sin cuidado, el test de logout del admin dejaría `ruteo.spec.ts` fallando dos archivos más adelante, con un síntoma ("el admin no tiene sesión") que no apunta a su causa.

**No hay un segundo admin en la semilla**, así que en vez de esquivar se repara: el `afterAll` del spec rehace la sesión con `iniciarSesionPorUI(pagina, 'admin')`, que reescribe el `storageState`. Confirmado corriendo la suite entera: los tres tests de admin de `ruteo.spec.ts` pasan **después** del logout de este archivo.

Ese `afterAll` también deshace el resto del sembrado (las 5 asignaciones y la baja del `aseador2`), porque el stack local es compartido entre worktrees y los apartamentos son semilla que sobrevive al `global-teardown`.

---

## El cuarto hallazgo: `deactivated_at` no es opcional

El primer intento de desactivar al `aseador2` desde el spec falló con:

```
new row for relation "profiles" violates check constraint "profiles_deactivation_coherent"
```

El CHECK de la migración 03 es `is_active = (deactivated_at is null)`. Bajar solo el booleano da un `23514`. **Es el primer dato que necesita la Server Action de baja del plan 02-09**: la desactivación es un `update` de dos columnas, no de una, y el CHECK está ahí justamente para que la única operación que revoca acceso no quede sin auditoría.

---

## Deuda medida que hereda el plan 02-11

`TablaAseadores` lleva `sticky top-barra` en el encabezado, como pide §7.2. **Hoy no engancha, y está escrito en el archivo:** el componente `Table` de shadcn envuelve la tabla en un `div` con `overflow-x-auto`, y un `overflow-x` distinto de `visible` convierte ese div en el scrollport del sticky en lugar del viewport.

Con ~8 aseadores la tabla nunca desborda a lo alto, así que no se nota. **Donde sí va a morder es en la tabla de 39 apartamentos del 02-11**: ahí el encabezado se va con el scroll. La salida es sacar la tabla del contenedor con overflow, no añadir más clases.

---

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npm run ci:arch` | OK, 6 guardarraíles |
| `npm run test:unit` | 10 archivos, **161 tests** verdes (eran 150 antes del plan) |
| `npm run test:integration` | 1 archivo, **5 tests** verdes |
| `npm run build` | OK — emite `/aseadores` como dinámica |
| `npx playwright test` | **26 tests** verdes (eran 17 antes del plan) |
| Señuelos sobre `lib/data/aseadores.ts` (3) | los 3 **rojos**; `tsc` no atrapó ninguno |
| Señuelos sobre la pantalla (3) | los 3 **rojos**; `tsc` no atrapó ninguno |
| Grep de `transition: all` / `transition-all` bajo `app/(admin)/` | cero |
| Grep de valor arbitrario de espaciado o medida bajo `app/(admin)/` | cero |
| Grep del token de caché citado en comentarios | cero |
| Utilidades de token emitidas en el CSS | `w-col-estado`, `w-col-telefono`, `w-col-responsable`, `w-col-suplente`, `w-col-menu`, `min-w-col-nombre`, `left-col-estado`, `h-fila`, `h-fila-encabezado`, `tracking-columna`, `max-w-admin`, `max-w-vacio`, `size-avatar`, `h-barra`, `transicion` — las 15 resuelven a `var(--…)` |
| `prefers-reduced-motion` en el CSS emitido | presente |

### Los tres señuelos sobre la pantalla

| Señuelo | `tsc` | `aseadores-lista.spec.ts` |
|---|---|---|
| El estado queda solo como color (se borra la etiqueta de texto) | **limpio** | **2 failed** |
| Se invierten `responsableDe` y `suplenteEn` en la tabla | **limpio** | **2 failed** |
| La página filtra a los aseadores inactivos antes de pintar | **limpio** | **5 failed** |

El segundo es la razón por la que los dos conteos se comprueban en asserts separados: con un único assert sobre "aparece un 3", la inversión habría pasado.

### Las verdades del plan, comprobadas una a una

| Verdad declarada | Resultado |
|---|---|
| El admin ve una barra con Apartamentos y Aseadores, y el activo está marcado | verde, con `aria-current="page"` y su negativo |
| El admin puede cerrar sesión desde el menú de usuario | verde, con la segunda mitad: volver a la ruta protegida rebota |
| El admin ve estado, teléfono y de cuántos es responsable y suplente | verde |
| Un aseador desactivado sigue en la lista, marcado Inactivo | verde, y el señuelo que lo filtra pone 5 tests en rojo |
| Los conteos salen de la base, no de una estimación | verde: sembrado de 3 y 2, aserción del número exacto y de los nombres del popover |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree no tenía `node_modules` ni `.env.local`**

- **Encontrado durante:** antes de la Tarea 1.
- **Arreglo:** `npm run setup:worktree` (el script que aterrizó en `0f3142d`) resolvió `node_modules` desde el lockfile. **El `.env.local` siguió faltando** y hubo que escribirlo a mano desde `npx supabase status`, que es lo que el propio script avisa que no puede hacer.
- Es la **quinta** vez consecutiva (02-01, 02-04, 02-05, 02-06, 02-07). El script recortó la mitad del coste; la otra mitad sigue ahí. La salida natural es que el script escriba `.env.local` parseando el JSON de `supabase status`, que ya expone `PUBLISHABLE_KEY` y `SECRET_KEY`.
- **Archivos versionados:** ninguno.

**2. [Regla 1 - Bug] El contrato de `AsignacionApartamento` hacía `contarActivos` incomputable**

- **Encontrado durante:** Tarea 2, al escribir el test.
- **Arreglo:** se añadió `activo: boolean` al item de asignación. Detalle completo arriba.
- **Archivos:** `lib/data/aseadores.ts`. **Commit:** `8517a79`.

**3. [Regla 1 - Bug] El doble de PostgREST del test ignoraba los `.eq()`**

- **Encontrado durante:** Tarea 2, validando el verde con señuelo en vez de creerle.
- Detalle completo arriba. **Archivos:** `lib/data/aseadores.test.ts`. **Commit:** `8517a79`.

**4. [Regla 1 - Bug] `is_active: false` sin `deactivated_at` viola el CHECK**

- **Encontrado durante:** Tarea 3, primera corrida del spec: `23514`.
- **Arreglo:** el `update` escribe las dos columnas, con la razón anotada para el plan 02-09.
- **Archivos:** `e2e/aseadores-lista.spec.ts`. **Commit:** `2119a3d`.

**5. [Regla 1 - Bug] El logout del admin habría envenenado `ruteo.spec.ts`**

- **Encontrado durante:** Tarea 3, al escribir el test de cierre de sesión.
- Detalle completo arriba. **Archivos:** `e2e/aseadores-lista.spec.ts`. **Commit:** `2119a3d`.

### Añadidos deliberados sobre el plan

**6. [Regla 2] El bloque global de `prefers-reduced-motion`**

UI-SPEC §6.4 lo exige y no existía en `globals.css`. Se añadió con su única excepción del contrato: el giro del spinner de carga conserva su animación, porque es información de estado y no decoración. Un usuario con movimiento reducido y un spinner congelado no sabe si la operación sigue viva.

**7. [Regla 2] La utilidad `transicion` y los tokens de medida**

`transition-colors` de Tailwind trae 150ms y el contrato pide 120ms `ease-out` sobre cuatro propiedades concretas. Se declaró como `@utility` para que el valor viva en un único sitio. En la misma línea entraron los anchos de columna, `--container-admin`, `--container-vacio`, `--spacing-avatar` y `--tracking-columna`: son las medidas que si no se declaran acaban escritas entre corchetes, que es lo que §2 prohíbe. Las 15 utilidades se verificaron en el CSS emitido.

**8. [Regla 2] Tests de más sobre lo que el plan pedía**

- `aseadores.test.ts` lleva 11 casos y no 3: se añadieron el filtro por rol, el orden, la propagación del error de PostgREST y que `contarActivos` NO cuente donde solo es suplente.
- `aseadores-lista.spec.ts` lleva 9 casos y no 4: se añadieron el popover con los nombres (y que los del otro rol no se cuelen), el `sin definir` del teléfono vacío, el `aria-current` del link activo, el cierre de sesión del menú y que un aseador no llegue a `/aseadores`.
- El caso del error de PostgREST existe porque tragárselo pintaría *"Todavía no hay aseadores"* cuando lo que pasó es un `42501`. El admin concluiría que se le borraron las cuentas.

**9. [Regla 2] El estado del aseador con los tres canales, y el teléfono vacío anunciado**

§5 y §13 lo exigen y el plan lo repite: icono de forma distinta, etiqueta de texto y color. La celda de teléfono vacía muestra `—` con `aria-hidden` más un `sr-only` con `sin definir`, porque un guion largo no lo lee ningún lector de pantalla como "no hay dato".

### Desviaciones menores del texto del plan

**10. El link activo ocupa los 56px de alto, no 40px**

El contrato pide links de 40px de alto **y** el subrayado de 2px *pegado al borde inferior de la barra*. Con un link de 40px centrado en una barra de 56px, el subrayado queda flotando a 8px del borde. El link se estira a la altura completa y el aire de 8px por lado se conserva visualmente; las dos intenciones de §6.1 se cumplen, el mecanismo es otro y está comentado en el archivo.

**11. `CircleDashed` como icono del estado vacío**

§14.3 es una lista cerrada y no trae ningún icono de "persona". `CircleDashed` sí está, y lee como "aquí todavía no hay nada". En §5 marca el estado `Informativa`, pero ese estado solo existe en la tabla de apartamentos, así que los dos usos nunca coinciden en una pantalla. Traer un icono de fuera habría sido modificar el contrato de diseño.

**12. El popover no se monta cuando el conteo es cero**

Con cero asignaciones la celda pinta texto plano `0 apartamentos` en vez de un botón. Un disparador que abre un popover vacío es una promesa incumplida y además mete en el recorrido de teclado un control que no lleva a ningún lado.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-29 | mitigate | `exigirAdmin()` antes de renderizar el shell, y **solo** se traga `NoAutorizado`: un fallo de entorno se propaga en vez de disfrazarse de sesión caducada. El comentario del archivo deja escrito que el route group no autoriza nada y que la frontera son `profiles_admin_all` y `properties_admin_all` |
| T-02-30 | mitigate | `export const dynamic = 'force-dynamic'` en el layout. Cero memoización entre peticiones en todo el subárbol, ni con el helper de Next ni con la directiva de React |
| T-02-31 | mitigate | Ninguna ruta nueva de lectura: la pantalla usa PostgREST con el JWT que llega. `profiles_own_select` sigue limitando al aseador a su propia fila, y el spec comprueba que un aseador ni siquiera llega a `/aseadores` |
| T-02-32 | mitigate | **Ninguna función nueva en `public`.** La restricción y su razón medida quedan escritas en `lib/data/aseadores.ts` |
| T-02-33 | accept | `Crear aseador` y el menú `⋯` quedan montados sin handler. Un botón sin handler no es superficie de ataque; se cablean en el 02-08 y el 02-09, y ahí llegan sus guards |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. Este plan no añade endpoints de API, ni Server Actions, ni rutas de auth, ni cambios de schema. La única ruta nueva es una lectura RSC filtrada por policies que existen desde la Fase 1.

## Known Stubs

Dos, ambos declarados en el plan y escritos en el propio código:

| Stub | Archivo | Razón y quién lo resuelve |
|---|---|---|
| Botón `Crear aseador` sin diálogo | `app/(admin)/aseadores/page.tsx` | El diálogo de alta (ASEADOR-01) es del **plan 02-08**. El botón existe hoy porque su ausencia movería la cabecera que el 02-08 espera encontrar |
| Menú `⋯` montado y vacío | `app/(admin)/aseadores/_components/TablaAseadores.tsx` | Sus ítems (Editar, Desactivar, Reactivar) son del **plan 02-09**, junto con el diálogo de consecuencias calculadas. La columna de 48px existe hoy porque añadirla después movería el ancho de las otras cinco |

No hay ningún otro stub: la tabla se alimenta de datos reales leídos con el JWT del admin, y el guard, el ruteo y el cierre de sesión están cableados de punta a punta.

## Notas para los planes siguientes

- **02-08 (alta de aseador):** el botón `Crear aseador` está en `app/(admin)/aseadores/page.tsx` y aparece dos veces, en la cabecera y dentro de `EstadoVacio`; son mutuamente excluyentes, nunca se renderizan juntos. La Server Action nueva arranca con `exigirAdmin()` y devuelve `ResultadoAccion`.
- **02-09 (baja de aseador):** `contarActivos(a)` ya existe y **el item de asignación lleva `activo`**, no solo `{id, nombre}`. Y la baja es un `update` de DOS columnas: `profiles_deactivation_coherent` exige `is_active = (deactivated_at is null)`, medido con un `23514` en este plan.
- **02-11 (tabla de 39 apartamentos):** el `sticky` del encabezado **no funciona** dentro del contenedor `overflow-x-auto` del `Table` de shadcn. Con 8 filas no se nota; con 39 sí. Los tokens de ancho de columna de esta tabla están en `globals.css` y los de §7.1 son otros: hay que declararlos igual, no escribirlos entre corchetes.
- **Cualquier spec que llame a `cerrarSesion()`:** `signOut()` tiene scope global y mata el `storageState` compartido del rol. O se usa un usuario de sacrificio (como hizo el 02-06 con `aseador2`) o se rehace la sesión en `afterAll` (como hace este plan con el admin). No hay tercera opción.
- **Cuando un test tiene un doble, auditar también el doble.** Este plan encontró un test correcto vuelto decoración por un doble permisivo. Cuesta lo mismo que romper el código: dos minutos.
- **`npm run setup:worktree` funciona pero no escribe `.env.local`.** Quinta vez que se paga a mano. El JSON de `npx supabase status` ya trae los tres valores.
- **Bloqueante residual heredado de 02-01, 02-04, 02-05 y 02-06:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.
