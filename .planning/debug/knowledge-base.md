# GSD Debug Knowledge Base

Sesiones de debug resueltas. `gsd-debugger` la lee al arrancar una investigación para
proponer hipótesis de patrón conocido antes de empezar de cero.

---

## toast-perdido-operacion — el aviso de éxito moría con el diálogo que lo iba a publicar
- **Date:** 2026-09-18
- **Error patterns:** `expect(locator).toBeVisible() failed`, `element(s) not found`, `[data-sonner-toast]`, toast que no aparece, sonner, la acción funciona pero no avisa, flake intermitente ~32%, `useActionState`, `router.refresh()`, Realtime, desmontaje de componente
- **Root cause(s):** El aviso se publicaba desde un `useEffect` que vive dentro de un componente que la propia acción hace desaparecer (`DialogoCancelarAseo.tsx`, `DialogoReprogramar.tsx`, montados condicionalmente por `MenuAseo.tsx` dentro de la fila); un `router.refresh()` de `SincronizacionEnVivo.tsx:111` aterriza cuando la Server Action resuelve y trae el árbol RSC sin la fila (`BloqueDia.tsx:166` pinta solo `visibles`, y `particionar()` aparta los cancelados), React desmonta `FilaAseo → MenuAseo → diálogo`, muere el `useActionState`, y el efecto no corre nunca. **AND-gate:** hacen falta dos condiciones a la vez (publicar desde un efecto **y** que la acción saque la fila del DOM), que es por qué `DialogoCerrarAseo` y `DialogoReasignar` tienen el mismo código y nunca fallaron.
- **Fix:** mover la publicación del aviso del `useEffect` a la función que `useActionState` ejecuta. Se publica en el mismo microtask en que aterriza la respuesta, por delante de cualquier commit de React. El efecto se queda solo con cerrar el diálogo.
- **Files changed:** `app/(admin)/operacion/_components/DialogoCancelarAseo.tsx`, `app/(admin)/operacion/_components/DialogoReprogramar.tsx`
- **Why not caught:** ninguna compuerta existente podía. El E2E **sí lo detectaba**, pero como rojo intermitente al 32 %, y dos fases seguidas (8 y 9-02) lo leyeron como flake del instrumento en vez de como defecto de producto. `tsc`, `lint` y las tres suites no ven carreras de ciclo de vida de React, y no hay gate de tasa de flake que convierta "rojo intermitente" en "defecto con dueño".
- **Recurrence guard:** (1) el caso E2E `e2e/operacion.spec.ts:429` con `esperarToast()` sigue intacto y se demostró capaz de ponerse rojo (3 de 18 con el señuelo); (2) prohibición nombrada en las cabeceras de los dos archivos de devolver la publicación a un `useEffect`, con el registro medido al lado; (3) los tres sitios latentes (`DialogoCerrarAseo:114`, `DialogoReasignar:152`, `SheetConfirmar:239`) quedan declarados en `09-DEBUG-toast.md` §8 con la condición concreta que los detonaría (que `particionar()` empiece a apartar `terminado`).
- **Lección transversal:** dos diagnósticos seguidos fallaron por darle a una observación correcta la lectura equivocada (`[data-sonner-toaster]` en 0 parecía probar un desmontaje del contenedor, pero sonner devuelve `null` sin toasts). Lo que lo desbloqueó fue **leer el código de la dependencia en `node_modules`** en vez de razonar sobre lo que se suponía que hacía. Y el andamio que lo resolvió en una corrida registraba **los dos lados de la disyuntiva a la vez** (`EFECTO` y `TOAST`), que distingue "se publicó y se perdió" de "no se publicó" sin decidir de antemano qué se busca.
---
