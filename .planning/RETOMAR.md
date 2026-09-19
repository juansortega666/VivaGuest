# RETOMAR — punto de pausa del 2026-09-18

> Escribe **`RETOMAR`** en una sesión nueva, parada en la raíz del repo.
> Este archivo primero. Después `.planning/STATE.md`.

---

## DÓNDE ESTÁ EL PROYECTO

**Las 83 funciones del alcance v1 están construidas.** No falta ninguna por
desarrollar. Lo que sigue **no es construir features**: es hacer que el producto
sirva.

| Fase | Estado |
|---|---|
| 1 a 8 | completas y mergeadas |
| 9 (producto probado) | **parada a propósito en 3/7**, por decisión del dueño |

**Suites:** unit 1236 · pgTAP 389 · integración 205 · E2E 160 colectados, 159
verdes, 1 saltado, **cero rojos**.

`main` está en GitHub, árbol limpio, nada sin subir.

---

## LO PRIMERO: LA PREGUNTA QUE SIGUE SIN RESPUESTA

El 2026-09-18 el dueño dijo, textual:

> *"realmente la app es inusable y seguramente para allá vamos a mover nuestros
> esfuerzos"*

**Se le preguntó cuatro veces qué vio. No contestó.**

Es el dato más valioso que falta. Las 83 funciones existen y las cuatro suites
están verdes, así que "inusable" **no significa que falte una función**:
significa que algo del uso real no se sostiene.

**Pregúntaselo antes de proponer nada.** Si no contesta, las pistas están en
`.planning/codebase/CONCERNS.md`, 14 puntos ordenados por impacto operativo. Los
tres candidatos:

1. el filtro de periodo de `/finanzas` colgándose al cambiar de rango
2. los huecos de contrato de los paneles laterales (§17 de `08-UI-SPEC.md`)
3. **la cola offline NUNCA se construyó**, aunque `PROJECT.md` la declara como
   constraint desde el día uno

Y uno ya arreglado que tenía exactamente esa textura: el toast de cancelar un
aseo no aparecía **1 de cada 3 veces**. Hacías la acción, funcionaba, y la app no
te decía nada.

---

## LO QUE SE HIZO EL 2026-09-18, Y POR QUÉ IMPORTA

**GSD actualizado de 1.6.1 a 1.14.0.** Respaldo del viejo en
`~/.claude/gsd-core.bak-1.6.1`. Un parche local quedó en `gsd-local-patches/` sin
re-aplicar (es de `complete-milestone.md`, workflow que nunca se ha corrido).

**El código mapeado por primera vez**, 4 agentes en paralelo → 7 documentos en
`.planning/codebase/`, 1211 líneas. **Léelos antes de planear cualquier cosa.**

**`CLAUDE.md` mentía en 4 puntos del stack** y se corrigió. Ese archivo se carga
como instrucciones vinculantes en cada sesión, así que cualquier agente que
arrancara planeaba contra un stack inexistente.

**El recorrido del Core Value existe por primera vez** (`e2e/`, plan `09-04`): un
solo test que va del `.ics` de Airbnb al recibo que abre la aseadora, cruzando
sync, confirmación, asignación, push, checklist, foto real subida al bucket,
margen y cierre de periodo. **75 aserciones, cero `insert` directo sobre
`cleanings`.**

Antes había 159 pruebas que decían *"esta pantalla funciona"* y **ninguna** que
dijera *"el producto funciona"*.

---

## LAS DECISIONES DEL DUEÑO QUE NO SE REABREN

1. **Nada se borra nunca.** Ni fotos a los 30 días ni aseos a los 6 meses. El
   espacio se resuelve pagando Supabase Pro. De los 7 requisitos RET quedó
   RET-07 (alerta al 70%), ya hecho. Los demás en `BACKLOG.md`.
2. **El asistente de instalación se eliminó entero** (1842 líneas). La PWA se
   instala a mano, teléfono por teléfono. **Sobrevive el botón de activar
   avisos**, porque el permiso de push no se puede conceder desde fuera de la
   app.
3. **Los paneles laterales** son para mostrar información de algo seleccionado.
   Crear y editar siguen siendo páginas.

---

## LO QUE QUEDA ABIERTO

| Qué | Quién |
|---|---|
| **Los 39 apartamentos reales sin cargar** (plan `09-03`, preparación lista) | el dueño, los links de iCal no están en el repo |
| `07-13`, el recorrido de 9 puntos en un iPhone real | el dueño |
| `05-17`, la verificación de la Fase 5, nunca se corrió | agente |
| `09-05`, `09-06`, `09-07` de la Fase 9 | agente |

**Nada de esto bloquea empezar a trabajar en el producto.**

---

## ANTES DE TOCAR CÓDIGO

```bash
npx supabase start
npm run db:reset
```

Y lee `COMO-CORRER-PRUEBAS.md` en la raíz. Tiene tres trampas que **parecen bugs
y no lo son**, y cada una cuesta una hora de diagnóstico si nadie te las contó.
La peor: sin `PLAYWRIGHT_PORT=3210` la suite corre contra la aplicación de otro
proyecto y da 14 rojos falsos.

---

## EL MÉTODO DE ESTE PROYECTO

**Ninguna aserción cuenta hasta haberla visto en rojo.** Se mete el defecto a
propósito, se comprueba que la prueba lo atrapa, se anota, y se quita.

No es ceremonia. En esta última sesión, **tres señuelos no pusieron nada en
rojo**, y cada uno destapó una prueba que llevaba tiempo sin comprobar nada. Uno
de ellos dejó un caso en verde dos veces seguidas: la fuga de datos estaba en una
pantalla que la prueba no miraba.

**Y lo conversado va antes que lo ejecutado:** definir y analizar huecos hablando
con el dueño **antes** de lanzar cualquier comando GSD.
