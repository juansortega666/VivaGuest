import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Separator } from '@/components/ui/separator';
import { formatCOP } from '@/lib/domain/money';

/**
 * El bloque 2 del Resumen: los aseos del periodo (07-UI-SPEC §6.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES UNA CARD OPERATIVA DE CONTEOS, NO UNA TABLA.
 *
 * Tres filas navegables y una linea de cierre. Una tabla traeria encabezados de
 * columna para tres filas de dos celdas, que es ceremonia sin informacion: lo
 * que el admin hace aqui no es comparar filas entre si, es elegir por cual
 * entrar al detalle.
 *
 * ── LA FILA CON CIFRA CERO SIGUE NAVEGABLE Y NO SE OCULTA ─────────────────
 *
 * Ir a una lista vacia con su estado vacio explicado es mejor que preguntarse
 * por que desaparecio una fila que ayer estaba. Ocultarla ademas mueve las otras
 * dos de sitio segun el periodo, y entonces el admin tiene que leer las
 * etiquetas cada vez en vez de apuntar con el musculo.
 *
 * ── EL PERIODO NO CAMBIA AL ENTRAR ───────────────────────────────────────
 *
 * El rango y el ancla viajan en el enlace. Entrar al detalle no puede cambiar el
 * periodo: seria un cambio de contexto invisible, y el admin acabaria leyendo el
 * mes cuando pidio la semana.
 *
 * ── LA LINEA SOBRE LOS DANOS NO ES DECORATIVA ────────────────────────────
 *
 * Es D7-2 hecho visible: el dueno decidio explicitamente que un descuento
 * automatico sobre el sueldo es una conversacion y no un calculo. **Sin esa
 * linea, un conteo de danos al lado de un tablero de pagos se lee como una
 * deduccion pendiente**, y esa lectura equivocada se resuelve descontandole
 * plata a alguien.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo que la fila necesita. `apoyo` es la linea de micro bajo la etiqueta. */
type FilaDeConteo = {
  etiqueta: string;
  cifra: number;
  apoyo: string;
  filtro: 'todos' | 'con-gastos' | 'con-danos';
};

function Fila({
  fila,
  rango,
  ancla,
}: {
  fila: FilaDeConteo;
  rango: string;
  ancla: string;
}) {
  return (
    // `relative` para que el `::after` del ancla tenga esta fila como bloque
    // contenedor. El `<div>` NO se convierte en clicable: un div con manejador de
    // clic no es enfocable, no responde a Intro y no aparece como enlace en la
    // lista de enlaces de un lector de pantalla.
    <div className="transicion relative flex items-center gap-md px-lg py-md hover:bg-canvas has-[a:focus-visible]:bg-canvas">
      <div className="flex min-w-0 flex-col gap-xs">
        <Link
          href={`/finanzas/aseos?rango=${rango}&ancla=${ancla}&filtro=${fila.filtro}`}
          // El nombre accesible lleva la cifra y el destino: `Aseos hechos` a
          // secas no dice ni cuántos ni que se puede entrar.
          aria-label={`${fila.etiqueta}, ${fila.cifra}. Ver el detalle.`}
          className="transicion rounded-sm text-body text-foreground after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fila.etiqueta}
        </Link>

        <span className="text-micro text-muted-foreground">{fila.apoyo}</span>
      </div>

      <span className="ml-auto text-body font-semibold tabular-nums text-foreground">
        {fila.cifra}
      </span>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={2}
        aria-hidden="true"
      />
    </div>
  );
}

export function BloqueAseosDelPeriodo({
  aseosHechos,
  conGastos,
  conDanos,
  margenTotal,
  gastosReembolsados,
  margenPromedio,
  rango,
  ancla,
}: {
  aseosHechos: number;
  conGastos: number;
  conDanos: number;
  margenTotal: number;
  gastosReembolsados: number;
  /**
   * Nulo con cero aseos, y se pinta con em dash.
   *
   * Un promedio de cero afirmaria que cada aseo dejo cero de margen; con cero
   * aseos no hubo ningun aseo que dejara nada, que es otra cosa. Es la excepcion
   * declarada a la regla de que el cero es un hecho: alli se habla de sumas, y
   * una suma vacia si es cero.
   */
  margenPromedio: number | null;
  rango: string;
  ancla: string;
}) {
  const filas: FilaDeConteo[] = [
    {
      etiqueta: 'Aseos hechos',
      cifra: aseosHechos,
      apoyo: `${formatCOP(margenTotal)} de margen`,
      filtro: 'todos',
    },
    {
      etiqueta: 'Con gastos',
      cifra: conGastos,
      apoyo: `${formatCOP(gastosReembolsados)} reembolsados`,
      filtro: 'con-gastos',
    },
    {
      etiqueta: 'Con daños',
      cifra: conDanos,
      // D7-2, y es la línea que impide que el conteo se lea como una deducción.
      apoyo: 'Los daños no se descuentan del pago.',
      filtro: 'con-danos',
    },
  ];

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="border-b border-border px-lg py-md">
        <h2 className="text-heading text-foreground">Aseos del periodo</h2>
      </div>

      {filas.map((fila, i) => (
        <div key={fila.filtro}>
          {i > 0 && <Separator />}
          <Fila fila={fila} rango={rango} ancla={ancla} />
        </div>
      ))}

      <Separator />

      {/*
        La línea de cierre NO es navegable, a diferencia de las tres de arriba: no
        hay ninguna lista de "márgenes promedio" a la que ir. Un cuarto chevron
        aquí prometería una navegación que no existe.
      */}
      <div className="flex items-center gap-md px-lg py-md">
        <span className="text-body text-foreground">Margen promedio por aseo</span>

        <span className="ml-auto text-body font-semibold tabular-nums text-foreground">
          {margenPromedio === null ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">sin definir</span>
            </>
          ) : (
            formatCOP(margenPromedio)
          )}
        </span>
      </div>
    </div>
  );
}
