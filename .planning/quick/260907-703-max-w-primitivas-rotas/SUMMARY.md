---
quick_id: 260907-703
slug: max-w-primitivas-rotas
date: 2026-09-07
type: quick
origin: diferido ALTA de la Fase 4 (hallado por el plan 04-14)
tags: [ui, tailwind, tokens, shadcn, deuda-tecnica]
key-files:
  created: []
  modified:
    - app/globals.css
    - lib/utils.ts
    - components/ui/alert-dialog.tsx
    - components/ui/tooltip.tsx
    - .planning/phases/04-dashboard-operativo-del-admin/deferred-items.md
decisions:
  - "Opcion 3 del diferido: token --container-<nombre-propio> dentro de la primitiva, no renombrar --spacing-* ni dispersar overrides por sitio de uso"
  - "Todo token nuevo de --container-* usado como max-w-* se registra tambien en el grupo `max-w` de cn(), o el override del sitio de uso no desplaza al de la primitiva"
metrics:
  duration: 1h 25m
  completed: 2026-09-07
commits:
  - b6dbc4c
  - 10e6ed7
  - dbf8a98
---

# Quick 260907-703: max-w de las primitivas rotas — Resumen

Tres tokens `--container-*` con nombre propio (`alerta`, `alerta-ancha`, `tooltip`) sacan a
`AlertDialog` y `Tooltip` de la colision con la escala de espaciado: pasan de 4 y 32 px de ancho a
320 y 384 px, medido en el CSS del build de produccion.

## Que se hizo

**Task 1 — los tres tokens (`b6dbc4c`).** `--container-alerta` (320px), `--container-alerta-ancha`
(384px) y `--container-tooltip` (320px) en `app/globals.css`, junto a `--container-dialogo` y
`--container-sheet`, con el comentario que explica por que llevan nombre propio y no nombre de
talla: en Tailwind v4.3 `max-w-<nombre>` resuelve contra `--spacing-*` antes que contra
`--container-*`, y la §2 del UI-SPEC nombra la escala de espaciado por tallas. El comentario deja
escrita la regla derivada — ningun `--container-*` puede llamarse igual que un `--spacing-*`
existente — y los dos caminos que el plan 04-14 ya probo y descarto, para que nadie los reintente.

**Task 2 — las dos primitivas (`10e6ed7`).**

| Archivo | Antes | Ahora |
|---|---|---|
| `components/ui/alert-dialog.tsx:55` | `data-[size=default]:max-w-xs` | `data-[size=default]:max-w-alerta` |
| `components/ui/alert-dialog.tsx:55` | `data-[size=sm]:max-w-xs` | `data-[size=sm]:max-w-alerta` |
| `components/ui/alert-dialog.tsx:55` | `data-[size=default]:sm:max-w-sm` | `data-[size=default]:sm:max-w-alerta-ancha` |
| `components/ui/tooltip.tsx:53` | `max-w-xs` | `max-w-tooltip` |

Las dos llevan ahora cabecera propia, como ya hacia `components/ui/sheet.tsx`: dicen que el archivo
se edito a proposito, en que, por que, y que una regeneracion con el CLI de shadcn las devuelve a
`max-w-xs` porque el CLI no conoce estos tokens.

**Task 3 — el diferido (`dbf8a98`).** La entrada ALTA de
`.planning/phases/04-dashboard-operativo-del-admin/deferred-items.md` queda tachada y marcada
RESUELTO 2026-09-07, con la opcion elegida, por que se descartaron las otras dos, y los tres
`max-width` medidos.

## La verificacion que importa

Este defecto es invisible en el codigo fuente: los nombres de clase se leen perfectamente bien, y
`tsc` y los unitarios pasan verdes con la caja rota. Solo aparece en el `max-width` que Tailwind
emite. Medido en `.next/static/css/5e62db4d6e358d65.css` del build de produccion:

```
.data-\[size\=default\]\:max-w-alerta[data-size=default]          {max-width:var(--container-alerta)}
.data-\[size\=sm\]\:max-w-alerta[data-size=sm]                    {max-width:var(--container-alerta)}
.data-\[size\=default\]\:sm\:max-w-alerta-ancha[data-size=default]{max-width:var(--container-alerta-ancha)}
.max-w-tooltip                                                    {max-width:var(--container-tooltip)}

--container-alerta:320px;  --container-alerta-ancha:384px;  --container-tooltip:320px;
```

Contra lo que emitia antes, en el mismo archivo y todavia presente para `Sheet` y `Dialog`, que si
llevan override en el sitio de uso:

```
.max-w-xs{max-width:var(--spacing-xs)}    --spacing-xs:4px;
.max-w-sm{max-width:var(--spacing-sm)}    --spacing-sm:8px;
```

De 4px a 320px en el `AlertDialog` movil y en el de tamano `sm`; de 8px a 384px en el `default` a
partir del breakpoint `sm`; de 4px a 320px en el `Tooltip`.

Consumidores que quedan arreglados sin tocarlos: `DialogoCerrarAseo`, `DialogoCancelarAseo`,
`DialogoDesactivarApartamento`, `DialogoDesactivarAseador`, el tooltip de la marca de frescura y el
del boton de confirmar sin responsable.

## Suites

