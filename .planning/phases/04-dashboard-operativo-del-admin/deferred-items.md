# Diferidos de la Fase 4

Hallazgos fuera del alcance de la tarea que los encontró. No se arreglan aquí:
la regla del proyecto es que solo se auto-corrige lo que causó el cambio en
curso, y estos son anteriores.

## Del plan 04-01

### `npm run lint` sale en rojo con 3 errores PREEXISTENTES

Medido el 2026-09-03 sobre el árbol limpio de la fase 4, antes de escribir una
línea. Ninguno está en un archivo que el plan 04-01 tocara.

```
e2e/fixtures.ts:104:11  error  React Hook "use" is called in function "paginaAdmin"
e2e/fixtures.ts:110:11  error  React Hook "use" is called in function "paginaAseador"
e2e/fixtures.ts:116:11  error  React Hook "use" is called in function "paginaAseador2"
                               react-hooks/rules-of-hooks

lib/domain/aseador.schema.test.ts:40:20  warning  '_phone' asignado y nunca usado
```

Los tres errores son un FALSO POSITIVO de la regla: `use` es el nombre del
argumento de una fixture de Playwright (`async ({ page }, use) => …`), no el
hook `use` de React. `react-hooks/rules-of-hooks` lo reconoce por el nombre.

Arreglo probable: excluir `e2e/` de esa regla en `eslint.config.mjs`, o
renombrar el parámetro. **No se toca desde este plan**: `lint` no está en la
puerta de fase ni en `ci/db.yml`, y cambiar la configuración de ESLint desde un
plan de base de datos es exactamente el cambio que nadie espera encontrar en un
diff de Wave 0.

**A quién le toca:** al primer plan de la fase 4 que toque `e2e/`, que por el
grafo es el 04-13.

### El checkout principal sigue con ~140 archivos duplicados de iCloud

No es un diferido del código, es una tarea del usuario. Ver el SUMMARY de 04-01,
sección "Guarda de duplicados": el worktree está limpio y la guarda pasó ahí,
pero `/Users/juanortega/Documents/VivaGuest` sigue sucio y `npm run db:reset`
sobre el checkout principal seguirá fallando por migraciones duplicadas hasta
que se corra:

```
git clean -fd -e "ci/README.md" -e "supabase/snippets" -e ".claude/worktrees"
```
