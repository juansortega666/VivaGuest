---
phase: 06-pwa-del-aseador-offline-first
plan: 04
subsystem: fotos
tags: [compresion, exif, storage, privacidad, check-04, compressorjs, webp-descartado]

requires:
  - phase: 01
    provides: "El bucket privado `evidencia` (migracion 10) y `cleaning_photos` con `grant select, insert` y policy para el aseador"
  - phase: 06-01
    provides: "`unskip_room_evidence`, que se llama cuando la foto de un cuarto saltado si llega"
provides:
  - "`compressorjs@1.3.0`: la unica dependencia nueva de la fase"
  - "`lib/fotos/politica.ts`: la escalera de calidades y cuando parar. PURO y con 16 tests"
  - "`lib/fotos/comprimir.ts`: compresion a JPEG con EXIF borrado y orientacion aplicada a pixeles"
  - "`lib/fotos/nombres.ts`: la ruta que decide el SERVIDOR"
  - "`lib/data/evidencia.ts`: firma de subida y registro idempotente"
  - "Seis Server Actions de la ejecucion del aseo"
  - "Migracion 20: `p_nota` opcional en los dos RPC que la pantalla llama"
affects: [06-07, 06-08, 06-09, 06-10]

tech-stack:
  added: [compressorjs@1.3.0]
  patterns:
    - "La politica probable se separa del cableado que no se puede instrumentar: politica.ts tiene tests, comprimir.ts es canvas puro"
    - "Un 23505 sobre un unique de idempotencia es EXITO y no error: tratarlo como fallo convierte un reintento en foto perdida"
    - "Los tipos generados de Supabase SI reflejan los DEFAULT de los argumentos, asi que hacer un argumento opcional en SQL es la forma limpia de que el tipo diga la verdad"
    - "Un criterio de aceptacion por grep negativo se auto-invalida si el comentario nombra el literal que veta"
---

# 06-04: La cadena de la foto

## Que se construyo

Comprimir en el telefono, firmar el permiso de subida, subir y registrar. Mas las seis Server
Actions que la pantalla del aseador va a llamar.

## La investigacion de WebP, que el desarrollador pidio y que salio en contra

Se propuso WebP por ser mas pequeno. Dos hallazgos la descartaron:

1. **Safari no puede CODIFICAR WebP en canvas.** Fuente primaria, `browser-compat-data`:
   `toBlob > type_parameter_webp > safari: false`, y `safari_ios` lo espeja. El iPhone **muestra**
   WebP desde iOS 14 pero **no sabe generarlo**, y toda la compresion ocurre en el cliente.
2. **Y no siempre es mas pequeno.** Medido en Chromium sobre 1280x960 con ruido y bordes duros:

   | Calidad | JPEG | WebP | |
   |---|---|---|---|
   | 0.6 | 188 kB | 253 kB | WebP **34% mas grande** |
   | 0.7 | 248 kB | 282 kB | 14% mas grande |
   | 0.8 | 342 kB | 348 kB | empate |

   Honestidad sobre ese numero: el ruido aleatorio es el peor caso para WebP, y en una foto real con
   paredes planas WebP si gana. Lo que la medicion **si** prueba es que "WebP siempre pesa menos" es
   falso.

Registrado en `PROJECT.md` §Key Decisions, porque alguien lo va a volver a proponer.

## La compuerta de paquete encontro algo, y por eso existe

`CLAUDE.md` §6 habia elegido `browser-image-compression`. La compuerta destapo que **arrastra `uzip`
como dependencia de produccion**: un compresor DEFLATE escrito desde cero, **sin repositorio publico
declarado** y congelado hace 4 anos.

Descargue el tarball y lo inspeccione sin instalarlo: **`uzip` no aparece ni una vez en el codigo
distribuido**. Esta declarado por error del autor. No llegaria al telefono, pero el paquete tambien
lleva **3 anos sin release**.

Comparadas con datos de GitHub y del registry:

