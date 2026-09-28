---
quick_id: 260928-lqd
titulo: Rescate de los tres arreglos de foco de /login
tipo: rescate
fecha: 2026-09-28
tareas: 3
autonomous: true
toca_base_de_datos: false

files_modified:
  # CODIGO
  - app/globals.css
  - app/(public)/login/_components/FormularioLogin.tsx
  - e2e/login.spec.ts
  # PLANNING (contratos que quedarian mintiendo)
  - .planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-UI-SPEC.md
  - .planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md
  - .planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md

no_se_tocan:
  - components/ui/input.tsx        # decision del dueno del 2026-09-22
  - components/ui/button.tsx       # decision del dueno del 2026-09-22
  - app/(public)/login/page.tsx
  - app/(public)/login/page.contrato.test.ts
  - app/(public)/login/_actions.ts
  - app/(public)/login/_components/PieDeLogin.tsx
  - app/(public)/login/_components/PanelPublicidad.tsx
  - lib/domain/sync-diff.integration.test.ts

requirements: [PLAT-01, PLAT-02]

estimate:
  tokens: 90000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "El anillo de foco de cualquier control del producto es el azul de `--status-progress` y ya no el rojo de marca. Se mide en el navegador con una sonda, no leyendo el archivo."
    - "Un campo del login con error CAMBIA de aspecto al recibir el foco: el anillo cambia y el borde se queda en `--destructive`. Las dos mitades, o no cuenta."
    - "Los cuatro controles enfocables de `/login` (email, contrasena, el ojo y `Entrar`) pintan su anillo al 70% y no al 50%."
    - "`--brand`, `--brand-identity`, `--brand-gold`, `--primary` y `--sidebar-primary` salen sin un byte de diferencia: el boton `Entrar` sigue rojo."
    - "`components/ui/input.tsx` y `components/ui/button.tsx` salen sin un byte de diferencia. La correccion es local a `/login`."
    - "Los 19 casos de `e2e/login.spec.ts` siguen siendo 19 y siguen pasando. Los nuevos se SUMAN: cero borrados, cero reescritos."
    - "Ninguna asercion nueva afirma geometria derogada el 2026-09-26: ni pie a sangre completa, ni simetria del par anuncio+login, ni holgura de 30.4px dentro del `<main>`."
  artifacts:
    - "`app/globals.css` con `--ring` y `--sidebar-ring` declarados DENTRO del bloque de estados operativos, y ninguna declaracion de anillo dentro del bloque de marca."
    - "`FormularioLogin.tsx` con cuatro `className` locales y cero cambios de logica."
    - "`e2e/login.spec.ts` con tres casos nuevos al final del archivo (19 pasan a 22)."
    - "`.planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md` con la deuda del choque de luminancias entre `--ring` y `--primary`, fechada."
  key_links:
    - "`--sidebar-ring` sigue a `--ring` y no a `--brand`: es el mismo indicador en otra superficie, no un segundo token con vida propia."
    - "El parche local gana por especificidad porque `aria-invalid` mas `focus-visible` suma una pseudo-clase sobre la cadena de la primitiva. No gana por orden."
    - "`cn()` (tailwind-merge) es lo que deja que el `/70` local desplace al `/50` de la primitiva: las dos clases estan en el mismo grupo `ring-color` con el mismo modificador."
---

<objective>
Rescatar tres arreglos de accesibilidad del foco de `/login` de la rama
`juansortega666/10-04-correcciones-de-login`, que esta a punto de borrarse, y
aterrizarlos sobre el rediseno de Runway que entro el 2026-09-26.

Los tres son reales, estan medidos en un navegador y siguen rotos en esta rama:

1. **`090e3ef`**: `--ring` deriva de `--brand` y el borde de error sale de
   `--destructive`. Son dos rojos que miden **1.65:1 entre si**, o sea un solo
   objeto a la vista: un campo enfocado y un campo con error son indistinguibles.
2. **`7fef9b5`**: en `components/ui/input.tsx` la cadena pone
   `aria-invalid:ring-destructive/20` DESPUES de `focus-visible:ring-ring/50`.
   Misma especificidad, gana la ultima, y un campo con error **no cambia nada** al
   recibir el foco. Medido: los dos estados pintaban el mismo pixel `#ecd0d7`,
   delta-E OKLab entre ellos **= 0**. Es exactamente el estado en que queda el
   formulario tras un login fallido.
