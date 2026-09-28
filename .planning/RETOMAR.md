# RETOMAR — punto de pausa del 2026-09-22

> Escribe **`RETOMAR`** en una sesión nueva, parada en la raíz del repo.
> Este archivo primero. Después `.planning/STATE.md`.

---

## LO PRIMERO: LA PREGUNTA DEL 18-SEP YA TIENE RESPUESTA

El punto de pausa anterior decía que lo más valioso que faltaba era saber qué
quiso decir el dueño con *"la app es inusable"*, preguntado cuatro veces sin
contestar.

**Se respondió solo, sin volver a preguntar:**

- 19-sep: *"¿qué biblioteca de componentes estamos usando? porque los que veo
  actualmente están espantosos"*
- 22-sep: *"lo que me preocupa es el diseño que estamos haciendo, está
  espantoso"* — y se fue a instalar skills de UI y producto

**Es diseño, no funcionalidad.** Y está medido que **no es la biblioteca**: es
shadcn/ui 4.19.1 estilo `base-nova` sobre `@base-ui/react@1.7.0`, 26 componentes
copiados en `components/ui/` y editables uno por uno. Lo que se ve genérico es
el **tema**: `baseColor: neutral` y los tokens sin tocar en `app/globals.css`.
Cambiar de biblioteca no arregla nada.

**Lo que esto NO responde:** las otras tres sospechas de
`.planning/codebase/CONCERNS.md` siguen abiertas, y la primera pesa: **la cola
offline nunca se construyó**, aunque `PROJECT.md` la declara como constraint
desde el día uno.

---

## DÓNDE ESTÁ EL PROYECTO

Las 83 funciones del alcance v1 están construidas. Las fases 1 a 8 completas y
mergeadas; la 9 parada a propósito en 3/7 por decisión del dueño.

**La Fase 10 nació el 19-sep y está a medias**: rediseño del dashboard admin,
empezando por `/login`.

### Rama `gsd/phase-10-rediseno-del-dashboard-admin`, sin subir

| | Estado |
|---|---|
| `10-CONTEXT.md` | 7 decisiones del dueño, CERRADAS (D10-1 a D10-7) |
| `10-UI-SPEC.md` | aprobado 7/7 por el checker |
| `10-01`, `10-02` | ejecutados, wave 1 |
| `10-03` | 3 de 4 tareas. **Task 4 es un checkpoint humano y sigue abierto** |

### Lo que se construyó

Pantalla partida 45/10/45 a partir de 1024px: panel de publicidad a la
izquierda, login a la derecha, footer full-width con año dinámico de Bogotá y
dos iconos deshabilitados (Instagram y TikTok, dibujados a mano porque
`lucide-react@1.39.0` no trae iconos de marca).

Después, dos cosas más, ya commiteadas:

- `e578b28` — **la tarjeta del anuncio tiene forma propia**. La primera versión
  usaba `size-full` y se estiraba a todo el alto de la columna, así que su
  proporción la decidía la ventana: 0.68, y el dueño lo llamó desproporcionado
  al verlo. Ahora `aspect-[0.93]`, la misma de la referencia, medida en tres
  viewports.
- `675629b` — **la barra de ambiente de pruebas**, 48px, en el layout raíz, o
  sea en los tres productos. Se muestra siempre salvo que el despliegue se
  declare de producción con `NEXT_PUBLIC_VIVAGUEST_ENTORNO=produccion`, y esa
  polaridad es deliberada: el olvido debe producir una barra de más en
  producción, no una de menos en pruebas.

---

## LO QUE NO SE DEBE DAR POR BUENO

1. **La suite E2E no se ha corrido desde la barra de pruebas.** Varias pruebas
   miden posiciones y todo bajó 48px. Es probable que haya rojos. La última
   corrida verde completa fue antes de ese commit: 171 pasaron, 1 saltado.
2. **El checkpoint visual de `10-03` Task 4 sigue abierto.** Son dos juicios que
   ninguna prueba puede emitir: si el fundido entre los cuatro grises se percibe
   de verdad, y si los dos glifos deshabilitados se leen a 16px.
3. **El dueño sigue diciendo que el diseño está espantoso**, después de todo lo
   anterior. Lo del `/login` resolvió la geometría, no el gusto.

---

## LA MÁQUINA NO TIENE MEMORIA, Y ESO BLOQUEA TRABAJO REAL

El 19-sep el servidor de `next start` **murió tres veces**, cada una por
`system is running low on memory`. Medido: entre 13 y 50 MB libres.

Docker y su VM se llevan casi un giga, y es donde corre Supabase local. Para
mirar `/login` no hace falta: esa página no consulta la base.

**Antes de levantar un servidor o correr E2E, mira `vm_stat`.** Con menos de
~200 MB libres, va a morir. No relanzar en bucle.

---

## LAS DECISIONES DEL DUEÑO QUE NO SE REABREN

1. **Nada se borra nunca.** Ni fotos a los 30 días ni aseos a los 6 meses.
2. **El asistente de instalación se eliminó entero.** Sobrevive el botón de
   activar avisos.
3. **Los paneles laterales** son para mostrar información de algo seleccionado.
   Crear y editar siguen siendo páginas.
4. **El login va 45/45, no 75/25** (D10-3). Pidió 3/4 de publicidad; medidos
   ~1.300 logins en Refero, ninguno llega ahí, y el techo del corpus es 51%.
   Escogió la proporción de GlossGenius invertida.

---

## LO QUE QUEDA ABIERTO

| Qué | Quién |
|---|---|
| El diseño, que es donde está su preocupación hoy | conversar con él, va a traer skills de UI |
| Checkpoint visual de `10-03` Task 4 | el dueño |
| E2E completa tras la barra de pruebas | agente, cuando haya memoria |
| Los 39 apartamentos reales sin cargar (plan `09-03`) | el dueño, los links no están en el repo |
| `07-13`, el recorrido de 9 puntos en un iPhone real | el dueño |
| `05-17`, la verificación de la Fase 5, nunca se corrió | agente |
| `09-05`, `09-06`, `09-07` | agente |

---

## EL MÉTODO DE ESTE PROYECTO

**Ninguna aserción cuenta hasta haberla visto en rojo.** Se mete el defecto a
propósito, se comprueba que la prueba lo atrapa, se anota el mensaje literal, y
se quita.

En la Fase 10 eso pagó tres veces: un señuelo dejó el panel **transparente** con
los otros 11 casos en verde; otro demostró que `toBeDisabled()` de Playwright
pasa en verde sobre una trampa de foco real; y tres señuelos caían por una
aserción distinta de la prevista, o sea que la del contrato no estaba midiendo
nada hasta que se aislaron.

**Y lo conversado va antes que lo ejecutado:** definir y analizar huecos hablando
con el dueño **antes** de lanzar cualquier comando GSD.

---

## UNA LECCIÓN DE ESTA TANDA, PARA NO REPETIRLA

Cuando el dueño dijo que el panel se veía desproporcionado, señalé el canal
central como culpable y le propuse dos opciones para cambiarlo. **Medida la
referencia que él mismo había escogido, su canal es 8.5% contra nuestro 10%:
prácticamente igual, y no era el problema.** Era la proporción de la tarjeta.

Medir la referencia antes de proponer el cambio habría ahorrado la vuelta.
