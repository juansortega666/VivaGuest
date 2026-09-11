---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 10
subsystem: frontend
tags: [pwa, push, ssrf, allowlist, server-actions, banner, ios, accesibilidad, guardarrail, tdd]
status: complete

requires:
  - phase: 05-09
    provides: "`estadoDeAvisos()` como discriminante tipado, `useEstadoDeAvisos()`, `lib/push/plataforma.ts` y los tokens de §2.1 y §3.1 que este banner viste"
  - phase: 05-08
    provides: "`app/manifest.ts` y `app/sw.ts`: sin service worker registrado no hay `navigator.serviceWorker.ready` que esperar ni `pushManager` al que suscribirse"
  - phase: 05-06
    provides: "La migracion 16, con el grant POR COLUMNA de `push_subscriptions` que estas actions respetan, y el worker de drenaje que visita el `endpoint` que aqui se valida"
  - phase: 04
    provides: "El molde de Server Action de `app/(admin)/operacion/_actions.ts` (guard, safeParse, base) y su test de la disciplina de una sola columna"
  - phase: 02
    provides: "`lib/domain/ical-url.schema.ts`, el precedente exacto de allowlist de host con zod, y `scripts/ci/check-max-w-tallas.sh`, el molde del guardarrail nuevo"
provides:
  - "`lib/domain/suscripcion.schema.ts`: `HOSTS_DE_PUSH`, `esEndpointDePush()`, `esquemaEndpointDePush` y `esquemaSuscripcion`, la defensa anti-SSRF de la fase"
  - "`app/(cleaner)/_actions.ts`: `registrarSuscripcion()`, `revocarSuscripcionPropia()` y `marcarVisto()`, las tres con `exigirSesion()` como primera operacion"
  - "`app/(cleaner)/_components/BotonActivarAvisos.tsx`: la UNICA llamada a `Notification.requestPermission()` del proyecto, dentro de un `onClick`"
  - "`app/(cleaner)/_components/BannerAvisos.tsx`: los cinco estados visibles de §7.2 a §7.6 con icono, titulo, cuerpo y accion distintos"
  - "`scripts/ci/check-escala-movil.sh`, encadenado en `ci:arch`: cierra la deuda declarada 4 del contrato de UI"
  - "El grupo `font-size` de `cn()`, que hasta hoy clasificaba los ocho roles tipograficos del proyecto como COLOR y borraba el tamano"
  - "`baja_desde_el_telefono` en la union cerrada de `revoked_reason`"
affects: [05-11, 05-12, 06]

tech-stack:
  added: []
  patterns:
    - "La allowlist de host se compara sobre el `hostname` ya parseado por `URL` y por SUFIJO DE ETIQUETA CON PUNTO, nunca con `includes` ni con una regex sobre la cadena cruda: mismo molde y mismos casos deceptivos que `ical-url.schema.ts`"
    - "El `key` de un componente hijo como mecanismo de 'vuelve a medir': remonta el hook sin obligar a meter una dependencia artificial en su efecto, que es su contrato"
    - "Estrechar dentro de un callback exige una `const` local: TypeScript no estrecha una propiedad de objeto a traves de un closure, y el error aparece en el sitio equivocado"
    - "El copy literal del contrato vive en constantes con nombre al principio del archivo, no interpolado en el JSX: asi el que compara con el UI-SPEC lee una lista, no un arbol"
    - "Un criterio de aceptacion por grep SIN filtro de comentarios obliga a no nombrar el token ni en prosa. Tres veces en este plan: `exigirAdmin`, `fase siguiente` y el marcador ingles de pendiente"

key-files:
  created:
    - lib/domain/suscripcion.schema.ts
    - lib/domain/suscripcion.schema.test.ts
    - app/(cleaner)/_actions.ts
    - app/(cleaner)/_actions.test.ts
    - app/(cleaner)/_components/BannerAvisos.tsx
    - app/(cleaner)/_components/BotonActivarAvisos.tsx
    - scripts/ci/check-escala-movil.sh
  modified:
    - app/(cleaner)/layout.tsx
    - app/(cleaner)/mis-aseos/page.tsx
    - package.json
    - lib/utils.ts
    - lib/data/push.ts