3. **`6dba114`, solo su hallazgo 4**: el anillo sube de `/50` a `/70`. WCAG 2.2
   SC 2.4.13 pide 3:1 entre los mismos pixeles con foco y sin el. Medido sobre la
   superficie del login: `/50` da 2.39:1 (no llega), `/65` da 3.22:1 (justo),
   `/70` da 3.58:1 (3.57:1 medido sobre el producto).

**Por que esto NO es un `git cherry-pick`.** Esos commits cargan una maqueta
competidora (pie a sangre completa, rejilla porcentual, par anuncio+login con
canal de 32px) que el rediseno del dueno del 2026-09-26 derogo. Se traen los tres
arreglos como cambios REAPLICADOS al codigo de hoy, no como historia repetida.

Purpose: que un login fallido no deje al que navega con teclado sin saber donde
esta parado, y que el indicador de foco sobreviva a un rebrand sin tocarse.
Output: un token mudado de bloque, cuatro `className` locales y tres casos E2E.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/codebase/STACK.md

Fuentes primarias, con su razonamiento medido dentro del mensaje de commit:

```
git show 090e3ef      # el token
git show 7fef9b5      # el foco del campo invalido
git show 6dba114      # el /70 (SOLO su hallazgo 4; el resto NO viene)
```

Viven en `juansortega666/10-04-correcciones-de-login`, alcanzable desde este repo
(`git branch -a --contains 090e3ef` lo confirma).
</context>

<lo_que_no_cruza>
De `6dba114` viene **solo el hallazgo 4**. Lo demas pertenece a la maqueta que el
rediseno del 2026-09-26 derogo, y traerlo seria una regresion disfrazada de
rescate:

- **El desvio del pie a sangre completa** y su envoltorio interno de 1080px. Hoy
  el `<footer>` vive DENTRO de la columna derecha, y `e2e/login.spec.ts` ya lo
  afirma contra el ancho de su columna.
- **La simetria del par `anuncio+login`** (aire igual a los dos lados, canal de
  32px, tope de 1032px en `--container-par-login`). Hoy el reparto es `50% / 50%`
  sin canal, el panel va a sangre completa y **no existe `[data-slot="card"]` en
  esta pantalla**: ese caso se caeria por `boundingBox()` nulo.
- **La inversion de la holgura de 30.4px** dentro del `<main>`. Hoy esa asercion
  ya no describe la pantalla.

Regla de corte, sin excepciones: si al escribir una asercion aparece un numero que
contradice `.planning/phases/10-rediseno-del-dashboard-admin/10-04-SUMMARY.md`, se
deja fuera.
</lo_que_no_cruza>

<autoridad_de_alcance>
El diff de la rama paralela guia la INVESTIGACION. No es autoridad de edicion.
Cada archivo que se toque se abre y se lee hoy antes de escribir en el, y la lista
de `files_modified` de este plan sale de esa lectura (hecha el 2026-09-28), no del
`--stat` de los tres commits.
</autoridad_de_alcance>

<tasks>

<task type="auto" id="1">
  <name>Task 1: El anillo de foco deja de ser identidad y pasa a ser estado</name>

  <files>
app/globals.css                                                        (EDITAR)
.planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-UI-SPEC.md (EDITAR: derogacion fechada)
.planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md         (EDITAR: derogacion fechada)
  </files>

  <read_first>
- `app/globals.css` lineas 155 a 210. Ahi estan los dos bloques que importan: el de
  MARCA (que hoy declara el anillo en sus lineas 186 y 188) y el de estados
  operativos, que arranca en la 189 y cierra con `--status-progress` en la 203.
- `app/globals.css` lineas 60 a 130. Son los valores del preset que el bloque de
  tokens del proyecto sobreescribe. **Solo leer, no tocar.**
- `.planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-UI-SPEC.md` lineas
  200 a 250: el bloque de tokens de §4.3 y la lista cerrada de §4.4, cuyo punto 3
  es hoy el anillo de foco.
- `.planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md` linea 531 (§6.3):
  dice que en esta pantalla `--primary` aparece en dos usos, y uno de los dos es el
  anillo de foco.
- `scripts/ci/check-service-role.sh` lineas 153 a 195. Es la compuerta 6 de
  `ci:arch`: prohibe valores de color literales fuera de `app/globals.css`, y
  excluye las lineas de comentario con la regex de la linea 41.
  </read_first>

  <action>
En `app/globals.css`, dentro del bloque de MARCA, borra las dos declaraciones de
anillo (hoy en las lineas 186 y 188, las que hacen que `--ring` y `--sidebar-ring`
deriven de la marca). El comentario del bloque dice "Todo lo que es de marca
deriva": el anillo deja de estar ahi porque deja de ser de marca. `--primary`,
`--primary-foreground` y `--sidebar-primary` se quedan intactos, y `--brand`,
`--brand-hover`, `--brand-identity`, `--brand-gold` y `--brand-foreground` no se
tocan ni un byte: **el boton `Entrar` sigue rojo**.

