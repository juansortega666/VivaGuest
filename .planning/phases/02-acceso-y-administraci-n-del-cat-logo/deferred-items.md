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