key-decisions:
  - "La allowlist NO tiene la concesion de loopback que si tiene `ical-url.schema.ts`. Aquella existe para que Playwright pueda servir fixtures desde `127.0.0.1`; aqui no se ejercita contra ningun servidor local, y dejar la puerta abierta significaria aceptar `https://127.0.0.1:54321`, que es literalmente el stack de Supabase de la maquina del desarrollador"
  - "`fcm.googleapis.com` entra como host EXACTO y no como dominio con subdominios: Google no cuelga los endpoints de un subdominio, y poner `googleapis.com` abriria la allowlist a la superficie entera de las APIs de Google"
  - "El esquema mantiene la forma ANIDADA del `PushSubscriptionJSON` y es la action la que la vuelve a armar desde el `FormData` plano. Un esquema plano no se pareceria a nada de lo que existe en el navegador, y entonces el sitio donde se pierde un campo deja de ser evidente"
  - "El banner remonta su vista con un `key` para volver a medir. La alternativa —meter un contador en las dependencias del efecto del hook— habria exigido un `eslint-disable` sobre `exhaustive-deps`, que es justo la regla que protege el unico hook del repo"
  - "`contenidoDelBanner()` recibe la clave ENTERA y lanza en `activo` en vez de recibir una union estrechada. El tipo `EstadoAvisos` es una interseccion, asi que `tsc` no estrecha `clave` al comprobar `banner`: estrechar el parametro habria exigido un cast, y un `throw` con la razon escrita es el patron que `estadoDeAvisosDeAseador()` ya usa para lo inalcanzable"
  - "La linea de §7.5 (`No se pudo…`) y el cuerpo de §15.3 (`No se pudo conectar este telefono…`) se reparten por MOMENTO y no se muestran juntos: el cuerpo cambia cuando el intento anterior fallo, y la linea de apoyo solo sale cuando el que fallo fue una RECONEXION. Decirlo dos veces en la misma caja seria ruido"
  - "El `layout` baja el `endpoint` registrado como prop. Sin ese dato el hook no tiene con que comparar y repara en silencio EN CADA ARRANQUE, rotando el endpoint y dejando huerfanos los avisos ya encolados al anterior"

requirements-completed: [PWA-03, NOTIF-01]

