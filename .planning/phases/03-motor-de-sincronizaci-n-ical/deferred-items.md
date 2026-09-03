# Diferidos de la Fase 3

Hallazgos fuera del alcance del plan que los encontró. No se arreglan aquí (regla de frontera de
alcance del ejecutor): son preexistentes y no los causa el cambio en curso.

## Del plan 03-09

### `npm run lint` en rojo por tres errores preexistentes

- `e2e/fixtures.ts:104,110,116` — `react-hooks/rules-of-hooks`: el `use` de Playwright (fixtures)
  lo confunde con el hook `use` de React. Son funciones de fixture, no componentes. Se cierra con
  una excepción de ESLint acotada a `e2e/`, no tocando el código.
- `lib/domain/aseador.schema.test.ts:40` — aviso de `_phone` asignado y no usado.

Ninguno lo introduce el plan 03-09 y ninguno afecta a `test:unit`, `test:integration`, `db:test`,
`tsc --noEmit` ni `ci:arch`, que son los que la fase verifica.

### El dead man's switch externo (T-03-85)

`estadoDeSincronizacion` cierra el caso "no corre nada dentro de la base" porque se computa AL
LEER, pero si el admin no abre el panel nadie se entera. Aceptado para el MVP y declarado en el
resumen del plan 03-09. Lo cerraría un ping externo desde el dispatcher hacia un servicio de
terceros. Fuera del alcance.
