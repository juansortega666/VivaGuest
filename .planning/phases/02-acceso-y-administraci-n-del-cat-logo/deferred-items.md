# Fase 02 — Hallazgos diferidos

Cosas encontradas durante la ejecución que quedan **fuera del alcance** del plan que
las descubrió. No se arreglan en el momento: se anotan para que alguien decida.

---

## 1. `npx eslint .` da 3 errores en `e2e/fixtures.ts` (heredado del plan 02-04)

**Encontrado en:** plan 02-06, al correr el lint sobre todo el árbol.

```
e2e/fixtures.ts
  104:11  error  React Hook "use" is called in function "paginaAdmin" …  react-hooks/rules-of-hooks
  110:11  error  React Hook "use" is called in function "paginaAseador" …
  116:11  error  React Hook "use" is called in function "paginaAseador2" …
```

**Qué es:** un falso positivo. El `use` de esas líneas es el segundo argumento de una
fixture de Playwright (`async ({ browser }, use) => …`), no el hook `use` de React. La
regla `react-hooks/rules-of-hooks` lo confunde por el nombre.

**Por qué no se arregló aquí:** el plan 02-06 no tocó esas líneas (su diff sobre
`fixtures.ts` se limita a los selectores de `/login`), y nada del pipeline lo cae hoy:
`next build` solo lintea `app/`, `lib/` y `components/`, así que `e2e/` queda fuera. El
gate `build` del CI está verde.

**Opciones cuando se decida:** añadir `e2e/**` a `ignorePatterns` de ESLint, o apagar la
regla solo para ese directorio con la razón escrita. La segunda es preferible: apagar la
regla en todo `e2e/` es más estrecho que dejar de lintear el directorio entero.

---

## 2. Aviso de Vite al cargar los config de Vitest (heredado del plan 02-04)

**Encontrado en:** plan 02-06, en cada corrida de `vitest`.

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'` …
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)
```

**Qué es:** un aviso, no un error. Sale de que los dos config de Vitest usan
`import.meta.url` (para los alias `@/` y `server-only`) mientras el paquete no declara
`"type": "module"`. Ya salía con `vitest.integration.config.ts` antes de este plan;
`vitest.config.ts` ganó el mismo aviso al recibir los mismos alias.

**Por qué no se arregló aquí:** es un cambio en `package.json` (`"type": "module"`) que
afecta la resolución de **todos** los archivos de configuración del repo — PostCSS, Next,
ESLint — y eso no es una corrección de alcance de este plan. Anunciado para "un futuro
major de Vite", así que hay tiempo.

**Cuándo hacerlo:** en un plan propio, con las suites completas como red.

---

## 3. `npm run build` avisa de un `_phone` sin usar (heredado del plan 02-08)

**Encontrado en:** plan 02-15, corriendo la puerta 9 para el sign-off.

```
./lib/domain/aseador.schema.test.ts
40:20  Warning: '_phone' is assigned a value but never used.  @typescript-eslint/no-unused-vars
```

**Qué es:** un aviso, no un error. Es un destructuring que descarta el campo a propósito y
la convención del `_` delante no está declarada en la config de ESLint, así que la regla no
la reconoce.

**Por qué no se arregló aquí:** el plan 02-15 no toca `lib/domain/`, y ninguna puerta se
pone en rojo por esto — `npm run build` sale con exit 0. Tocarlo desde el plan de cierre
sería meter un cambio de código sin red en el commit que firma la validación.

**Opciones cuando se decida:** añadir
`argsIgnorePattern`/`varsIgnorePattern` con `^_` a la config de ESLint, que es la
convención que el código ya está usando de facto en varios sitios, o quitar la variable.
La primera es preferible: declara la convención en vez de esquivarla caso por caso.

**Dueño:** el plan que toque la config de ESLint. Va junto con el hallazgo 1 de este
documento, que es el mismo archivo de config.

---

## 4. Las puertas 10 y 11 no están escritas en `ci/db.yml` (plan 02-15)

**Encontrado en:** plan 02-15, corriendo las puertas para el sign-off.

**Qué pasa:** `ci/db.yml` conoce 9 pasos entre sus dos jobs. Esta fase añadió dos suites que
el workflow no menciona:

- `npm run test:integration` — 5 archivos, **52 aserciones** contra la base real con JWT
  emitidos por GoTrue. Es donde vive la prueba central de PLAT-04 y la costura con la Fase 3.
- `npx playwright test` — 10 specs, **76 aserciones**. Es la única capa que ve la máscara de
  miles, la puerta de `contacto_externo` y los siete estados de APTO-12.

Son **128 aserciones** que el día que el CI arranque van a seguir sin correr si nadie añade
los pasos.

**Por qué no se arregló aquí:** es el mismo bloqueo que mantiene `ci/db.yml` fuera de
`.github/workflows/` — editar un workflow requiere un token con scope `workflow`, y
`02-CONTEXT.md` lo difiere. Añadir los pasos al archivo que está en `ci/` no cambia nada
mientras el archivo no sea un workflow.

**Lo que hay que presupuestar cuando se haga:** los dos jobs nuevos necesitan el stack de
Supabase arriba, no solo `db start`. `test:integration` habla con GoTrue (puerto 54321), no
solo con Postgres, así que el truco de `supabase db start` que usa el job `database` no le
sirve. Playwright además necesita `npx playwright install --with-deps chromium`.

**Dueño:** la fase que consiga el token con scope `workflow`. Va con el movimiento de
`ci/db.yml` a `.github/workflows/`, no antes.
