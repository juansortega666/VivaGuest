/**
 * Lo que la interfaz necesita saber sobre el NOMBRE de una persona.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE ESTE MÓDULO, Y NO ES POR ORDEN.
 *
 * `iniciales()` vivía exportada desde `app/(admin)/_components/TopNav.tsx`, que
 * es un Client Component. La Fase 7 la necesita en tres sitios más: el bloque
 * "cuánto cuesta cada aseadora" del Resumen, la ficha de la persona y la tabla
 * de pagos. Importarla de allí arrastraría el componente entero (y con él
 * `usePathname`, el dropdown y la Server Action de cerrar sesión) a cualquier
 * árbol que solo quiera dos letras, y además la hace imposible de probar sin
 * montar un componente.
 *
 * ── LA DUPLICACIÓN TRANSITORIA YA SE CERRÓ ────────────────────────────────
 *
 * Durante una wave la función estuvo DOS VECES, aquí y en `TopNav.tsx`, para que
 * 07-06 y 07-10 no se pelearan por el mismo archivo corriendo en paralelo. El
 * plan 07-10 borró la definición vieja: hoy este módulo es el único sitio del
 * repo donde se calculan las iniciales, y `CirculoIniciales` es el único que lo
 * consume.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Iniciales para el círculo de 28px del menú de usuario y de las filas por
 * aseadora: `'María González'` produce `"MG"`.
 *
 * DOS LETRAS COMO MÁXIMO: con tres, el círculo de 28px se queda sin aire y el
 * texto de 12px empieza a recortarse. Un nombre de una sola palabra produce una
 * sola letra, que es correcto y no hace falta rellenar.
 *
 * Un nombre vacío o en blanco produce `'?'`. Devolver la cadena vacía dejaría un
 * círculo mudo, que se lee como un fallo de carga en vez de como un dato que
 * falta.
 */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  return palabras
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}