coverage:
  - id: D1
    description: "El servidor no puede acabar visitando una URL arbitraria porque alguien registro una suscripcion inventada (T-05-02)"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/domain/suscripcion.schema.test.ts#la comprobacion es por SUFIJO DE DOMINIO CON PUNTO, no por includes (5 casos: prefijo, sufijo enganoso, sufijo enganoso del lado de Google, host bueno en la query, host bueno como userinfo)"
        status: pass
      - kind: unit
        ref: "lib/domain/suscripcion.schema.test.ts#ni IP literal ni host local (5 casos, incluido el metadato de la nube y el propio stack local)"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/_actions.test.ts#un endpoint fuera de la allowlist no llega a la base (5 casos, con `from` sin llamar)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Las tres actions arrancan por el guard de sesion, antes de validar y antes de tocar la base (T-05-39)"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "app/(cleaner)/_actions.test.ts#el guard va antes de tocar la base (las tres, mas el relanzado del error que no es NoAutorizado)"
        status: pass
      - kind: other
        ref: "Senuelo corrido en los DOS sentidos: sustituido el guard por un cliente construido sin comprobar sesion -> 14 tests en rojo de 21. Restaurado -> 21 en verde"
        status: pass
    human_judgment: false
  - id: D3
    description: "El cliente no puede escribir su propia evidencia de verificacion (T-05-13)"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "app/(cleaner)/_actions.test.ts#NINGUNA de las cuatro columnas de evidencia aparece en el objeto"
        status: pass
      - kind: other
        ref: "`grep -vE '^\\s*(//|/\\*|\\*)' 'app/(cleaner)/_actions.ts' | grep -cE 'verificacion_grado|verificado_at|verificacion_token'` -> 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un telefono compartido no acaba recibiendo los aseos de otra persona (T-05-40)"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "app/(cleaner)/_actions.test.ts#el upsert va POR ENDPOINT, que es el invariante de la migracion 06"
        status: pass
      - kind: other
        ref: "`grep -c 'on conflict\\|onConflict' 'app/(cleaner)/_actions.ts'` -> 2"
        status: pass
    human_judgment: false
  - id: D5
    description: "El permiso solo se puede pedir tocando un boton, y la suscripcion sale en el mismo handler (T-05-35)"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "Por numero de linea en BotonActivarAvisos.tsx: permiso en la 70, `pushManager.subscribe` en la 81, `registrarSuscripcion` en la 89. Entre la 70 y la 81 no hay ninguna llamada a una action del servidor"
        status: pass
      - kind: other
        ref: "`grep -vE '^\\s*(//|/\\*|\\*)' BannerAvisos.tsx | grep -c requestPermission` -> 0: la unica llamada vive en el boton"
        status: pass
      - kind: other
        ref: "`grep -vE '^\\s*(//|/\\*|\\*)' BannerAvisos.tsx | grep -cE 'localStorage|sessionStorage'` -> 0: `Ahora no` vive en memoria de React"
        status: pass
    human_judgment: true
    rationale: "Que Safari conserve el gesto de usuario a traves de `navigator.serviceWorker.ready` no lo prueba ningun test de esta entrega: los componentes no tienen tests y el comportamiento solo se observa en un iPhone fisico. Es el procedimiento manual M1 del research"
  - id: D6
    description: "El aseador ve ayuda DISTINTA segun si nunca dio el permiso o si ya lo nego, y ninguna de las dos es roja"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "`grep -cE 'destructive' BannerAvisos.tsx` -> 0, comentarios incluidos"
        status: pass
      - kind: other
        ref: "`contenidoDelBanner()`: `nunca_pedido` y `negado` devuelven cuerpo y accion distintos, y el icono y el titulo salen de `PRESENTACION_AVISOS` (`Bell` contra `BellOff`). `negado` ademas bifurca por plataforma"
        status: pass
    human_judgment: true
    rationale: "Que el copy de recuperacion de iPhone sea SEGUIBLE por una aseadora de pie, con una mano y sin contexto previo, no lo puede afirmar un grep. Es UAT"
  - id: D7
    description: "Bajo el arbol del aseador solo se usan las clases de la escala movil, y un grep de CI lo impone"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "`bash scripts/ci/check-escala-movil.sh` -> `check-escala-movil: OK`, exit 0, con el arbol limpio"
        status: pass
      - kind: other
        ref: "Senuelo corrido en los DOS sentidos: clase sin sufijo inyectada en mis-aseos/page.tsx -> `npm run ci:arch` exit 1 nombrando archivo y linea. Revertido -> exit 0. Las dos salidas estan abajo"
        status: pass
      - kind: other
        ref: "Sobre el CSS del build, con `CSS=(.next/static/css/*.css)`: `text-body-movil{font-size:var(--text-body-movil);…}` y `min-h-toque-comodo{min-height:var(--spacing-toque-comodo)}`"
        status: pass
    human_judgment: false
  - id: D8
    description: "El banner no aparece medio segundo despues de cargar ni se cae solo, y no roba el foco"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "`Vista` devuelve `null` mientras `useEstadoDeAvisos()` devuelve `null` (§15.2), y la rama `activo` de la union no tiene nada que pintar. Sin `autoFocus`, sin `ref` de foco y sin `role=\"alert\"`: es `role=\"region\"`"
        status: pass
    human_judgment: true
    rationale: "El parpadeo real —el banner desaparece un instante al remontar tras un intento— solo se juzga mirandolo en un telefono. Va a UAT"

duration: 34 min
completed: 2026-09-11
---

