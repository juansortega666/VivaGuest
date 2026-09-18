---
phase: 08-paneles-laterales-en-el-admin
plan: 04
subsystem: ui
tags: [sheet, base-ui, tailwind-v4, tailwind-merge, tokens, accesibilidad, suspense, skeleton, app-router]

requires:
  - phase: 04-operaci-n-diaria
    provides: "components/ui/sheet.tsx con las tres desviaciones documentadas en su cabecera, y FilaAseo.tsx, que fijó la distinción entre las dos formas de ausencia"
  - phase: 07-finanzas
    provides: "SheetDesglosePago.tsx, el patrón completo del panel de lectura en producción: cuerpo scrollable, encabezado de sección en mayúscula en el DOM y el espacio inicial de la descripción"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-02-MEDICION.md, cuyo VEREDICTO §6.2 son ocho instrucciones ejecutables, cinco de ellas vinculantes para este plan"
provides:
  - "PanelLectura: el armazón de las cinco zonas de §6.1, con los TRES overrides obligatorios de §12.1 en un solo archivo"
  - "GrupoDePanel: sección etiquetada por su encabezado de nivel 3, lista de definición y separador de 33px"
  - "FilaDeDato: la fila de dos extremos de §6.2, con la forma de ausencia obligada por el compilador"
  - "EsqueletoDePanel: el fallback de la barrera de suspensión, con la geometría de §6.4 y la regla de la clave escrita en su cabecera"
  - "--container-boton-mostrar (108px), el único token nuevo de la fase"
  - "Los dos archivos de carga de segmento de /apartamentos y /operacion, borrados, que es lo que devuelve el scroll del criterio 1"
affects: [08-05, 08-06, 08-07, 08-08, 08-09, 08-10, 08-11, 08-14]

tech-stack:
  added: []
  patterns:
    - "Los overrides obligatorios de una primitiva viven en UN armazón compartido, no repetidos en cada sitio de uso: la cadena de variantes del ancho tiene que repetirse exacta y el olvido es silencioso"
    - "Unión discriminada por `valor: NonNullable<ReactNode> | null` para que el compilador EXIJA la forma de ausencia cuando el valor falta"
    - "La dirección de cierre llega como prop ya compuesta desde el servidor, nunca como constante del componente, para no borrar los parámetros vivos del anfitrión"
    - "Detección de desbordamiento con ResizeObserver más MutationObserver, que es lo que hace enfocable el cuerpo scrollable SOLO cuando de verdad desborda"

key-files:
  created:
    - app/(admin)/_components/PanelLectura.tsx
    - app/(admin)/_components/GrupoDePanel.tsx
    - app/(admin)/_components/FilaDeDato.tsx
    - app/(admin)/_components/EsqueletoDePanel.tsx
  modified:
    - app/globals.css
    - app/(admin)/apartamentos/page.tsx
    - app/(admin)/operacion/page.tsx
  deleted:
    - app/(admin)/apartamentos/loading.tsx
    - app/(admin)/operacion/loading.tsx

key-decisions:
  - "Los dos archivos de carga de segmento se borran EN ESTE PLAN, aunque no estaban en sus files_modified: la INSTRUCCIÓN 2 del VEREDICTO dice 'antes de construir ningún panel' y este es el último plan antes de la wave de paneles. Ningún plan de la fase la tenía asignada"
  - "EsqueletoDePanel deja apagada por defecto la cabecera en gris de §11.1, y no es un olvido: §11.4 obliga a la página a resolver el identificador contra lo que ya leyó, así que el nombre está disponible en el primer render y un nombre gris donde cabe el nombre real es una regresión. La bandera existe y está documentada para el panel que algún día no conozca su nombre sin una lectura"
  - "Las barras del esqueleto miden un píxel menos que la línea de texto que sustituyen (20 por 21, 16 por 17): la escala numérica de Tailwind no llega a 21 y §2 prohíbe el valor arbitrario. Declarar dos tokens de alto para ahorrarse 13px acumulados en el panel más cargado no compensa en una fase que declara un token"
  - "GrupoDePanel es componente de cliente y FilaDeDato no: el grupo necesita el generador de identificadores de React para la referencia por identificador que pide §13.2, y derivar ese identificador del texto sería más frágil"
  - "Un grupo sin encabezado no abre sección, solo lista de definición: una sección sin nombre no se anuncia como región, que es lo correcto para un dato suelto"
  - "El separador es HERMANO del grupo, no hijo, para que los 16px de cada lado los ponga la separación del cuerpo y el coste sea exactamente los 33px contados en §6.4"

