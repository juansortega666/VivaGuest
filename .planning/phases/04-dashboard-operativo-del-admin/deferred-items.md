# Diferidos de la Fase 4

Hallazgos fuera del alcance del plan que los encontró. No se arreglan ahí: se anotan acá.

## `npm run lint` sale con 3 errores preexistentes

**Encontrado en:** plan 04-04, al verificar.
**Origen:** commit `814e0cd` (`feat(02-06)`), Fase 2. No lo introdujo la Fase 4.

```
e2e/fixtures.ts
  104:11  error  React Hook "use" is called in function "paginaAdmin"     react-hooks/rules-of-hooks
  110:11  error  React Hook "use" is called in function "paginaAseador"   react-hooks/rules-of-hooks
  116:11  error  React Hook "use" is called in function "paginaAseador2"  react-hooks/rules-of-hooks

lib/domain/aseador.schema.test.ts
  40:20  warning  '_phone' is assigned a value but never used  @typescript-eslint/no-unused-vars
```

Los tres errores son falsos positivos de `react-hooks/rules-of-hooks` sobre las fixtures de
Playwright: `use` ahí es el `use` de `@playwright/test`, no el hook de React. El plugin lo
confunde por el nombre. El arreglo es una excepción de ESLint acotada a `e2e/**`, no tocar el
código.

`npm run lint` NO está en la verificación de ningún plan de la Fase 4 ni en `ci/db.yml`, así que
hoy no bloquea nada. Conviene cerrarlo antes de que alguien lo meta a CI y descubra que el
repo entero está rojo por tres líneas de fixtures.