# Fase 5 Plan 10: El banner de avisos y la unica puerta del permiso, Summary

La primera superficie del aseador de verdad: los cinco estados visibles de §7 con icono, titulo,
cuerpo y accion distintos y sin una nota de rojo; la unica llamada del proyecto a
`Notification.requestPermission()`, dentro de un `onClick` y con la suscripcion en el mismo handler;
y la allowlist de cuatro hosts que impide que el `endpoint` que manda el cliente convierta al
servidor en un emisor de peticiones a donde quiera.

## Performance

- **Duracion:** 34 min
- **Tareas:** 3 de 3
- **Archivos:** 7 creados, 5 modificados
- **Commits:** 5

## Accomplishments

### Task 1 — La allowlist y las tres Server Actions (TDD)

`lib/domain/suscripcion.schema.ts` sigue el molde exacto de `ical-url.schema.ts` y esquiva la misma
trampa: **se parsea con `URL` y se compara el `hostname` campo por campo, nunca con `includes` sobre
la cadena cruda**. Los cinco casos deceptivos que lo prueban estan escritos con nombre:

| Caso | Resultado |
|---|---|
| `https://push.apple.com.evil.com/QABC123` | rechazado |
| `https://xpush.apple.com/QABC123` | rechazado |
| `https://notfcm.googleapis.com/fcm/send/abc` | rechazado |
| `https://evil.com/?x=https://web.push.apple.com/QABC123` | rechazado |
| `https://web.push.apple.com@evil.com/QABC123` | rechazado |
| `https://web.push.apple.com./QABC123` (FQDN con punto final) | **aceptado** |

27 tests. `http://` cae aunque el host sea de la lista, y **no hay concesion de loopback**: aquella
existe en el esquema de feeds para que Playwright sirva fixtures, y dejarla aqui significaria aceptar
`https://127.0.0.1:54321`, que es el stack de Supabase de la maquina del desarrollador.

`app/(cleaner)/_actions.ts` copia la forma del analog de `(admin)` con el guard cambiado a
`exigirSesion()`. Las tres van guard → `safeParse` → base, el upsert va `on conflict (endpoint)`
—que es el invariante de la migracion 06: **el endpoint identifica al navegador, no a la persona**— y
ninguna nombra las cuatro columnas de evidencia. 21 tests.

**Senuelo corrido en los dos sentidos, como pide el plan.** Sustituido el guard por un cliente
construido sin comprobar la sesion, que es exactamente como se veria el endpoint abierto:

```
Tests  14 failed | 7 passed (21)
```

Restaurado:

```
Tests  21 passed (21)
```

### Task 2 — `BannerAvisos` y `BotonActivarAvisos`

Las tres reglas de §7.3 quedaron escritas como comentario numerado encima del handler, con la cita de
Apple, porque es el orden que se rompe al "limpiar" el codigo y su rotura **solo se ve en un iPhone**.
Verificado por numero de linea: permiso en la 70, `pushManager.subscribe` en la 81, registro en el
servidor en la 89, y entre las dos primeras el unico `await` es `navigator.serviceWorker.ready`.

El banner pinta los cinco casos con el copy literal de §18.1, §7.2 a §7.6 y §15.3, y los dos que
PWA-03 obliga a diferenciar se separan por icono, titulo, cuerpo y accion, **nunca por color**:
`grep -cE 'destructive'` sobre el archivo entero devuelve 0, comentarios incluidos.

Dos detalles que no eran obvios al empezar:

1. **`no_soportado` va en gris y no en ambar**, y eso es de producto: no hay nada que el aseador pueda
   hacer, y el ambar promete una accion que no existe. El unico sub-caso con boton es el del navegador
   embebido, que es **el mas probable de los tres** porque el link del onboarding se manda por
   WhatsApp.
2. **El cuerpo de §15.3 y la linea de §7.5 se reparten por momento.** El cuerpo cambia cuando el
   intento anterior fallo; la linea de apoyo solo sale cuando el que fallo fue una reconexion.
   Mostrarlas juntas diria lo mismo dos veces en la misma caja.

