# Fase 7 — Hallazgos fuera de alcance

Cosas que aparecieron ejecutando los planes de esta fase y que NO se arreglan
aquí, con lo medido para que el siguiente no tenga que volver a medirlo.

## Flake en `e2e/push-instalacion.spec.ts` (encontrado el 2026-09-13, plan 07-03)

**Qué pasa.** Los casos `E1` y `E2` fallan de forma intermitente, uno distinto en
cada corrida, y pasan solos a la siguiente sin tocar una línea.

**Medido, tres corridas seguidas sobre el mismo árbol y la misma base:**

| Corrida | Resultado |
|---|---|
| 1 (suite completa) | 112 pasando, 1 saltado. `E1` y `E2` en verde |
| 2 (suite completa) | `E1` rojo. 111 pasando |
| 3 (solo el archivo) | `E2` rojo. 4 pasando |
| 4 (solo el archivo) | 5 pasando, 1 saltado. Todo verde |
| 5 (suite completa, 2026-09-13, plan 07-10) | `E3` rojo. 112 pasando |
| 6 (solo el archivo, inmediatamente despues) | 5 pasando, 1 saltado. Todo verde |

**Por qué no es de esta fase.** `push-instalacion.spec.ts` importa de
`e2e/fixtures.ts` únicamente `contextoPersistente`, `emularInstalada`,
`esperarWorkerListo`, `idPorEmail`, `leerCredenciales` y `registroDelWorker`.
El plan 07-03 no tocó ninguna de las seis: añadió funciones nuevas al final del
archivo y tres campos OPCIONALES a `AseoASembrar`, que ese archivo no usa.

**La hipótesis, para quien lo retome.** Los dos casos rojos son justamente los
que dependen de red real: `E1` suscribe contra el servicio de push de Google y
`E2` entrega un aviso por el protocolo de DevTools. `E5` y `E6`, que no salen de
la máquina, nunca fallaron.

**Actualizado el 2026-09-13 (plan 07-10).** El flake alcanza también a `E3`, que
es el tercer caso que depende de la entrega por el protocolo de DevTools. Eso
refuerza la hipótesis y la acota: los tres rojos vistos hasta hoy (`E1`, `E2`,
`E3`) son exactamente los casos que salen de la máquina o dependen del protocolo;
`E5` y `E6`, que no, nunca han fallado. El plan 07-10 no tocó nada de ese camino
(su superficie es `/finanzas`, `TopNav` y ocho tokens de espaciado), y la corrida
siguiente del mismo archivo salió entera en verde.

**Detonante para arreglarlo:** que el rojo aparezca dos corridas seguidas, o que
CI lo vuelva rojo con su `retries: 1`. Antes de eso, el arreglo sería a ciegas.

---

## El pago de una persona asume UNA sola moneda (plan 07-07, migración 25)

**Qué queda pendiente.** `public.cleaner_payouts` tiene una única columna
`moneda` (con `default 'COP'` y su `check` ISO), pero `public.expenses` ganó su
propia `moneda` en la migración 18 «regla 1 del camino a v2». El núcleo del
cierre copia la moneda de CADA gasto a su línea del desglose, que es correcto, y
deja la del pago en su valor por defecto. Si algún día un periodo mezclara
gastos en dos monedas, `monto_gastos` sumaría peras con manzanas y el `check
cp_total_cuadra` no lo vería: solo comprueba que el total sea la suma de las dos
partidas, no que las partidas sean comparables.

**Por qué no es de esta fase.** Hoy no existe ninguna superficie que permita
escribir un gasto en una moneda distinta de `COP`: la columna nació con default
y sin selector en ninguna pantalla. El defecto es latente, no vivo, y el
PROJECT.md declara el multi-moneda como camino a v2, no como MVP.

**Cómo se arregla cuando toque.** Agrupar también por moneda al construir
`personas` en `private.cerrar_periodo_core`, y pasar de «una fila de pago por
persona» a «una por persona y moneda». Es un cambio de clave única en
`cleaner_payouts` (`unique (periodo_desde, aseador_id)` pasaría a incluir
`moneda`), así que **es más barato antes de tener histórico financiero vivo**.

**Detonante:** el día que una pantalla ofrezca elegir moneda al reportar un
gasto, o el día que entre la primera unidad fuera de Colombia.

---

## `/finanzas` no está en la zona del admin del ruteo (plan 07-11)

**Qué se observó.** `ZONA_ADMIN` de `lib/auth/routing.ts` sigue siendo
`['/operacion', '/apartamentos', '/aseadores']`. La sección de finanzas nunca se
añadió. El efecto es que una sesión de aseadora que pide `/finanzas/aseos` **no**
rebota en el middleware: entra, el layout de `(admin)` falla su guard y redirige
a `/login`, y desde ahí el middleware la manda a `/mis-aseos`. El destino final
es correcto y la suite lo afirma (caso T-07-09), pero el camino son dos saltos en
vez de uno.

**El síntoma visible.** En cada uno de esos saltos, el componente de servidor de
la página alcanza a ejecutarse en paralelo con el layout, la función de la base
levanta `42501`, y el proceso escribe un `Error: no_autorizado` en su registro.
Se ve tal cual en la salida del servidor de la corrida E2E. **No es una fuga**:
nada de esa página llega al navegador, porque la redirección gana. Es ruido en el
registro y un salto de más.

**Por qué no se arregló aquí.** `lib/auth/routing.ts` no está en los archivos de
este plan, y la wave 7 tenía tres agentes escribiendo a la vez sobre el mismo
árbol: tocar el ruteo compartido para quitar ruido de un registro no vale el
riesgo de romperles la sesión a los otros dos. Además el defecto ya existía con
`/finanzas` a secas desde el plan 07-10, así que no lo introduce esta pantalla.

**Cómo se arregla.** Añadir `'/finanzas'` al arreglo `ZONA_ADMIN`. Es una línea,
y `routing.test.ts` ya tiene el molde de casos para cubrirla. Con eso el rebote
ocurre en el borde, de un solo salto y sin tocar la base.

**Detonante:** el primer plan que tenga `lib/auth/routing.ts` entre sus archivos,
o la primera vez que ese `no_autorizado` confunda a alguien leyendo registros.