| Comando | Baseline | Resultado |
|---|---|---|
| `npm run build` | verde | **EXIT=0** |
| grep del CSS de produccion | `max-w-alerta` a 320px, no a 4px | **320px / 384px / 320px** |
| `npm run test:unit` | 568 en 31 archivos | **568 en 31** |
| `npm run test:integration` | 145 en 16 archivos | **145 en 16** |
| `npm run db:test` | `Files=7, Tests=153, PASS` | **`Files=7, Tests=153, PASS`** |
| `npm run lint` | 0 errores, 2 warnings | **0 errores, 2 warnings** |
| `npx tsc --noEmit` | sin salida | **sin salida, exit 0** |

Ninguna baja.

## Desviaciones del plan

### 1. [Regla 2 — funcionalidad critica que faltaba] Registrar los tres tokens en `cn()`

- **Encontrado en:** Task 1, al leer `lib/utils.ts`.
- **El problema:** `cn()` usa `extendTailwindMerge` con una lista explicita de los `max-w-*` con
  nombre del proyecto, y su propio comentario dice literalmente que cuando aparezca uno nuevo hay
  que anadirlo AHI TAMBIEN, o vuelve el fallo silencioso. Sin registrarlos, un futuro
  `<AlertDialogContent className="max-w-dialogo">` no desplazaria al `max-w-alerta` de la primitiva:
  las dos clases sobreviven al merge y gana la que el CSS emita despues, que no esta garantizado.
  Es exactamente el fallo que el plan 04-14 acababa de cerrar para `Sheet`.
- **El arreglo:** `max-w-alerta`, `max-w-alerta-ancha` y `max-w-tooltip` anadidos al grupo `max-w`,
  y actualizada la seccion "LO QUE NO ARREGLA" de la cabecera, que citaba estas dos primitivas como
  pendientes.
- **Archivo:** `lib/utils.ts`. **Commit:** `b6dbc4c`.

### 2. [Regla 2] Cabecera de aviso en las dos primitivas

- **Por que:** el repo declara los archivos de `components/ui/` regenerables a proposito, y
  `sheet.tsx` documenta sus desviaciones justo por eso. Sin la cabecera, el siguiente
  `npx shadcn add alert-dialog` devuelve `max-w-xs` y el defecto vuelve sin que nadie lo note hasta
  verlo en el navegador.
- **Commit:** `10e6ed7`.

## Notas de entorno, para el siguiente que ejecute aqui

**`npm run build` necesita red.** Falla con `getaddrinfo ENOTFOUND fonts.gstatic.com` sin salida a
internet: `next/font/google` descarga Poppins en tiempo de build. En un entorno sin red el proceso
muere en el reintento 1/3 sin dejar codigo de salida.

**Nunca dejar dos `next build` a la vez sobre el mismo `.next`.** Cuatro corridas concurrentes (tres
huerfanas de shells que el harness mato por timeout, mas la viva) corrompieron el directorio y
produjeron un fallo que parecia de codigo y no lo era:

```
Error occurred prerendering page "/"
Element type is invalid: expected a string ... but got: object
```

`app/page.tsx` es un `redirect('/login')` de una linea y no toca ninguna de las dos primitivas. Un
`rm -rf .next` y una unica corrida limpia dieron EXIT=0. Comprobar `pgrep -f "next build"` antes de
lanzar otro, y `ps -o lstart` para distinguir el vivo de los huerfanos.

**La maquina esta apretada de memoria**, no solo de I/O: 8 GB de RAM con 6,8 de los 7 GB de swap ya
usados. Es un candidato serio a que un worker de build muera sin mensaje. El I/O de iCloud sigue
dominando el reloj como esta documentado: un build en frio tarda decenas de minutos con la CPU al
1 %, y el mismo build con caches calientes compila en 76 s.

**Duplicados de iCloud apartados:** 14 archivos con sufijo numerico en `.next/types/` y un
directorio `.next/cache 2`. Son artefactos de build, `.next/` esta en `.gitignore`, no se commiteo
nada sobre ellos. Sigue vivo `.env 2.example`, que ya esta reportado como diferido de la Fase 4.

## Lo que este quick NO cierra

`max-w-xs` y `max-w-sm` **siguen emitidos** en el CSS y siguen valiendo 4 y 8 px. Los usan
`components/ui/sheet.tsx` y `components/ui/dialog.tsx`, y ahi no molestan porque los dos llevan
override con token propio en su sitio de uso (`data-[side=right]:sm:max-w-sheet` y
`sm:max-w-dialogo`), que es lo que el plan 04-14 dejo funcionando. La colision de fondo entre la
escala `--spacing-*` con nombres de talla y el namespace `--container-*` **sigue existiendo**: la
opcion 1 del diferido (renombrar la escala) no se ejecuto, y cualquier primitiva nueva que llegue
con `max-w-md` o `max-w-lg` nacera rota igual. La regla derivada queda escrita en `app/globals.css`
y en las dos cabeceras, que es la mitigacion que cabe en un quick.

## Self-Check: PASSED

Archivos verificados en disco y commits verificados en `git log`:

- `app/globals.css` — FOUND, con los tres tokens
- `lib/utils.ts` — FOUND, con los tres en el grupo `max-w`
- `components/ui/alert-dialog.tsx` — FOUND, sin `max-w-xs` ni `sm:max-w-sm` en el codigo
- `components/ui/tooltip.tsx` — FOUND, con `max-w-tooltip`
- `.planning/phases/04-dashboard-operativo-del-admin/deferred-items.md` — FOUND, entrada tachada
- `b6dbc4c`, `10e6ed7`, `dbf8a98` — FOUND en `git log`