### Task 3 — Montaje, migracion de escala y guardarrail

El banner es el primer hijo de `<main>`, encima del `<h1>`. El stub de `/mis-aseos` ya no aplaza la
app del aseador: el copy es el de §15.1, porque **a partir de esta fase el aviso si llega**.

`scripts/ci/check-escala-movil.sh` cierra la deuda declarada 4 del contrato. **Probado con senuelo,
las dos salidas literales:**

Con la clase sin sufijo inyectada en `app/(cleaner)/mis-aseos/page.tsx`:

```
check-service-role: OK
check-max-w-tallas: OK
::error::clase tipografica sin el sufijo movil bajo app/(cleaner). 05-UI-SPEC.md §3.1 declara una
supersesion para ese arbol: los cuatro roles valen 28/20/16/14 px y las clases llevan sufijo. La
razon que obliga es del motor: iOS Safari hace ZOOM AUTOMATICO al enfocar un campo con font-size
menor a 16 px, y la Fase 6 es la que trae los campos (checklist y reportes). Arreglo: anadir el
sufijo a la clase. Contexto en la cabecera de app/(cleaner)/layout.tsx:
app/(cleaner)/mis-aseos/page.tsx:29:      <h1 className="text-displ…" >Mis aseos</h1>
exit=1
```

Tras revertir:

```
check-service-role: OK
check-max-w-tallas: OK
check-escala-movil: OK
exit=0
```

Verificado tambien sobre el CSS del build, con array de globs y nunca con sustitucion de comando:

```
text-body-movil{font-size:var(--text-body-movil);line-height:var(--tw-leading,var(--text-body-movil--line-height));…}
min-h-toque-comodo{min-height:var(--spacing-toque-comodo)}
bg-surface-warn{background-color:var(--surface-warn)}
```

## Deviations from Plan

### 1. [Rule 1 - Bug] `cn()` clasificaba los ocho roles tipograficos como COLOR, no como tamano

- **Encontrado en:** Task 2, antes de escribir el banner, midiendo el comportamiento real de
  `tailwind-merge` con la libreria instalada.
- **Problema:** `tailwind-merge` no reconoce estos nombres como tamanos de fuente y los mete en el
  grupo comodin de color de texto. Medido, las dos mitades:

  ```
  cn('text-sm', 'text-body-movil')             -> "text-sm text-body-movil"
  cn('text-micro-movil', 'text-muted-foreground') -> "text-muted-foreground"
  ```

  La primera deja las dos vivas y el tamano depende del orden del CSS: el override del sitio de uso
  **no desplaza** al `text-sm` que traen `Alert` y `Button`. La segunda es peor: **el tamano
  desaparece del DOM**, porque los dos caen en el grupo de color y gana el ultimo.
- **Arreglo:** grupo `font-size` declarado en `extendTailwindMerge`, con los cuatro roles de
  `(admin)` y los cuatro moviles. Es el mismo patron, la misma razon y el mismo sitio que el grupo
  `max-w` que costo dos quicks. Reverificado: `cn('text-sm','text-body-movil')` -> `text-body-movil`.
- **Archivo:** `lib/utils.ts`, que no estaba en `files_modified`.
- **Commit:** `2b36e35`

### 2. [Rule 2 - Faltaba funcionalidad] El `layout` baja el `endpoint` registrado

- **Encontrado en:** Task 3, al montar el banner y ver que `useEstadoDeAvisos` exige
  `endpointRegistrado` y el plan no decia de donde sale.
- **Problema:** con `null`, `coincideConElRegistrado()` devuelve `false` siempre y el hook **repara en
  silencio en cada arranque de la app**: baja la suscripcion, saca otra y registra la nueva. El
  endpoint rota en cada carga de pagina, y los avisos ya encolados al anterior quedan huerfanos.
- **Arreglo:** el layout consulta la suscripcion viva mas reciente del usuario y la baja como prop.
  La policy `push_subs_own_all` ya acota la consulta a sus filas; el `.eq('user_id', …)` es la
  segunda capa. La razon esta escrita entera en el sitio.