patterns-established:
  - "Armazón compartido para superficies hermanas: un panel nuevo se escribe importando cuatro componentes y decidiendo qué datos pone dentro, sin decidir anchos, pesos, separaciones, cómo se cierra ni cómo se ve mientras carga"
  - "El fallback de suspensión con geometría real, dentro del panel y nunca con clave derivada de los parámetros de búsqueda"
  - "La cabecera explicativa sobre la página cuando se borra su archivo de carga de segmento, con el A/B medido y la prohibición de reintroducirlo"

requirements-completed: []

coverage:
  - id: D1
    description: "PanelLectura: el armazón de las cinco zonas, con los tres overrides obligatorios de la primitiva en un solo sitio y el cierre que no borra los parámetros del anfitrión"
    verification:
      - kind: other
        ref: "grep -c 'data-\\[side=right\\]:sm:max-w-sheet' → 1 · grep -c 'font-semibold' → 1 · grep -c 'router.replace(rutaAlCerrar' → 1 · grep -c 'keydown|onKeyDown|KeyboardEvent' → 0"
        status: pass
      - kind: other
        ref: "npm run ci:arch && npx tsc --noEmit && npm run lint"
        status: pass
    human_judgment: true
    rationale: "Que el panel MIDA 480px y no 384 solo se ve en el navegador: el guardarraíl atrapa la clase con nombre de talla, pero no que la cadena de variantes desplace a la de la primitiva. Lo comprueba el primer panel que lo consuma (08-06) y el barrido visual de 08-12"
  - id: D2
    description: "El token --container-boton-mostrar (108px), con nombre propio y su derivación escrita"
    verification:
      - kind: other
        ref: "grep -c 'container-boton-mostrar' app/globals.css → 1, dentro del bloque de tema · npm run ci:arch"
        status: pass
    human_judgment: false
  - id: D3
    description: "GrupoDePanel y FilaDeDato: sección con encabezado de nivel 3, lista de definición, fila de dos extremos alineada por línea base, y las dos formas de ausencia"
    verification:
      - kind: other
        ref: "npx tsc --noEmit sobre un fixture con `valor={null}` sin `ausencia` → error TS2322 'Property ausencia is missing' · grep -c 'formatCOP|Intl\\.' en los dos → 0"
        status: pass
    human_judgment: true
    rationale: "Que la fila se lea derecha y no torcida, y que el par etiqueta-valor se anuncie como par, son juicios de pantalla y de lector. Los cubre 08-12 (barrido visual) y 08-13 (accesibilidad)"
  - id: D4
    description: "EsqueletoDePanel con la geometría de §6.4, sin nada girando, sin atenuar la lista y con la regla de la clave escrita en su cabecera"
    verification:
      - kind: other
        ref: "grep -ci 'Loader|animate-spin' → 0 · grep -c 'pointer-events-none' → 0 · la cabecera cita el VEREDICTO y la rama tomada"
        status: pass
    human_judgment: true
    rationale: "Que el gris tenga la forma del texto que sustituye solo se comprueba viéndolo con datos lentos. Lo cubre 08-12"
  - id: D5
    description: "Los dos archivos de carga de segmento borrados, con su cabecera explicativa en las dos páginas: la mitad 'scroll' del criterio 1"
    verification:
      - kind: e2e
        ref: "PLAYWRIGHT_PORT=3210 npx playwright test e2e/apartamentos-lista.spec.ts e2e/operacion.spec.ts e2e/operacion-alertas.spec.ts e2e/calendario.spec.ts → 36 passed"
        status: pass
    human_judgment: true
    rationale: "El E2E de arriba prueba que borrarlos no rompe nada. Que el scroll SE CONSERVE al abrir un panel no se puede probar todavía: no existe ningún panel que abrir. Lo mide 08-11 con el instrumento de la INSTRUCCIÓN 7"

