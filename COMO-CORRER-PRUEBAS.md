# Cómo correr las pruebas

> Chuleta práctica. El detalle de por qué cada trampa existe está en
> `.planning/codebase/TESTING.md`.

## Antes de nada

Las capas que tocan base necesitan Docker y Supabase arriba:

```bash
npx supabase start
```

---

## En el día a día

**Cambiaste lógica** (cálculos, fechas, el parser de iCal):

```bash
npm run test:unit
```

~40 s, no necesita nada arriba. Es el 90% de las veces.

**Cambiaste forma** (clases de Tailwind, imports, dónde vive un archivo):

```bash
npm run ci:arch && npx tsc --noEmit
```

Segundos.

## Cuando tocas la base de datos

```bash
npm run db:reset && npm run db:test
```

**Si escribiste una migración**, la cadena completa. Sin regenerar los tipos,
`tsc` y `npm run build` pasan en verde contra el schema viejo, que es el falso
positivo más caro de este repo:

```bash
npm run db:reset && npm run db:types && npm run db:types:check && npm run db:test
```

> **No existe `supabase db push` acá.** No hay proyecto enlazado: todo es local.

## Cuando tocas pantallas

Un archivo, no toda la suite:

```bash
npm run db:reset
PLAYWRIGHT_PORT=3210 npx playwright test e2e/operacion.spec.ts
```

## Antes de mergear

Todo, con la base limpia. ~12 minutos:

```bash
npm run db:reset && npm run ci:arch && npm run test:unit && \
npm run test:integration && npm run db:test && \
PLAYWRIGHT_PORT=3210 npx playwright test
```

---

## Las tres trampas que te van a morder

### 1. `PLAYWRIGHT_PORT=3210`, siempre

`reuseExistingServer` está en `true` fuera de CI y **reutiliza sin avisar**
cualquier servidor Next que ya escuche en el puerto. Medido: con el 3000 ocupado
por otro proyecto, la suite dio **14 rojos falsos** con `/login` en 404.

Se lee como *"la suite está rota"* y en realidad es *"estoy mirando otra
aplicación"*.

### 2. `npm run db:reset` antes de cualquier corrida completa

Sin eso, un test deja basura (un apartamento huérfano, por ejemplo) y el control
de entorno de otro spec revienta. Salen rojos en sitios que no tienen nada roto.

### 3. `npx playwright test --list` NO funciona

`e2e/push-instalacion.spec.ts:45` llama a `clienteDeServicio()` a nivel de
módulo, y sin `globalSetup` revienta la colección entera. Para contar casos,
cuéntalos corriendo.

---

## Las cinco capas, y qué prueba cada una

| Capa | Comando | Qué responde |
|---|---|---|
| Unitarias | `npm run test:unit` | ¿la lógica pura es correcta? |
| Integración | `npm run test:integration` | ¿Postgres responde lo que el código espera? |
| pgTAP | `npm run db:test` | ¿las reglas de seguridad aguantan impersonando roles reales? |
| E2E | `npx playwright test` | ¿la pantalla funciona en un navegador? |
| Arquitectura | `npm run ci:arch` | ¿alguien rompió una regla de forma? |

---

## La regla que no se negocia

**Ninguna aserción cuenta hasta haberla visto en rojo.**

Se mete el defecto a propósito, se comprueba que la prueba lo atrapa, se anota, y
se quita. Sin eso no sabes si una prueba mira algo o simplemente pasa.

No es teoría: en este repo ya hubo señuelos que **no pusieron nada en rojo**, y
cada uno destapó una prueba que llevaba tiempo sin comprobar nada.