- **Commit:** `a813078`

### 3. [Rule 3 - Bloqueante] `revoked_reason` no tenia codigo para la baja desde el telefono

- **Encontrado en:** Task 1, al escribir `revocarSuscripcionPropia`.
- **Problema:** la regla 2 de `lib/data/push.ts` es que esa columna solo lleva **codigos de una union
  cerrada**, y existe para que un mensaje de error de la libreria de envio —que arrastra el `endpoint`
  entero— no acabe en una columna que el admin puede ver. La union no tenia ningun codigo para una
  baja pedida por el propio navegador.
- **Arreglo:** `baja_desde_el_telefono` entra en `CodigoDePush` con su razon al lado. La action lo
  importa **solo como tipo**, asi que el import se borra en compilacion.
- **Archivo:** `lib/data/push.ts`, que no estaba en `files_modified`.
- **Commit:** `9139c01`

### 4. [Rule 1 - Bug] Tres criterios de aceptacion se disparaban contra la prosa de las cabeceras

- **Encontrado en:** al correr los criterios de las tres tareas, una vez cada uno.
- **Problema:** son greps **sin filtro de comentarios**, asi que nombrar el token en una explicacion
  lo dispara igual que usarlo. Paso tres veces: `exigirAdmin` (la cabecera explicaba que aqui el guard
  es el otro), `fase siguiente` (la cabecera citaba el copy que se estaba reemplazando) y el marcador
  ingles de trabajo pendiente, que aparecio dentro de una frase en espanol perfectamente correcta.
- **Arreglo:** las tres cabeceras reformuladas, sin perder la explicacion, y con una nota escrita de
  por que el token no se reproduce. Es el cuarto tropiezo del repo con un guardarrail que funciona por
  regex y no por gramatica.
- **Commits:** `9139c01`, `a813078`, `49c1b4b`

### 5. [Rule 1 - Bug] Cinco avisos nuevos de `no-unused-vars` en el test de las actions

- **Encontrado en:** Task 1, en `npm run lint`.
- **Problema:** los dobles del cliente declaraban parametros que el cuerpo no usa, solo para que
  `.mock.calls[0][0]` fuera una tupla con forma. Es el mismo patron que ya produce un aviso aceptado
  en el test de `(admin)`, pero aqui eran cinco.
- **Arreglo:** los tres dobles se tipan con el generico de `vi.fn<T>()` en vez de con parametros. Se
  conserva el tipado de las llamadas y desaparecen los cinco avisos. La linea de base vuelve a ser
  **0 errores y los 2 avisos preexistentes**.
- **Commit:** `9139c01`

**Total: 5 desviaciones auto-resueltas** (3 bugs, 1 funcionalidad faltante, 1 bloqueante). **Impacto:**
ninguna cambia el alcance del plan. La primera arregla un defecto latente que afecta a TODO el repo,
no solo a esta fase.

## Divergencias de contrato anotadas, NO arregladas

Dos, las dos deliberadas:

1. **La CTA del sub-caso de navegador embebido se refleja por plataforma.** §18.1 solo lista
   `Cómo abrirlo en Safari`, pero §7.6 si bifurca el CUERPO (`"Abrir en Safari"` / en Android
   `"Abrir en Chrome"`). Dejar la CTA fija diria "Safari" en un Android. Se refleja el mismo criterio
   del cuerpo: `Cómo abrirlo en Chrome` cuando la plataforma visible es Android.
2. **El titulo de `no_soportado` sale de `PRESENTACION_AVISOS` y el cuerpo generico se queda en
   `Habla con tu administrador.`** §7.6 da tres cuerpos y ninguno es un titulo; el plan 05-09 ya
   decidio usar la primera oracion del cuerpo generico como titulo. Repetirla entera debajo seria
   decir lo mismo dos veces.

## Estado de la verificacion

