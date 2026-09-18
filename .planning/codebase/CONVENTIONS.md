# Convenciones de código

**Fecha de análisis:** 2026-09-18

## Idioma

**Todo el código de dominio se escribe en español.** Nombres de función, de tipo, de variable, comentarios y mensajes de error van en español (`cerrarSesion`, `leerAseosDeAseadora`, `esperarUrlDeCliente`, `No se pudo crear el apartamento de prueba`). El inglés queda para:
- Nombres de tablas y columnas de Postgres (`cleanings`, `payout_periods`, `cleaner_payouts`) — heredado del esquema original.
- APIs del framework y librerías (`revalidatePath`, `useActionState`, `Locator`).

No mezcles el criterio: un archivo nuevo de dominio no lleva nombres de función en inglés aunque el resto del ecosistema (React, Playwright) sí los use.

## Comentarios: la disciplina real del repo

Este es el rasgo más distintivo de la base de código y hay que reproducirlo, no es opcional. Los comentarios en `lib/`, `e2e/` y `supabase/tests/` no describen qué hace el código línea por línea: **documentan una trampa medida, con la fecha y el número exacto que se midió.**

Patrón estándar de un comentario de trampa:

```typescript
/**
 * Espera a que una navegación DEL LADO DEL CLIENTE haya dejado la URL en su
 * sitio, sondeando desde Node y NUNCA desde dentro del documento.
 *
 * ── EL ARTEFACTO DE MEDICIÓN QUE ESTO ESQUIVA (medido el 2026-09-13) ───────
 * ... [descripción del síntoma exacto, con cifras]
 *
 * **No es un defecto del producto, y conviene que quede dicho:** la
 * navegación tarda ~200 ms de verdad. Lo que estaba roto era el instrumento.
 */
```

Reglas derivadas, observadas en `lib/domain/*.ts`, `e2e/fixtures.ts`, `vitest.config.ts` y `supabase/tests/*.test.sql`:
- Si una decisión de código existe **por una trampa de la plataforma** (Vitest, Next, Playwright, Postgres), el comentario cita la trampa con evidencia medida, no con una suposición ("se rompe" no basta; hay que decir con qué mensaje y en qué condición).
- Las fechas de medición van literales (`medido el 2026-09-12`), porque el repo asume que la plataforma cambia y que alguien va a necesitar saber si la medición sigue vigente.
- Cuando una regla existe para impedir una regresión concreta, el comentario nombra el commit, plan o fase que la introdujo (`preexistente desde la Fase 2, commit 814e0cd`).
- `eslint-disable` de alcance amplio (regla completa apagada para un directorio) se justifica con la cantidad exacta de falsos positivos medidos y por qué apagar la regla es más barato que suprimir línea por línea.

## Manejo de errores

**Server Actions y dominio:** dos patrones conviven según el contexto.

1. **Result explícito (`{ ok, ... }`)** para acciones que el cliente necesita leer sin excepción, típicamente `useActionState`:
   ```typescript
   // lib/domain/acciones.ts
   type ResultadoAccion =
     | { ok: true; mensaje: string }
     | { ok: false; error: string; campo?: string };
   ```
2. **`throw new Error(...)` con mensaje en español y contexto del dato que falló**, usado en helpers de test/seed y en rutas de servidor donde el error debe propagar (Server Actions fuera de `useActionState`, cron/webhooks):
   ```typescript
   if (error) throw new Error(`No se pudo crear el apartamento de prueba: ${error.message}`);
   ```
   El mensaje siempre incluye el identificador o valor relevante (`error.message`, el email, la fecha), nunca un genérico tipo `"Error"`.

**`redirect()` de Next.js va fuera de cualquier `try/catch`** — lanza internamente y un catch envolvente lo capturaría como error real. Ver `app/_actions/cerrarSesion` como referencia canónica.

## Autorización y guardas

- El rol se lee **siempre** de `app_metadata.role`, nunca de `user_metadata` (ver CLAUDE.md raíz — es una regla de seguridad medida, no de estilo, pero afecta cualquier función que resuelva "quién es este usuario").
- Las verificaciones de rol en funciones de Postgres van **dentro del cuerpo de la función**, no en el `where` de la política que la envuelve — medido en `supabase/tests/11_financiero.test.sql` bloque P (señuelo 7): mover la guarda fuera del cuerpo deja pasar la 102 en verde con el producto roto.
- `getUser()` para toda ruta protegida server-side. `getClaims()` y `getSession()` están prohibidos para autorizar (ver STACK.md / CLAUDE.md raíz para la medición completa).

## Tipos y dominio

- `fecha_aseo` y toda fecha calendario: tipo `date`, nunca `timestamptz`. Instantes reales (`iniciado_at`, `created_at`): `timestamptz`.
- Dinero: `bigint` de pesos colombianos enteros. Nunca `numeric` (llega como string desde `supabase-js`) ni `float`.
- Validación de entrada: `zod` en tres puntos fijos — input de Server Actions, parseo del VEVENT del iCal, y env vars (`lib/env.ts`).

## Estructura de módulos de dominio

`lib/domain/` es el núcleo de lógica de negocio, organizado por sustantivo de dominio, no por capa técnica:
```
lib/domain/
  apartamento.schema.ts        # Zod schema + tipo derivado
  apartamento.integration.test.ts
  aseador.schema.ts
  alertas.ts / alertas.test.ts
  checklist.ts / checklist.test.ts
  checkouts.ts / checkouts.test.ts
  cierre-concurrente.integration.test.ts
  __fixtures__/                # fixtures .ics y datos de siembra compartidos
```
Convención de sufijo de archivo, aplicada sin excepción:
- `*.schema.ts` → solo definición Zod + tipo TS inferido, sin lógica.
- `*.test.ts` → unitario, corre con `npm run test:unit` (mockea Supabase, no toca red).
- `*.integration.test.ts` → contra base real, corre con `npm run test:integration`.

## Convenciones de import

- Alias `@/` para código de aplicación (`@/lib/database.types`, `@/lib/env`). Los tests unitarios que necesitan mockear un módulo importado por `@/` replican ese mismo especificador en `vi.mock(...)` — si no coincide byte a byte, Vitest no lo intercepta.
- `server-only` marca todo módulo que no debe alcanzar el bundle de cliente (`lib/supabase/admin.ts`). Su `index.js` real es un `throw`; solo la condición de exports `react-server` lo neutraliza. Vitest y Playwright no activan esa condición, así que ambos runners alias-ean `server-only` a su `empty.js` en su config respectiva. Un test que importe transitivamente un módulo `server-only` sin ese alias revienta antes de correr, con un error que no menciona la causa real.

## Linting

- `eslint.config.mjs` extiende `next/core-web-vitals` y `next/typescript`. Sin `.prettierrc` propio en el repo — el formateo sigue el default de Prettier vía la integración de shadcn/Next, no hay config custom que revisar.
- `public/sw*.js` (generado por Serwist) está excluido del lint por ser bundle minificado no escrito a mano; la fuente real a lintar es `app/sw.ts`.
- `react-hooks/rules-of-hooks` está apagada solo bajo `e2e/**/*.ts`, porque Playwright nombra `use` a su segundo argumento de fixture y ESLint decide por nombre de llamada, no por origen del import — falso positivo medido, no relajación real de la regla en código de producto.

---

*Análisis de convenciones: 2026-09-18*
