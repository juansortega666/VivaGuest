---
phase: 06-pwa-del-aseador-offline-first
plan: 05
subsystem: ui-infra
tags: [shadcn, primitivas, tokens, max-w, cn, trampa-de-ancho]

requires:
  - phase: 02
    provides: "`lib/utils.ts` con `extendTailwindMerge` y el grupo `max-w`, y la escala de espaciado de `app/globals.css`"
provides:
  - "`components/ui/accordion.tsx` y `components/ui/radio-group.tsx`, saneadas y anotadas"
  - "Los seis tokens de la Fase 6 en `@theme`"
  - "`max-w-foto` y `max-w-motivo` registrados en el grupo `max-w` de `cn()`"
affects: [06-06, 06-07, 06-08, 06-09]

tech-stack:
  added: []
  patterns:
    - "Correr ci:arch INMEDIATAMENTE despues del shadcn add, antes de cualquier otro cambio: es el momento en que el guardarrail tiene algo que decir y se lee sin veinte archivos de ruido"
    - "Un paquete legitimo y popular puede seguir siendo la eleccion equivocada si sustituye una defensa local"
    - "La verificacion de CSS va con array de globs y nunca con sustitucion de comando"
---

# 06-05: Las dos primitivas y los tokens de la fase

## Que se construyo

`accordion` y `radio-group` instaladas y saneadas, los seis tokens de `06-UI-SPEC.md` §2.1, y el
registro de los dos anchos nuevos en `cn()`.

## El hallazgo que justifica que este plan exista solo

El plan pedia correr `ci:arch` **justo despues** del `add`, y eso destapo algo que no era lo esperado.

**La trampa esperada no aparecio:** ninguna de las dos primitivas traia clases de ancho con nombre de
talla. Queda anotado en la cabecera de las dos, para que la proxima fase que instale algo sepa que la
comprobacion se hizo y cual fue el resultado.

**Pero el CLI hizo otra cosa:** genero las dos importando `cn` desde **un paquete de npm** llamado
`cn`, en vez de desde `@/lib/utils`. Y lo instalo como dependencia.

### Por que eso era grave

`@/lib/utils` no es un reexport de `clsx`: es `extendTailwindMerge` con **28 anchos con nombre propio
registrados en el grupo `max-w`**. Ese registro es **la mitad del arreglo** del defecto que costo dos
quicks (`260907-703` y `260908-7w0`): sin el, un override en el sitio de uso no desplaza al de la
primitiva y el ancho depende del orden del CSS.

Un `cn` generico no conoce esos 28 nombres. Las dos primitivas nuevas habrian reabierto el defecto
**por la puerta de atras**, y `check-max-w-tallas.sh` no lo habria visto: ese script busca clases con
nombre de talla, no imports equivocados.

### Y el paquete no era sospechoso, que es lo interesante

| Dato | Valor |
|---|---|
| Repositorio | `github.com/shadcn-ui/cn`, o sea **oficial** |
| Descargas | 1.607.428 por semana |
| Publicado | **2026-09-12T11:11:13**, o sea el mismo dia, minutos antes |

Es legitimo y probablemente mejor que nuestro `cn` (compilado, mas rapido). **Aun asi se descarto**, y
por dos razones: adoptarlo exigiria migrar el registro de los 28 anchos, que es un cambio de
infraestructura que no pertenece a esta fase; y adoptar una dependencia publicada hace minutos, sin
necesitarla, es riesgo gratis.

Los dos imports se cambiaron a `@/lib/utils` y el paquete se desinstalo. **Las 25 primitivas usan
ahora el mismo `cn()`.**

## Verificacion

| Puerta | Resultado |
|---|---|
| `ci:arch` justo despues del `add` | los tres scripts en OK |
| `ci:arch` al cerrar | los tres en OK |
| `test:unit` | 967 tests, 54 archivos en verde |
| `build` | OK |
| `tsc --noEmit` | limpio |

**La verificacion que de verdad cierra el plan**, sobre el CSS de produccion y con array de globs
(nunca `$(ls ...)`, que es la trampa de zsh que ya dejo pasar una puerta en verde sin leer un byte):

```
max-w-foto{max-width:var(--container-foto)}
--container-foto:320px
--spacing-barra-aseo:72px
```

Resuelto contra `--container-*` y no contra `--spacing-*`. Es lo unico que prueba que el defecto no
esta.

## Decisiones tomadas al implementar

- **Solo dos primitivas**, como el contrato autoriza. `collapsible` sigue descartada: `accordion` ya
  da apertura multiple.
- **Los seis tokens llevan su razon al lado y no su valor en palabras.** El de la barra incluye la
  consecuencia que se olvida: el contenido de la pagina tiene que reservar ese alto como padding
  inferior, o la ultima tarea del checklist queda debajo y nadie la ve.
- **`foto` y `motivo` se verificaron nombre por nombre** contra la escala de espaciado. Es exactamente
  la comprobacion que faltaba las dos veces que este defecto costo un quick, y queda escrita en el
  comentario del token.