Declara los dos tokens DENTRO del bloque de estados operativos, justo despues de
`--status-progress` (linea 203 de hoy):

    --ring:         var(--status-progress);
    --sidebar-ring: var(--ring);

Encima va un comentario `/* ... */` fechado 2026-09-28 que diga las tres cosas, y
las tres son medidas, no opinion:

- **Por que cambia el valor.** El anillo salia de `--brand` (#d1382c) y el borde de
  error sale de `--destructive` (#9f1239). Medidos en el navegador el 2026-09-22,
  los dos rojos dan 1.65:1 entre si (sus anillos, 1.53:1). Por debajo de 3:1 no son
  dos estados distintos. `--status-progress` ya venia medido el 2026-09-03 (6.70:1
  sobre `--background`, 6.25:1 sobre `--canvas`) y es azul, asi que no colisiona ni
  con el hue 29 de `--primary` ni con el hue 13.7 de `--destructive`, que es el
  choque declarado en `02-UI-SPEC.md` §4.6.
- **Por que vive aqui y no arriba.** El foco no es identidad. Un rebrand cambia
  `--brand`, `--brand-identity` y `--brand-gold`, y el indicador de foco tiene que
  sobrevivir a ese cambio sin tocarse, igual que los cinco estados operativos que
  el propio archivo declara ajenos al rebrand. Devolverlo a la marca reabre el
  hallazgo 2 de la auditoria del 2026-09-22.
- **Por que `--sidebar-ring` sigue a `--ring`.** Es el mismo indicador en otra
  superficie, no un segundo token con vida propia.

**Dos trampas del comentario, y las dos son compuertas de verdad.** (a) Cualquier
linea del comentario que nombre un hexadecimal tiene que empezar por `/*`, por `*`
o por espacios mas `*`, porque `ci:arch` solo excluye las lineas que arrancan asi;
un `#d1382c` en una linea que empieza por otra cosa pone roja la compuerta 6.
(b) Ninguna linea del comentario puede EMPEZAR por `--ring:` ni por
`--sidebar-ring:`: los gates de abajo estan anclados a principio de linea y una
linea de prosa que arranque asi los invalida. Nombralos entre comillas invertidas
dentro de la frase.

En `02-UI-SPEC.md`, §4.4 punto 3 ("Anillo de foco (`--ring`) de cualquier
control"): deja el punto donde esta y anade debajo de la lista una nota
**DEROGADO 2026-09-28** que diga que el anillo salio de la lista cerrada del
acento, con la cifra de 1.65:1 y el enlace al motivo. Lo derogado se conserva como
registro, no se borra: es el patron que `10-04-SUMMARY.md` fijo. Lo mismo en el
bloque de tokens de §4.3 de ese archivo, que reproduce la declaracion vieja del
anillo: una nota al pie del bloque basta, el bloque se queda.

En `10-UI-SPEC.md` §6.3 (linea 531), donde dice que `--primary` aparece en dos usos
de esta pantalla: pasa a UNO, el boton `Entrar`, con la misma nota fechada.

NO toques `components/ui/`. NO toques ninguna otra declaracion de `app/globals.css`.
  </action>

  <verify>
    <automated>grep -nE '^[[:space:]]*--ring:[[:space:]]*var\(--status-progress\);' app/globals.css</automated>
    <automated>grep -nE '^[[:space:]]*--sidebar-ring:[[:space:]]*var\(--ring\);' app/globals.css</automated>
    <automated>! grep -qE '^[[:space:]]*--(sidebar-)?ring:[[:space:]]*var\(--brand\)' app/globals.css &amp;&amp; echo ANILLO-FUERA-DE-MARCA</automated>
    <automated>git diff -- app/globals.css | grep -cE '^[+-][[:space:]]*--(brand|brand-hover|brand-identity|brand-gold|brand-foreground|primary|sidebar-primary):' | grep -qx '0' &amp;&amp; echo MARCA-INTACTA</automated>
    <automated>npm run ci:arch</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>git diff --stat -- components/ui/ | wc -l | grep -qx '0' &amp;&amp; echo PRIMITIVAS-INTACTAS</automated>
  </verify>

  <acceptance_criteria>
- El primer grep imprime UNA linea con su numero. Senal de fallo: no imprime nada y
  sale con codigo 1, o imprime dos lineas (el token quedo declarado dos veces).
- El segundo grep imprime UNA linea. Senal de fallo: sin salida, codigo 1.
- El tercero imprime literalmente `ANILLO-FUERA-DE-MARCA`. Senal de fallo: no
  aparece esa palabra y el comando sale con codigo 1, o sea que alguna declaracion
  de anillo sigue derivando de la marca.
- El cuarto imprime `MARCA-INTACTA`. Senal de fallo: no aparece, lo que significa
  que el diff de `globals.css` toco al menos una linea de un token de marca o de
  `--primary`. Ese es el gate del "el boton `Entrar` sigue rojo".
- `npm run ci:arch` sale con codigo 0 y sin la linea `valor de color literal fuera
  de la capa de tokens`. Senal de fallo: esa linea aparece en stderr, y quiere decir
  que un hexadecimal del comentario cayo en una linea que la regex de comentarios no
  excluye.
- `npx tsc --noEmit` sale sin diagnosticos.
- El ultimo imprime `PRIMITIVAS-INTACTAS`. Senal de fallo: no aparece.
- `02-UI-SPEC.md` y `10-UI-SPEC.md` tienen cada uno su nota `DEROGADO 2026-09-28`
  con la cifra de 1.65:1, y NO tienen ninguna linea borrada: lo viejo se conserva.
  </acceptance_criteria>
</task>

<task type="auto" id="2">
  <name>Task 2: Los cuatro parches locales, y la deuda que no se paga aqui</name>

  <files>
app/(public)/login/_components/FormularioLogin.tsx             (EDITAR: 4 className)
.planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md (EDITAR: anadir la deuda)
  </files>

  <read_first>
- `app/(public)/login/_components/FormularioLogin.tsx` entero (140 lineas). Los
  cuatro controles enfocables son: el `<Input>` de email (hoy SIN `className`), el
  `<Input>` de contrasena (hoy `className="pr-9"`), el `<Button>` del ojo (hoy
  `className="absolute inset-y-0 right-1 my-auto"`) y el `<Button>` de
  `BotonEntrar` (hoy `className="w-full"`).
- `components/ui/input.tsx` linea 12. Es la cadena del defecto:
  `focus-visible:ring-ring/50` aparece ANTES de `aria-invalid:ring-destructive/20`.
  **Solo leer.**
- `components/ui/button.tsx` linea 7. Misma forma, misma cadena base.
  **Solo leer.**
- `lib/utils.ts`, la funcion `cn()`. Es el `tailwind-merge` extendido que hace que
  el `/70` local DESPLACE al `/50` de la primitiva en vez de convivir con el.
- `.planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md`, para copiar
  el formato de sus entradas (titulo, estado, causa, por que no se arregla aqui).
  </read_first>

  <action>
Cuatro `className`, y ni una linea de logica:

1. `<Input>` de **email**: anade
   `className="focus-visible:ring-ring/70 aria-invalid:focus-visible:ring-ring/70"`.
2. `<Input>` de **contrasena**: pasa de `"pr-9"` a
   `"pr-9 focus-visible:ring-ring/70 aria-invalid:focus-visible:ring-ring/70"`.
   El `pr-9` es el hueco del boton del ojo y se queda.
3. `<Button>` del **ojo**: anade ` focus-visible:ring-ring/70` al final de la clase
   que ya tiene.
4. `<Button>` de **`BotonEntrar`**: pasa de `"w-full"` a
   `"w-full focus-visible:ring-ring/70"`.

Los dos `<Input>` llevan las DOS clases y los dos `<Button>` llevan solo la
primera, por una razon: `aria-invalid` solo lo pone el formulario sobre los campos.

**Por que funciona, que es lo que hay que escribir en el comentario.** La clase
`aria-invalid:focus-visible:ring-ring/70` suma una pseudo-clase sobre la cadena de
la primitiva, asi que gana por ESPECIFICIDAD y no por orden, y no cambia nada fuera
de esta pantalla. La otra, `focus-visible:ring-ring/70`, cae en el mismo grupo de
`tailwind-merge` que el `/50` de la primitiva con el mismo modificador, asi que lo
desplaza: es `cn()` quien lo hace, no la cascada.

Encima de cada uno, comentarios `//` (una sola linea por cada linea de comentario,
sin excepcion) que digan:

- **El defecto de cascada.** En la primitiva, `aria-invalid:ring-destructive/20` va
  DESPUES de `focus-visible:ring-ring/50` con la misma especificidad, asi que gana
  la ultima y un campo con error no cambia NADA al recibir el foco. Medido el
  2026-09-22: invalido-sin-foco e invalido-con-foco pintaban el mismo anillo
  #ecd0d7, delta-E OKLab entre los dos estados = 0, literalmente el mismo pixel.
- **Por que el parche esta aqui y no en la primitiva.** Decision del dueno del
  2026-09-22: `components/ui/input.tsx` no se toca.
- **Que el borde se queda en `--destructive`.** Lo que se recupera es el FOCO, no el
  error: el error lo siguen comunicando el borde rojo y el texto del `FieldError`.
  Un parche que pintara el campo entero del color del foco perderia el estado de
  error.
- **El `/70`, con el numero delante.** WCAG 2.2 SC 2.4.13 pide 3:1 entre los mismos
  pixeles con foco y sin el, y el anillo se pinta fuera del borde, sobre la
  superficie clara del login: `/50` = #8ea6eb = 2.39:1 (no llega), `/65` = #6c8ce6 =
  3.22:1 (justo), `/70` = #6083e4 = 3.58:1, medido sobre el producto en 3.57:1. Y
  que la salida alternativa (darlo por cumplido porque el borde ya cambia) quedo
  descartada con numero: el borde pasa de #858d9a a #1d4ed8, que son 2:1 entre si.

Todos esos hexadecimales tienen que ir en lineas que empiecen por `//`, o la
compuerta 6 de `ci:arch` los lee como color literal fuera de la capa de tokens y se
pone roja.

**La deuda.** En `deferred-items.md` de la Fase 10, anade una entrada fechada
2026-09-28: contra el relleno del boton primario NO existe opacidad de anillo que
llegue a 3:1 (2.04:1 a `/50`, 1.36:1 a `/70`, bajando conforme sube la opacidad).
Eso no es un defecto del parche: es un choque de LUMINANCIAS entre `--ring` y
`--primary`, y arreglarlo exige tocar un token de marca, que este quick declara
fuera de alcance. Escribe tambien la condicion de salida: se cierra cuando alguien
decida el valor de marca, no cuando alguien suba mas la opacidad.

NO toques `components/ui/input.tsx` ni `components/ui/button.tsx`. NO cambies la
logica de `FormularioLogin.tsx`: ni `useActionState`, ni `aria-invalid`, ni
`aria-describedby`, ni los `useId`.
  </action>

  <verify>
    <automated>grep -vE '^[[:space:]]*//' 'app/(public)/login/_components/FormularioLogin.tsx' | grep -c 'focus-visible:ring-ring/70' | grep -qx '4' &amp;&amp; echo CUATRO-CONTROLES</automated>
    <automated>grep -vE '^[[:space:]]*//' 'app/(public)/login/_components/FormularioLogin.tsx' | grep -c 'aria-invalid:focus-visible:ring-ring/70' | grep -qx '2' &amp;&amp; echo DOS-CAMPOS</automated>
    <automated>grep -vE '^[[:space:]]*//' 'app/(public)/login/_components/FormularioLogin.tsx' | grep -c 'pr-9' | grep -qx '1' &amp;&amp; echo HUECO-DEL-OJO-INTACTO</automated>
    <automated>git diff --stat -- components/ui/ | wc -l | grep -qx '0' &amp;&amp; echo PRIMITIVAS-INTACTAS</automated>
    <automated>npm run ci:arch</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>npm run lint</automated>
    <automated>npm run test:unit</automated>
  </verify>

  <acceptance_criteria>
- El primer comando imprime `CUATRO-CONTROLES`. Senal de fallo: no imprime esa
  palabra y sale con codigo 1, o sea que el conteo de lineas de codigo (comentarios
  excluidos) con `focus-visible:ring-ring/70` no dio exactamente 4. Ni 3 (falta un
  control) ni 5 (se colo en un sitio que no es de esta pantalla).
- El segundo imprime `DOS-CAMPOS`. Senal de fallo: no aparece. Son los dos `<Input>`
  y solo ellos: un `aria-invalid:` sobre un `<Button>` no significa nada aqui.
- El tercero imprime `HUECO-DEL-OJO-INTACTO`. Senal de fallo: no aparece, lo que
  quiere decir que al reescribir la clase de la contrasena se perdio el `pr-9` y el
  texto pasa por debajo del boton del ojo.
- El cuarto imprime `PRIMITIVAS-INTACTAS`. Senal de fallo: no aparece.
- `npm run ci:arch` sale con codigo 0 y sin la linea `valor de color literal fuera
  de la capa de tokens`. Senal de fallo: esa linea en stderr nombrando
  `FormularioLogin.tsx`, que significa que un hexadecimal del comentario quedo en
  una linea que no empieza por `//`.
- `npx tsc --noEmit` y `npm run lint` sin diagnosticos.
- `npm run test:unit` en verde, con el MISMO total de casos que el baseline medido
  al empezar la tarea. Senal de fallo: cualquier delta. Esta tarea no anade ni quita
  un solo caso unitario, y `page.contrato.test.ts` lee `page.tsx`, no este archivo.
- `deferred-items.md` tiene la entrada del choque de luminancias con las tres cifras
  (2.04:1, 1.36:1, y el 3:1 que nunca se alcanza) y su condicion de salida.
  </acceptance_criteria>
</task>

<task type="auto" id="3">
  <name>Task 3: Las tres pruebas, cada una con su senuelo corrido</name>

  <precondition>El stack local de Supabase esta levantado y existe `.env.local`: `e2e/fixtures.ts` lee credenciales reales y los cinco casos de login tecleado no corren sin eso. Si falta, el spec entero se cae por una razon que no es la de este plan.</precondition>

  <files>
e2e/login.spec.ts   (EDITAR: tres casos NUEVOS al final, cero borrados)
  </files>

  <read_first>
- `e2e/login.spec.ts` entero (830 lineas, 18 sentencias `test(` que producen 19
  casos, porque el `describe` de las redes itera sobre dos nombres). Lo que hay que
  sacar de ahi es el ESTILO, que es lo que hace que estos casos se lean como los de
  al lado: el patron de `sonda` (lineas 387 a 400 y 464 a 476), la comparacion de
  colores contra una sonda y NUNCA contra un literal escrito a mano (la razon esta
  en el comentario de las lineas 440 a 447: `getComputedStyle` devuelve el valor tal
  como lo declara la capa de tokens, y el declarado y el computado no son la misma
  cadena), el uso de `data-slot` como localizador, y la colision medida de
  `getByLabel('Contrasena')` sin `exact: true`, que casa con dos elementos.
- `git show 6dba114 -- e2e/login.spec.ts`, **solo el ultimo hunk**, y de el solo el
  `describe` llamado `El campo invalido con foco`. Trae tres piezas que se rescatan
  casi tal cual: `anilloYBorde()`, `leerEstable()` y la espera de hidratacion por
  `__reactFiber$`. El `describe` de la simetria del par que viene en el mismo hunk
  NO se trae (ver `<lo_que_no_cruza>`).
- `app/(public)/login/_actions.ts` linea 20: el mensaje literal de Zod es
  `Ese email no tiene un formato válido.` (con tilde y punto final).
- `playwright.config.ts` lineas 45 a 60: `PLAYWRIGHT_PORT` y `workers: 1`.
  </read_first>

  <action>
Tres casos NUEVOS al final del archivo, en dos `describe` nuevos. **Cero casos
borrados y cero reescritos**: los 19 de hoy son la red de seguridad de que esto no
rompio nada, y la unica forma de saberlo sin editarlos.

**Caso 1, el token: "el anillo de foco no es ninguno de los dos rojos".**
Con el patron de sonda del propio archivo, crea divs de sonda para `var(--ring)`,
`var(--status-progress)`, `var(--brand)` y `var(--destructive)`, lee su
`backgroundColor` computado y afirma tres cosas: que `--ring` es igual a
`--status-progress`, que NO es igual a `--brand` y que NO es igual a
`--destructive`. Cada asercion lleva su mensaje nombrando los dos valores, para que
el rojo imprima que dos tokens se fusionaron. Nada de comparar contra un
hexadecimal escrito en el test.

**Caso 2, el comportamiento: "el mismo campo con error se ve distinto con foco y
sin foco".** Es el rescate literal del caso de `6dba114`, y su cuerpo funciona hoy
sin adaptacion porque solo usa `input[name="email"]`, `getByLabel` y
`getByRole('button', { name: 'Entrar' })`: ninguna de esas formas depende de la
maqueta derogada. Se conserva entero, incluidos sus dos comentarios de defecto de
instrumento, que estan medidos y valen mas que el codigo:

- La espera de hidratacion por `__reactFiber$`. Sin ella, un envio anterior a la
  hidratacion hace un POST nativo a `/login` que responde 200, el estado de error se
  pierde por el camino y `aria-invalid` no llega nunca. El sintoma es cruel porque
  el `POST /login 200` SI sale en el log del servidor.
- `leerEstable()`, o sea esperar a que dos lecturas consecutivas coincidan. El input
  lleva `transition-colors`, asi que `getComputedStyle` dentro de la animacion
  devuelve el valor INTERPOLADO y comparar dos estados a medio camino es comparar
  ruido. Nada de `waitForTimeout`.

El campo se pone invalido por el CAMINO REAL: se envia `no-es-un-email` y el
esquema de Zod del Server Action lo rechaza antes de tocar la red, asi que el caso
no depende de GoTrue. Nada de escribir `aria-invalid` a mano desde el test: eso
probaria el CSS y no el producto. El foco vuelve al campo POR TECLADO (foco en la
contrasena y `Shift+Tab`), porque `:focus-visible` es lo que se esta defendiendo.
Se afirman las DOS mitades: el anillo CAMBIA y el borde NO cambia. Y que el mensaje
`Ese email no tiene un formato válido.` sigue visible con el campo enfocado.

**Caso 3, el `/70`: "los cuatro controles enfocables pintan su anillo al 70%".**
Un solo caso que recorre los cuatro controles POR TECLADO, en el orden de
tabulacion: email (que ya nace con el foco por `autoFocus`), luego tres `Tab` hasta
contrasena, ojo y `Entrar`. El foco por teclado no es una preferencia: un `focus()`
programatico sobre un `<button>` NO activa `:focus-visible` en Chromium, asi que un
caso escrito con `focus()` mediria el estado equivocado en dos de los cuatro.

En cada parada, dos aserciones. Primera: que el elemento enfocado es el que se
espera, comprobado por `name`/`aria-label`, para que un cambio de orden de
tabulacion salga como rojo propio y no como una medida silenciosamente equivocada.
Segunda: que la opacidad del anillo pintado es 0.70. Se extrae el color de la
sombra de 3px del `boxShadow` computado del elemento activo y de ahi el canal alfa,
con una expresion que tolere las dos serializaciones posibles (`rgba(r, g, b, A)` y
la forma con barra de `oklab(... / A)`), y se afirma con tolerancia de 0.01. El
mensaje del rojo tiene que imprimir el `boxShadow` completo tal como se leyo: si
algun dia el navegador serializa de otra forma, el rojo lo dice en vez de acusar al
producto. Aplica la misma estabilizacion de dos lecturas iguales del caso 2, porque
el `<Button>` lleva `transition-all` y su sombra tambien interpola.

**Los tres senuelos, y hay que CORRERLOS y guardar el mensaje rojo textual:**

1. Devuelve `--ring` a la marca en `app/globals.css` y corre el caso 1. Tiene que
   caer nombrando los dos valores. Deshaz.
2. Con la pagina abierta, quita en caliente la clase
   `aria-invalid:focus-visible:ring-ring/70` del input de email
   (`el.classList.remove(...)`) y vuelve a medir los dos estados del caso 2: los dos
   anillos tienen que volver a ser el MISMO string. Es la prueba de que es esa clase
   la que lo sostiene, y no otra cosa.
3. Lo mismo quitando `focus-visible:ring-ring/70` y corriendo el caso 3: el alfa
   deja de ser 0.70.

Los tres mensajes rojos, textuales, van en el commit. Un senuelo que no se corrio no
es un senuelo.

NO anadas ninguna asercion de geometria. NO toques los 19 casos existentes. NO
arregles los cuatro rojos preexistentes que no son de esta tarea.
  </action>

  <verify>
    <automated>grep -c 'test(' e2e/login.spec.ts | grep -qx '21' &amp;&amp; echo TRES-CASOS-MAS</automated>
    <automated>! grep -qE 'container-par-login|toBeCloseTo\(30\.4|simetria del par' e2e/login.spec.ts &amp;&amp; echo SIN-GEOMETRIA-DEROGADA</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' e2e/login.spec.ts | grep -c 'data-slot="card"' | grep -qx '1' &amp;&amp; echo LA-TARJETA-SIGUE-PROHIBIDA-UNA-SOLA-VEZ</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>npm run lint</automated>
    <automated>PLAYWRIGHT_PORT=3210 npx playwright test e2e/login.spec.ts</automated>
  </verify>

  <acceptance_criteria>
- El primer comando imprime `TRES-CASOS-MAS`. Hoy `grep -c 'test('` da 18; con tres
  sentencias `test(` nuevas da 21. Senal de fallo: no imprime esa palabra y sale con
  codigo 1, o sea que el conteo no es 21 (se anadieron de mas, de menos, o se borro
  uno de los existentes).
- El segundo imprime `SIN-GEOMETRIA-DEROGADA`. Senal de fallo: no aparece, lo que
  significa que se colo una asercion de la maqueta derogada: el tope del par, la
  holgura de 30.4px o el `describe` de la simetria.
- El tercero imprime `LA-TARJETA-SIGUE-PROHIBIDA-UNA-SOLA-VEZ`. Filtra comentarios
  porque el archivo los usa para explicar la derogacion. La unica aparicion en
  codigo es la compuerta `toHaveCount(0)` que ya existe. Senal de fallo: da 2 o mas,
  que es exactamente lo que pasa si alguien trae el caso de la simetria, que busca
  `[data-slot="card"]` para medirlo.
- `npx tsc --noEmit` y `npm run lint` sin diagnosticos.
- `PLAYWRIGHT_PORT=3210 npx playwright test e2e/login.spec.ts` termina con
  `22 passed`. Senal de fallo: cualquier `failed` en la linea de resumen, o un total
  distinto de 22. El baseline era 19 y los tres nuevos suman 22.
- Los tres senuelos estan corridos y sus mensajes rojos, textuales, estan en el
  cuerpo del commit. Senal de fallo: un senuelo descrito pero sin su rojo transcrito.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Ninguna nueva | El quick toca capa de tokens CSS, `className` de presentacion y un spec E2E. No hay entrada no confiable nueva, ni superficie de red, ni SQL, ni dependencias instaladas. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-lqd-01 | Tampering | `app/globals.css`, capa de tokens | low | mitigate | El diff de tokens de marca se afirma como CERO lineas en el gate `MARCA-INTACTA` de la Task 1: un cambio de `--primary` o `--brand` colado en este quick no puede pasar en silencio. |
| T-lqd-02 | Information disclosure | `e2e/login.spec.ts` | low | mitigate | El caso nuevo del campo invalido usa el camino de Zod y nunca credenciales reales: el literal que teclea es `no-es-un-email`, que no llega a GoTrue. Ninguna credencial nueva entra al repositorio. |
| T-lqd-03 | Elevation of privilege | Superficie de `/login` | low | accept | No se toca `_actions.ts`, ni el middleware, ni `getUser()`, ni ninguna politica. La correccion es de presentacion y no puede cambiar quien entra. |

Cero instalaciones de paquetes: no aplica la compuerta de legitimidad de paquetes.
</threat_model>

<verification>
Las cuatro compuertas del quick, en este orden:

```
npm run ci:arch
npx tsc --noEmit
npm run test:unit
PLAYWRIGHT_PORT=3210 npx playwright test e2e/login.spec.ts
```

**Los cuatro rojos preexistentes que NO son de este quick y que NO se arreglan
aqui.** Si aparecen, ese es el baseline conocido, esta fechado y escrito en
`.planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md`:

1. y 2. Los dos de `lib/domain/sync-diff.integration.test.ts` (solo salen si se
   corre `npm run test:integration`, que este plan no pide): tiene
   `FECHA_VIEJA = '2026-09-27'` escrita a mano y hoy es 2026-09-28, asi que la
   fixture caduco. Arreglarlo es trabajo sobre el dominio de sincronizacion.
3. `e2e/operacion.spec.ts:429`.
4. `e2e/push-instalacion.spec.ts:97`.

Y la trampa de segundo orden, que hay que tener presente al leer la suite E2E:
cuando los dos casos de integracion mueren, su `afterAll` deja filas en `cleanings`
y `operacion.spec.ts` es sensible a eso. Si se corrio `test:integration` antes, va
`npm run db:reset` antes de la suite E2E.
</verification>

<success_criteria>
- El anillo de foco de todo el producto es azul, medido con sonda en el navegador.
- Un campo del login con error cambia al enfocarse: cambia el anillo, no el borde.
- Los cuatro controles enfocables de `/login` pintan su anillo al 70%.
- El boton `Entrar` sigue rojo, y el gate `MARCA-INTACTA` lo demuestra por diff.
- `components/ui/input.tsx` y `components/ui/button.tsx` salen del quick sin un byte
  de diferencia.
- `e2e/login.spec.ts` pasa de 19 a 22 casos en verde, sin borrar ninguno.
- Los tres senuelos corridos, con su mensaje rojo textual en el commit.
- Los dos UI-SPEC y `deferred-items.md` dicen lo mismo que el codigo.
</success_criteria>

<output>
Escribe `.planning/quick/260928-lqd-rescate-foco-login/260928-lqd-SUMMARY.md` al
terminar, con: las cifras medidas antes y despues de cada uno de los tres arreglos,
los tres mensajes rojos de los senuelos, el conteo de las cuatro suites contra el
baseline, y la deuda del choque de luminancias con su condicion de salida.
</output>
</content>
</invoke>