| Paquete | Estrellas | Ultimo push | Issues |
|---|---|---|---|
| **`compressorjs`** | **5766** | **2026-08-29** | **5** |
| `pica` | 4150 | 2026-08-15 | es un *resampler*, no maneja EXIF |
| `browser-image-compression` | 1715 | 2023-03-06 | arrastra `uzip` |
| `image-conversion` | 954 | 2022-05-05 | abandonado |

Cinco issues abiertos con 5,7k estrellas fue lo que decidio. MIT, dos dependencias y las dos son
hojas sin dependencias propias. `npm audit` confirma que **ninguna vulnerabilidad viene de la
libreria nueva**: las 4 que hay son de `postcss` y `browserslist`, preexistentes, de la cadena de
build de Next, Tailwind, vitest y shadcn.

## Y la contradiccion de CHECK-04 se disolvio sola

`CLAUDE.md` decia `preserveExif: true`; CHECK-04 exige borrarlo. Con `compressorjs` no hay que
elegir: su `retainExif` es **falso por defecto** y su `checkOrientation` **lee la orientacion y rota
los pixeles**. La foto sale derecha sin necesitar la etiqueta que se acaba de borrar, que era el
problema difícil.

Los dos se escriben **explicitos** en el codigo aunque sean los defaults: son un requisito, y un
cambio de default de la libreria no puede pasar desapercibido.

## Tres cosas que los tipos y los tests encontraron

1. **`uploaded_by` es obligatorio** en `cleaning_photos`. El tipo generado lo exigio y `tsc` lo cazo.
   Es lo correcto: una evidencia que no dice quien la aporto no es evidencia.
2. **Los tipos generados SI reflejan los DEFAULT de los argumentos.** Mi primera lectura fue que no,
   pero era que el `tsc` corrio con los tipos viejos. Tras regenerar: `p_nota?: string`. Por eso la
   migracion 20 es la forma limpia de que el tipo diga la verdad, en vez de pasar cadena vacia y
   escribir una nota vacia donde deberia haber NULL.
3. **Dos de mis propios criterios de aceptacion se auto-invalidaron.** El grep de `revalidatePath`
   encontro el comentario que dice que no se usa, y el de "texto de compresion" encontro un mensaje
   de error interno. Es exactamente la trampa de disciplina de comentarios que los planes de la Fase
   5 documentan. En codigo: cero en los dos.

## Verificacion

| Puerta | Resultado |
|---|---|
| `test:unit` | **967 tests, 54 archivos, todos en verde** |
| `db:reset` · `db:test` | 20 migraciones, 269 aserciones pgTAP en verde |
| `db:types:check` | sin deriva |
| `ci:arch` | los tres scripts en OK |
| `tsc --noEmit` | limpio, con los dos `@ts-expect-error` todavia necesarios |
| `npm audit` | cero vulnerabilidades atribuibles a la libreria nueva |

## Decisiones tomadas al implementar

- **La escalera de calidades es una lista de cuatro y no una busqueda binaria.** Cada intento es una
  recodificacion completa, entre 100 y 300 ms en un telefono de gama media. Una binaria haria 5 o 7
  intentos para afinar un valor que nadie distingue, y si se siente el segundo y medio de espera.
- **Si se agotan los intentos, NO se lanza:** se devuelve la mejor conseguida. Una aseadora de pie
  frente a un bano no puede quedarse sin poder subir su evidencia porque una foto se resistio a bajar
  de 200 kB. Un archivo grande es un problema de cuota; una evidencia que no sube es un aseo sin
  prueba.
- **`captured_lat` y `captured_lng` se dejan NULAS.** Llenarlas exigiria pedir permiso de ubicacion y
  guardar donde estuvo la aseadora cada dia, y ningun requisito lo pide. Seria ademas deshacer por la
  puerta de al lado lo que el borrado del EXIF consigue.
- **`terminarAseo` no revalida el checklist en el cliente**, y el comentario lo prohibe: reponer esa
  comprobacion reintroduciria el bloqueo que la migracion 18 derogo.