duration: 45min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 04: El armazón de los paneles laterales

**Cuatro componentes y un token que convierten un panel nuevo en "importar cuatro cosas y decidir qué datos van dentro": ni anchos, ni pesos, ni separaciones, ni cómo se cierra, ni cómo se ve mientras carga.**

## Performance

- **Duración:** ~45 min
- **Empezado:** 2026-09-17 20:05 (-05)
- **Terminado:** 2026-09-17 20:50 (-05)
- **Tareas:** 3 del plan, más una desviación ejecutada como cuarta
- **Archivos:** 4 creados, 3 modificados, 2 borrados

## Lo que quedó hecho

- **`PanelLectura` concentra los tres overrides obligatorios de la primitiva**, que es la razón entera de que esto sea un plan y no cuatro copias. La cabecera de `components/ui/sheet.tsx` documenta tres desviaciones y solo la del ancho base está arreglada dentro; las otras dos hay que ponerlas en el sitio de uso. La cadena de variantes del ancho se escribe completa, con el comentario que explica por qué no se puede abreviar: la herramienta de fusión de clases solo ve en conflicto dos clases del mismo grupo **con la misma cadena de variantes**, así que una clase suelta no desplaza a la de la primitiva y el panel pasa a medir 384 en vez de 480 sin que nada se ponga rojo.
- **La ruta al cerrar es un prop ya compuesto, no una constante.** `SheetDesglosePago` cierra contra una constante y funciona porque su anfitrión no tiene más parámetros; los otros tres sí (`alertas` en `/operacion`, `rango` y `ancla` en `/finanzas`) y una constante se los borra.
- **Un valor ausente no puede llegar a un lector de pantalla como un glifo suelto**, y no por convención sino porque el compilador lo impide: sin valor, el tipo exige elegir entre `sin definir` y `no aplica`. Comprobado con un fixture que `tsc` rechaza.
- **El esqueleto tiene la forma del contenido**, no un icono girando en el centro, y deja escrita en su cabecera la regla que protege el criterio 1: la clave por identificador va sobre el panel, nunca sobre la barrera de suspensión ni sobre nada que envuelva a la tabla.
- **Y lo que de verdad mueve la aguja hoy:** los dos archivos de carga de segmento de `/apartamentos` y `/operacion` se borraron. Es la mitad "scroll" del criterio 1, y es condición necesaria y suficiente según el A/B de `08-02`.

## Commits

1. **Task 1: el token y el armazón del panel** — `b72fbb4` (feat)
2. **Task 2: el grupo y la fila de dato** — `46aa7be` (feat)
3. **Desviación: fuera los dos archivos de carga de segmento** — `556471a` (fix)
4. **Task 3: el esqueleto con geometría real** — `d9ded40` (feat)

El commit de la desviación va ANTES del de la Task 3 a propósito: la cabecera de
`EsqueletoDePanel` afirma que los dos archivos se borraron en este plan, y una
afirmación así no puede entrar al repo antes que el hecho que afirma.

## Archivos

