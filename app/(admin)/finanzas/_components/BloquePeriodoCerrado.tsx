'use client';

import { ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import { useId, useState } from 'react';

import type { PagoDelPeriodo } from '@/lib/data/pagos';
import { etiquetaDePeriodoDePago } from '@/lib/domain/mes';
import { formatCOP } from '@/lib/domain/money';

import { EstadoVacio } from '../../_components/EstadoVacio';
import { TablaPagosDelPeriodo } from './TablaPagosDelPeriodo';

/**
 * Un periodo cerrado: su cabecera colapsable de 48px mas su tabla (§9.1).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL ROTULO LLEVA SIEMPRE SUS DOS FECHAS REALES. NUNCA EL NOMBRE DEL MES.
 *
 * Es D7-5 en la pantalla. El periodo va de CIERRE A CIERRE, asi que «enero»
 * puede ir del 1 al 30 porque el 31 cayo en sabado y pertenece al periodo
 * siguiente. Un recibo que dice «enero» y cubre del 1 al 30 sin decirlo es una
 * discusion esperando a ocurrir, y la persona que cobra tiene derecho a saber
 * que dias le pagaron.
 *
 * Y se escribe IGUAL tambien cuando el periodo si coincide con el mes completo:
 * un formato que cambia segun el caso obliga a leer con atencion justo el dia en
 * que no coincide, que es el dia en que alguien reclama.
 *
 * ── COMPONENTE DE CLIENTE, Y SOLO POR EL COLAPSO ─────────────────────────
 *
 * Un estado, booleano. Las filas llegan ya leidas por el componente de servidor.
 *
 * ── EL COLAPSO NO SE ANIMA, Y NO ES UN OLVIDO ────────────────────────────
 *
 * El contrato de movimiento del proyecto (02-UI-SPEC §6.4) permite transiciones
 * de color, fondo, borde y opacidad. Cambiar la altura es layout: en una pagina
 * con varios bloques apilados, animarla empuja todo lo de abajo durante 200ms y
 * el ojo pierde el sitio. Se muestra y se oculta, y ya.
 *
 * ── SOLO EL MAS RECIENTE NACE ABIERTO ────────────────────────────────────
 *
 * Es lo que el admin necesita casi siempre: el periodo que acaba de cerrar. Los
 * demas son historico, estan a un clic, y con 18 periodos en el DOM abrirlos
 * todos seria un muro. El estado NO se persiste entre visitas, misma regla que
 * los bloques de dia de `/operacion`.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * La etiqueta del periodo sin su `Del ` inicial.
 *
 * Existe porque el contrato de copy la usa de las dos maneras: como rotulo
 * («Del 1 al 30 de enero de 2026») y dentro de una frase («del periodo del 1 al
 * 30 de enero de 2026», §15.3). Se deriva de la etiqueta en vez de formatear dos
 * veces: `etiquetaDePeriodoDePago` es el unico sitio que sabe cual de las tres
 * formas toca, y una segunda ruta de formato es como las dos acaban divergiendo
 * justo en el periodo que cruza el ano.
 */
function sinDel(etiqueta: string): string {
  return etiqueta.replace(/^Del\s+/u, '');
}

export function BloquePeriodoCerrado({
  desde,
  hasta,
  personas,
  montoTotal,
  faltanPorPagar,
  pagos,
  expandidoInicial = false,
}: {
  /** Dia de negocio `'YYYY-MM-DD'`. */
  desde: string;
  hasta: string;
  personas: number;
  montoTotal: number;
  faltanPorPagar: number;
  pagos: PagoDelPeriodo[];
  expandidoInicial?: boolean;
}) {
  const idCabecera = useId();
  const idContenido = useId();

  const [expandido, setExpandido] = useState(expandidoInicial);

  const etiqueta = etiquetaDePeriodoDePago(desde, hasta);

  return (
    <section
      aria-labelledby={idCabecera}
      className="rounded-md border border-border bg-background"
    >
      {/*
        `relative` para que el `::after` del boton cubra la cabecera entera: toda
        ella es el control de colapso, igual que en los bloques de dia. El
        resumen de la derecha es texto sin acciones, asi que puede quedar debajo
        del area del boton sin perder nada.
      */}
      <div className="relative flex h-dia-cabecera items-center justify-between gap-md rounded-t-md border-b border-border bg-canvas px-md">
        <button
          type="button"
          id={idCabecera}
          aria-expanded={expandido}
          aria-controls={idContenido}
          onClick={() => setExpandido((v) => !v)}
          className="transicion flex items-center gap-sm rounded-sm text-body font-semibold text-foreground after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expandido ? (
            <ChevronDown className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          )}
          {etiqueta}
        </button>

        <p className="text-micro text-muted-foreground">
          <span className="tabular-nums">
            {personas} {personas === 1 ? 'persona' : 'personas'}
          </span>{' '}
          · <span className="tabular-nums">{formatCOP(montoTotal)}</span> ·{' '}
          {/*
            `faltan {N} por pagar` en el color de aviso mientras quede alguien, y
            `Todos pagados` en el de exito cuando no. Son dos hechos distintos y
            no dos tonos del mismo: el primero es trabajo por hacer.
          */}
          {faltanPorPagar > 0 ? (
            <span className="text-status-warn">
              {faltanPorPagar === 1 ? 'falta 1' : `faltan ${faltanPorPagar}`} por pagar
            </span>
          ) : (
            <span className="text-status-ok">Todos pagados</span>
          )}
        </p>
      </div>

      {/*
        `hidden` y no desmontar: el bloque colapsado conserva su estado y el
        navegador no rehace el arbol al volver a abrirlo. Es el mismo patron de
        los bloques de dia.
      */}
      <div id={idContenido} hidden={!expandido}>
        {pagos.length === 0 ? (
          /*
            UN PERIODO CERRADO SIN NADIE ES RARO, PERO ES LEGAL Y HAY QUE DECIRLO.

            La funcion de la base usa `left join` justamente para que un periodo
            cerrado sin trabajo NO desaparezca de la lista: sin eso, el admin
            leeria la ausencia como «el job fallo», que es la conclusion
            contraria. Si al abrirlo no dijera nada, esa ambiguedad volveria aqui.

            COPY AÑADIDO: el contrato de diseño no tiene fila para este caso.
          */
          <EstadoVacio
            compacto
            icono={Wallet}
            encabezado="Este periodo se cerró sin ningún pago."
            cuerpo="No hubo ningún aseo completado en estas fechas."
          />
        ) : (
          <TablaPagosDelPeriodo
            pagos={pagos}
            etiquetaPeriodo={etiqueta}
            fechasPeriodo={sinDel(etiqueta)}
          />
        )}
      </div>
    </section>
  );
}
