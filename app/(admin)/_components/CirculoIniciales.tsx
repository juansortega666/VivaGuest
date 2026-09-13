import { iniciales } from '@/lib/domain/personas';
import { cn } from '@/lib/utils';

/**
 * El circulo de 28px con las iniciales de una persona (07-UI-SPEC §14.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE EXISTE, Y NO ES POR ORDEN.
 *
 * El circulo lo pintaba `TopNav` inline. La Fase 7 lo necesita en tres sitios
 * mas: el bloque "cuanto cuesta cada aseadora" del Resumen, la ficha de la
 * persona y la tabla de pagos. Cuatro copias del mismo circulo se desincronizan
 * en el primer cambio de tamano o de peso, y entonces el avatar del menu de
 * usuario y el de la fila de aseadora dejan de ser el mismo objeto.
 *
 * NO ES `avatar` DE shadcn, y no se instala: no existe `profiles.avatar_url` en
 * el schema (verificado contra la migracion 03). No hay ninguna imagen que
 * cargar ni ningun fallback que resolver, asi que la primitiva solo aportaria
 * una dependencia y una capa.
 *
 * ── DECORATIVO, Y POR ESO SE OCULTA ───────────────────────────────────────
 *
 * `aria-hidden="true"` en los cuatro sitios donde se usa, porque en los cuatro
 * el nombre completo esta justo al lado. Anunciarlo haria que un lector de
 * pantalla dijera "eme ge, Maria Gonzalez" en cada fila del bloque, que es leer
 * dos veces lo mismo y la primera vez en un idioma que no existe.
 *
 * Es Server Component: no tiene estado ni eventos. `TopNav`, que si es de
 * cliente, lo puede renderizar igual porque un componente sin directiva se
 * compila para los dos entornos.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function CirculoIniciales({
  nombre,
  className,
}: {
  nombre: string;
  /**
   * Solo para posicion y margenes del sitio de uso. El tamano, el fondo y la
   * tipografia NO se pisan desde fuera a proposito: si cada consumidor pudiera
   * cambiarlos, volveriamos a tener cuatro circulos distintos con un solo
   * componente.
   */
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-avatar shrink-0 items-center justify-center rounded-full bg-muted text-micro font-semibold text-foreground',
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}