| Puerta | Antes (05-09) | Ahora |
|---|---|---|
| `test:unit` | 41 archivos / 747 tests | **43 archivos / 795 tests** |
| `test:integration` | 17 archivos / 153 tests | 17 archivos / 153 tests |
| `npx tsc --noEmit` | 0 | **0** |
| `npm run lint` | 0 errores, 2 avisos preexistentes | **0 errores, los mismos 2 avisos** |
| `npm run ci:arch` | 2 scripts, limpio | **3 scripts, limpio** |
| `npm run build` | verde, 13 rutas | **verde, 13 rutas** |

Los 48 tests nuevos son 27 de `suscripcion.schema` y 21 de `app/(cleaner)/_actions`.

## Issues Encountered

Ninguno abierto. Las cinco desviaciones estan cerradas y commiteadas.

## Deuda declarada

1. **`endpointRegistrado` es UNO, no un conjunto.** Un aseador con dos telefonos vivos haria que el
   segundo no coincidiera con el que el layout baja y se reparase en cada arranque. El hook de
   `hooks/usarEstadoDeAvisos.ts` recibe un endpoint y no un conjunto, y ampliarlo seria una
   modificacion de aquel modulo, no de este plan. Con ocho aseadoras de un telefono cada una el caso
   no existe hoy. Escrito tambien en el sitio, dentro de `app/(cleaner)/layout.tsx`.
2. **Los dos componentes no tienen tests.** El plan no los pide y probarlos de verdad exige dobles de
   `Notification`, `ServiceWorkerRegistration` y `PushSubscription` mas un entorno de jsdom que el
   `vitest.config.ts` de `test:unit` no monta (`environment: 'node'`). Lo que hoy los respalda son
   criterios por grep y por numero de linea, mas los procedimientos manuales M1 y M4 del research y el
   E2E de Chromium que la fase todavia no tiene.
3. **`/instalar` todavia no existe.** Las cuatro acciones primarias de tipo enlace del banner apuntan
   ahi (`/instalar`, `?volver=1`, `?permiso=1`, `?navegador=1`). Es el plan 05-11, y hasta entonces
   esos botones llevan a un 404.
4. **`revocarSuscripcionPropia` y `marcarVisto` no tienen todavia sitio de uso.** El hook solo llama a
   `registrarSuscripcion`. La baja la necesita el flujo de `unsubscribe()` que trae el asistente, y la
   marca de visto se puede colgar del mismo arranque. Las dos existen, estan probadas y ninguna esta
   cableada.
5. **`ci/db.yml` corre `check-service-role.sh` a pelo, no `npm run ci:arch`.** Es decir: ni el
   guardarrail de anchos ni el nuevo de escala corren en CI, solo en local. Es preexistente, no lo
   introduce este plan, y ese archivo vive fuera de `.github/workflows/` a proposito.

## Next Phase Readiness

El plan 05-11 tiene lo que necesita: los cuatro destinos que el banner ya enlaza con sus parametros de
query (`?volver=1`, `?permiso=1`, `?navegador=1` y la raiz), `BotonActivarAvisos` listo para reusarse
en el paso 3 del asistente, y las tres actions del arbol del aseador. Lo que le queda es la pantalla
de `/instalar` con sus cuatro pasos y, sobre todo, el paso 4 de verificacion de D-02, que es el que
decide si una instalacion cuenta.

## Self-Check: PASSED

- Los 12 archivos declarados existen en disco.
- Los 5 commits existen en el historial (`f1f4343`, `9139c01`, `2b36e35`, `a813078`, `49c1b4b`).
- Los criterios de aceptacion de las tres tareas se corrieron uno por uno; los tres que salieron en
  rojo contra la prosa de una cabecera estan anotados como desviacion 4 y vuelven a salir en verde.
- Los dos senuelos se corrieron en los DOS sentidos y sus salidas estan transcritas arriba.
- La verificacion del CSS se hizo con array de globs, nunca con sustitucion de comando.
- Sin stubs: cero marcadores de trabajo pendiente en los archivos nuevos.
- `git status --short` limpio: ningun archivo generado quedo sin rastrear.