| Archivo | Qué hace |
|---|---|
| `app/(admin)/_components/PanelLectura.tsx` | Las cinco zonas de §6.1. Cabecera fija, cuerpo que scrollea, pie opcional. Los tres overrides de §12.1 |
| `app/(admin)/_components/GrupoDePanel.tsx` | Encabezado de nivel 3 en versalita, lista de definición, separador de 33px |
| `app/(admin)/_components/FilaDeDato.tsx` | La fila de dos extremos de §6.2, con las dos formas de ausencia |
| `app/(admin)/_components/EsqueletoDePanel.tsx` | El fallback de la barrera de suspensión, con la geometría de §6.4 |
| `app/globals.css` | `--container-boton-mostrar: 108px`, con su derivación y su defensa |
| `app/(admin)/apartamentos/page.tsx` | La cabecera que explica por qué esta ruta ya no tiene archivo de carga |
| `app/(admin)/operacion/page.tsx` | Lo mismo, con sus propias cifras del A/B |
| ~~`app/(admin)/apartamentos/loading.tsx`~~ | Borrado |
| ~~`app/(admin)/operacion/loading.tsx`~~ | Borrado |

## Decisiones

**1. El separador es hermano del grupo, no hijo.** §6.3 cuenta 33px: 16 arriba,
1 de filo y 16 abajo. Esos 16 de cada lado los pone la separación del cuerpo del
panel. Si el separador viviera dentro del grupo, el de arriba saldría de la
separación entre encabezado y filas, que son 8, y la cuenta de §6.4 se caería sin
que nadie lo notara hasta medir el panel lleno.

**2. `GrupoDePanel` es de cliente y `FilaDeDato` no.** §13.2 pide que la sección
esté etiquetada POR su encabezado, y eso se escribe con una referencia por
identificador. El generador de identificadores de React es un hook, y un hook no
corre en un componente de servidor. Derivar el identificador del texto sería más
barato y más frágil: catorce encabezados fijos hoy, dos iguales el día que un
panel repita `DINERO`. La fila no necesita nada de eso y se queda en el servidor.

**3. Un grupo sin encabezado no abre sección.** Solo la lista de definición. Una
sección sin nombre accesible no se anuncia como región, así que abrirla para un
dato suelto sería ruido de estructura.

**4. Las barras del esqueleto miden un píxel menos que su línea de texto.** 20
por 21 y 16 por 17. La escala numérica de espaciado de Tailwind no pasa por 21 ni
por 17, §2 prohíbe el valor arbitrario, y declarar dos tokens de alto para
ahorrarse 13px acumulados en el panel más cargado no compensa en una fase cuyo
contrato dice "un solo token nuevo". Las separaciones sí son exactas: 8 entre
filas, 8 bajo el encabezado del grupo, y 16 + 1 + 16 en el separador. Está
escrito en la cabecera del archivo con la aritmética completa.

**5. El cuerpo enfocable se decide midiendo, no suponiendo.** §13.1 dice "solo
cuando de verdad desborda", y eso obliga a mirar el DOM. Hacen falta los dos
observadores: redimensionar la ventana cambia la caja del contenedor sin mutar su
contenido, y resolver la barrera de suspensión sustituye el contenido sin cambiar
la caja.

## Desviaciones del plan

### 1. [Regla 2 · funcionalidad crítica que faltaba] El borrado de los dos archivos de carga de segmento

- **Encontrado en:** la lectura previa, antes de la Task 1.
- **El problema:** la **INSTRUCCIÓN 2** del VEREDICTO de `08-02-MEDICION.md`
  §6.2 ordena borrar `app/(admin)/apartamentos/loading.tsx` y
  `app/(admin)/operacion/loading.tsx` **"antes de construir ningún panel"**.
  Esa instrucción **no está asignada a ningún plan de la fase**: `08-06` y
  `08-07`, que son los que construyen los paneles de esas dos rutas, no los
  llevan en sus `files_modified`. El VEREDICTO se escribió después que los
  planes, y la instrucción se quedó sin dueño.
- **Por qué este plan:** `08-04` es wave 1 y es el último plan antes de la wave
  de paneles. "Antes de construir ningún panel" apunta aquí.
