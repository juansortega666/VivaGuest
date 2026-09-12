import { CircleCheck, CircleDashed, CircleSlash, Clock, Inbox, Play } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type { AseoDelAseador } from '@/lib/data/aseo-aseador';
import { estadoDeAseo, type IconoEstadoAseo } from '@/lib/domain/cleanings';
import { formatFechaBog, formatHoraLimite } from '@/lib/domain/dates';
import { cn } from '@/lib/utils';

import { CodigoDeAcceso } from './CodigoDeAcceso';

/**
 * LA FICHA DE SOLO LECTURA DE `/aseos/[id]` (05-UI-SPEC §9.1 y §9.2).
 *
 * ── ALCANCE, Y ES UN LIMITE DURO DE LA FASE ────────────────────────────────
 *
 * Renderiza apartamento, cluster, fecha, hora limite, huespedes, instrucciones y
 * el codigo de acceso detras de un boton. NADA MAS, y el limite sigue en pie: el
 * checklist, la camara y la barra de accion los monta la PAGINA como hermanos de
 * esta ficha, no dentro de ella. Esta tarjeta es la cabecera de solo lectura del
 * aseo y se mantiene reusable como tal.
 *
 * ── EL PIE DE COMPROMISO SE RETIRO EN LA FASE 6, Y CONVIENE SABER POR QUE ──
 *
 * Hasta esta fase la ficha cerraba con una linea que le anunciaba al aseador que
 * marcar el aseo y subir fotos llegaban despues. **No era relleno**: sin ella,
 * quien aterrizaba desde un aviso buscaba el boton de arranque, no lo encontraba
 * y concluia que la aplicacion estaba rota; la linea convertia un fallo aparente
 * en una espera. Ahora el trabajo existe y esta justo debajo, asi que esa linea
 * pasaria a ser la unica afirmacion falsa de la pantalla. Se va por la misma
 * razon por la que se puso: no engañar a quien esta de pie frente a una puerta.
 *
 * ── EL BADGE DE ESTADO SE MONTA AQUI Y NO SE IMPORTA DE `(admin)` ──────────
 *
 * La DERIVACION si es compartida —`estadoDeAseo()` de `lib/domain/cleanings.ts`,
 * que es el espejo de `cl_unmanaged_is_inert` y `cl_managed_has_state`— y por eso
 * este archivo no repite ni un `if` sobre el estado. Lo que no se comparte es la
 * PRESENTACION: el componente equivalente del arbol del admin viene con la escala
 * de escritorio (icono de 14px dentro de celda de tabla, tipografia de 12px), y
 * este arbol tiene su propia escala por la supersesion de §3.1. Importarlo
 * meteria texto de 12px en una pantalla que se lee de pie y con el sol encima, y
 * ademas dejaria un uso de las clases sin sufijo bajo `app/(cleaner)/` que
 * `scripts/ci/check-escala-movil.sh` rompe.
 *
 * ── FECHAS: LA REGLA HEREDADA Y NO NEGOCIABLE ──────────────────────────────
 *
 * `formatFechaBog()` sobre la cadena `'YYYY-MM-DD'` tal como viene de la columna
 * `date`. Construir un instante a partir de una fecha de negocio la ancla a
 * medianoche UTC y en Bogota renderiza EL DIA ANTERIOR: la ficha diria que el
 * aseo es hoy cuando es manana, o al reves.
 */

/**
 * Los seis iconos de la lista cerrada de §17.3, a la escala de este arbol.
 *
 * El `Record` esta indexado por la union de literales del dominio: si aparece una
 * septima clave, `tsc` rompe aqui en vez de renderizar `undefined` como
 * componente en el telefono de alguien.
 */
const ICONOS: Record<IconoEstadoAseo, LucideIcon> = {
  Inbox,
  Clock,
  Play,
  CircleCheck,
  CircleSlash,
  CircleDashed,
};

const ROTULO_INSTRUCCIONES = 'Instrucciones';
const SIN_DATO = '—';

/**
 * Una fila etiqueta/valor de 44px.
 *
 * Son datos y no controles, asi que el piso de toque no se les aplicaria por la
 * letra de §16.1. Van a 44px igualmente y por una razon distinta: a esa altura el
 * pulgar no se equivoca al hacer scroll con guantes.
 *
 * El valor lleva `tabular-nums` porque son horas, fechas y cifras: sin el, los
 * digitos de anchos distintos hacen bailar la columna de la derecha (§3.2).
 */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-h-toque items-center justify-between gap-lg">
      <span className="text-micro-movil text-muted-foreground">{etiqueta}</span>
      <span className="text-body-movil text-foreground text-right tabular-nums">{valor}</span>
    </div>
  );
}

export function TarjetaAseo({ aseo }: { aseo: AseoDelAseador }) {
  const estado = estadoDeAseo(aseo);
  const Icono = ICONOS[estado.icono];

  const instrucciones = aseo.instrucciones?.trim() ?? '';

  return (
    <Card className="gap-lg bg-background p-lg">
      <div className="flex items-start justify-between gap-lg">
        <div className="flex min-w-0 flex-col gap-xs">
          <h1 className="text-display-movil text-foreground">{aseo.property?.nombre}</h1>
          <p className="text-micro-movil text-muted-foreground">{aseo.property?.cluster}</p>
        </div>

        {/*
          Esquina superior derecha (§9.2). `data-estado` no es decorativo: hace
          que el DOM diga la clave del dominio y no solo su traduccion al
          espanol, que es lo que permite comprobarlo sin depender del copy.
        */}
        <span
          data-estado={estado.clave}
          className={cn(
            'flex shrink-0 items-center gap-xs text-micro-movil font-semibold',
            estado.clase,
          )}
        >
          {/*
            20px, el tamano estandar de este arbol (§16.3), contra los 14px de la
            celda de tabla del admin. `aria-hidden` porque va ACOMPANADO de la
            etiqueta: anunciarlo seria leer el estado dos veces.
          */}
          <Icono className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
          {estado.etiqueta}
        </span>
      </div>

      <div className="flex flex-col">
        <Dato etiqueta="Fecha" valor={formatFechaBog(aseo.scheduled_date)} />
        <Dato etiqueta="Hora límite" valor={formatHoraLimite(aseo.hora_limite)} />
        <Dato
          etiqueta="Huéspedes"
          valor={aseo.num_huespedes === null ? SIN_DATO : String(aseo.num_huespedes)}
        />
      </div>

      {/*
        SIN INSTRUCCIONES, LA SECCION NO SE RENDERIZA (§9.2). Un encabezado
        seguido de "ninguna" es ruido, y en una pantalla de telefono el ruido
        empuja hacia abajo lo unico que el aseador vino a buscar.
      */}
      {instrucciones.length > 0 && (
        <div className="flex flex-col gap-sm">
          <h2 className="text-heading-movil text-foreground">{ROTULO_INSTRUCCIONES}</h2>
          <p className="text-body-movil whitespace-pre-line text-foreground">{instrucciones}</p>
        </div>
      )}

      <CodigoDeAcceso aseoId={aseo.id} fechaAseo={aseo.scheduled_date} />
    </Card>
  );
}
