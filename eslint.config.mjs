import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // ── EL SERVICE WORKER GENERADO NO SE LINTA ───────────────────────────
      // `public/sw.js` lo EMITE Serwist desde `app/sw.ts` en cada build, y es
      // un bundle minificado. No estaba aquí porque hasta ahora `public/` no
      // existía; en cuanto existió, `npm run lint` pasó de 0 errores y 2 avisos
      // (la línea base de la Fase 4) a 1 error y 87 avisos, TODOS sobre una
      // sola línea de 46 KB de código que nadie escribió. El error era
      // `@typescript-eslint/no-this-alias` en la columna 4133.
      // La fuente que sí se linta es `app/sw.ts`.
      "public/sw*.js",
      "public/swe-worker*.js",
    ],
  },
  {
    // ── `use` NO ES EL HOOK DE REACT DENTRO DE `e2e/` ───────────────────────
    //
    // Playwright nombra `use` al segundo argumento de toda fixture
    // (`async ({ page }, use) => { … await use(pagina) }`), y
    // `react-hooks/rules-of-hooks` decide por el NOMBRE de la llamada, no por
    // su origen: la marca como hook llamado fuera de un componente y saca tres
    // errores de `e2e/fixtures.ts`. Es un falso positivo probado —bajo `e2e/`
    // no se importa una sola línea de React— y es preexistente desde la Fase 2
    // (commit `814e0cd`), medido sobre el árbol limpio por los planes 04-01 y
    // 04-04 por separado.
    //
    // Se apaga la regla para el directorio entero en vez de poner tres
    // `eslint-disable` por línea: hoy son tres y cada fixture nueva añadiría la
    // suya. Este plan añade cinco.
    //
    // El alcance es lo más estrecho posible a propósito: solo esta regla y solo
    // bajo `e2e/`. Nada de `app/` ni de `components/` la pierde.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default eslintConfig;