- **Lo hecho:** los dos archivos borrados, y las dos páginas anfitrionas con la
  cabecera explicativa que trae el A/B (`1057 → 0` con el archivo, `1057 → 1057`
  sin él, 3 de 3 en `/apartamentos`; `277 → 0` contra `277 → 277` en
  `/operacion`), el mecanismo, lo que se pierde y la prohibición de
  reintroducirlos sin volver a medir. Es el mismo trato, con la misma forma, que
  `app/(admin)/finanzas/page.tsx` lleva desde la Fase 7.
- **Lo que NO se tocó:** ningún otro archivo de carga del árbol, y
  `components/ui/sheet.tsx` tampoco. §6.3 del VEREDICTO lo prohíbe por nombre, y
  el escenario de control lo justifica: un enlace de cliente que no abre ningún
  panel pierde el scroll igual.
- **Verificación:** `PLAYWRIGHT_PORT=3210 npx playwright test
  e2e/apartamentos-lista.spec.ts e2e/operacion.spec.ts
  e2e/operacion-alertas.spec.ts e2e/calendario.spec.ts` → **36 en verde**.
- **Commiteado en:** `556471a`.

### 2. [Decisión documentada] La cabecera en gris del esqueleto queda apagada por defecto

- **Encontrado en:** Task 3.
- **La tensión:** §11.1 describe el esqueleto con "la cabecera con dos barras de
  21 y 17px". Pero §11.4 obliga a la página a resolver el identificador **contra
  lo que ya leyó**, no contra la base, así que en los cuatro paneles de esta fase
  el nombre y la línea de apoyo están disponibles en el primer render y
  `PanelLectura` los pinta de verdad. Pintarlos en gris sería una regresión.
- **Lo hecho:** las dos barras están implementadas y la bandera existe; está
  apagada por defecto, con el razonamiento y la cita de §11.4 escritos en el
  propio prop. Si algún día un panel no puede conocer su nombre sin una lectura,
  la barrera de suspensión envolverá al panel entero y la bandera se enciende.
- **Commiteado en:** `d9ded40`.

---

**Total de desviaciones:** 2 (una de Regla 2, una de contrato con razón escrita).
**Impacto:** ninguno sobre el alcance. La primera es lo que hace verdadera la
mitad "scroll" del criterio 1 y sin ella los planes de la wave 2 habrían
construido paneles sobre el defecto medido.

## Instrucciones del VEREDICTO, fila por fila

| Instrucción | Qué exige | Cómo se cumplió |
|---|---|---|
| **2** · fuera los dos archivos de carga | Borrarlos antes de construir ningún panel, con cabecera explicativa | Hecho, commit `556471a`. Los demás no se tocan |
| **3** · ninguna clave derivada de los parámetros | La clave va sobre el panel, nunca sobre la barrera ni sobre lo que envuelve la tabla | Escrita en la cabecera de `EsqueletoDePanel` con su razón, y repetida en `PanelLectura` |
| **4** · el esqueleto va dentro del panel | Con la geometría real, porque el del segmento no se pinta nunca | `EsqueletoDePanel` es el fallback de la barrera propia del panel |
| **5** · los enlaces de apertura conservan los parámetros | El `href` se compone desde los parámetros vivos | Es de los planes de wave 2 y 3, pero la mitad del cierre está resuelta: `rutaAlCerrar` es prop, no constante, y el prop lo dice con esas palabras |
| **7** · el instrumento de espera | `esperarUrlDeCliente()` y `esperarControlHidratado()` | No aplica a este plan: no añade ni toca ningún caso E2E |

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run ci:arch` | **limpio** (los tres guardarraíles) |
| `npx tsc --noEmit` | **limpio** |
| `npm run lint` | **0 errores**, 2 avisos preexistentes en archivos de test |
| `npm run test:unit` | **1229 en verde**, 65 archivos. Exactamente la línea base |
| E2E de las rutas tocadas (puerto 3210) | **36 en verde** (lista de apartamentos, operación, alertas, calendario) |
| `git diff --name-only` contra `app/(cleaner)` | **vacío**. Criterio 6 del ROADMAP intacto |
| Aserciones de grep de las tres tareas | las nueve en su valor esperado |

## Problemas encontrados

**El puerto por defecto de la suite E2E es 3000, y había un `next dev` de otro
proyecto encima.** Dos corridas dieron 14 rojos idénticos con la página de login
en 404 y el indicador de herramientas de desarrollo de Next en el snapshot:
`reuseExistingServer` está en `true` fuera de CI, vio el puerto ocupado y reusó
**una aplicación distinta**. La cabecera de `playwright.config.ts` ya avisa de
esta trampa y la medición de `08-02` corrió en 3210 por esto mismo.

**Con `PLAYWRIGHT_PORT=3210`, las 36 en verde.** Queda anotado para los planes de
la fase que corran E2E: **fijar el puerto siempre**, o un rojo puede no ser del
código.

## Lo que queda listo para la wave 2

Los cuatro planes de panel (`08-06` apartamento, `08-07` aseo, `08-08` aseadora,
`08-09` calendario) ya no tienen que decidir nada del armazón. Importan:

```tsx
import { PanelLectura } from '@/app/(admin)/_components/PanelLectura';
import { GrupoDePanel } from '@/app/(admin)/_components/GrupoDePanel';
import { FilaDeDato } from '@/app/(admin)/_components/FilaDeDato';
import { EsqueletoDePanel } from '@/app/(admin)/_components/EsqueletoDePanel';
```

Y la forma de uso, que es la que protege el criterio 1:

```tsx
<PanelLectura
  key={fila.id}
  titulo={fila.nombre}
  apoyo={…}
  rutaAlCerrar={rutaSinElParametroDelPanel}
  pie={…}
>
  <Suspense fallback={<EsqueletoDePanel grupos={[3, 2, 3, 1]} />}>
    <CuerpoDelPanel id={fila.id} />
  </Suspense>
</PanelLectura>
```

**Lo que cada uno todavía tiene que poner de su parte, y no lo cubre este plan:**

1. **El `scroll={false}` de los seis enlaces de apertura.** Es prop del enlace,
   no del panel, y ningún componente de aquí lo puede garantizar.
2. **Componer el `href` desde los parámetros vivos** de la pantalla, nunca una
   consulta literal (INSTRUCCIÓN 5).
3. **Componer `rutaAlCerrar`** quitando solo el parámetro del panel.
4. **La clave sobre el panel**, y en ningún otro sitio.

## Deuda declarada

- **El ancho de 480px no está verificado en el DOM.** El guardarraíl atrapa la
  clase con nombre de talla, pero no que la cadena de variantes desplace a la de
  la primitiva. Lo comprueba el primer panel que exista, en `08-06`, y el barrido
  visual de `08-12`.
- **La mitad "scroll" del criterio 1 no se puede medir todavía**: no hay panel
  que abrir. Lo mide `08-11`.

## Self-Check: PASSED

- `app/(admin)/_components/PanelLectura.tsx` — FOUND
- `app/(admin)/_components/GrupoDePanel.tsx` — FOUND
- `app/(admin)/_components/FilaDeDato.tsx` — FOUND
- `app/(admin)/_components/EsqueletoDePanel.tsx` — FOUND
- `app/(admin)/apartamentos/loading.tsx` — AUSENTE (borrado a propósito)
- `app/(admin)/operacion/loading.tsx` — AUSENTE (borrado a propósito)
- `b72fbb4` — FOUND
- `46aa7be` — FOUND
- `556471a` — FOUND
- `d9ded40` — FOUND

---
*Fase: 08-paneles-laterales-en-el-admin*
*Terminado: 2026-09-17*
