import { HardDrive } from 'lucide-react';

import {
  type ConsumoDeStorage,
  formatearBytes,
  porcentajeUsado,
  superaElUmbral,
} from '@/lib/domain/almacenamiento';

/**
 * EL MEDIDOR DE STORAGE DE LA CABECERA DE `/operacion` (RET-07, mitad «ve»).
 *
 * ── POR QUÉ HAY DOS SUPERFICIES Y NO UNA ──────────────────────────────────
 *
 * RET-07 pide dos cosas distintas y cada una tiene su sitio:
 *
 *   *ve el consumo*  → esto, en la cabecera, al lado de `SincronizacionEnVivo`.
 *                      Es la ranura que esta pantalla ya usa para el estado del
 *                      sistema, y el admin ya la mira.
 *   *recibe alerta*  → una fila computada en `PanelAlertas`, que es donde este
 *                      admin ya lee lo que necesita atención.
 *
 * LAS DOS SALEN DE LA MISMA LECTURA, así que no se pueden contradecir dentro de
 * un render: el mismo objeto `consumo` alimenta este medidor y
 * `alertasComputadas()`.
 *
 * ── EL NÚMERO SE VE SIEMPRE; EL COLOR SOLO APARECE AL CRUZAR ──────────────
 *
 * Por debajo del umbral va en `text-muted-foreground`. UN NÚMERO DE CONTEXTO NO
 * ES UNA LLAMADA A LA ACCIÓN, y una tira de aviso visible al 12% entrena al
 * admin a saltársela con la vista: el día que diga 85% no la va a ver. Es el
 * mismo argumento por el que `Atrasados` no se renderiza con cero.
 *
 * Al cruzar pasa a `text-status-warn`, que es EL MISMO color del icono de la
 * fila del panel, y aparece el `HardDrive`, que es EL MISMO icono. El admin lo
 * aprende una vez. Es el mismo patrón que `MarcaActualizacion` ya usa para el
 * estado degradado, con su `WifiOff`.
 *
 * ── UN FALLO DE LA LECTURA SE VE, Y NO SE PINTA COMO CERO ─────────────────
 *
 * `consumo === null` significa "no se pudo medir", y se dice con todas sus
 * letras. Renderizar `0 B` ahí sería el peor resultado posible del requisito
 * entero: la pantalla diría que hay espacio de sobra justo el día que no lo hay.
 * Devolver `null` (no renderizar nada) sería lo mismo en silencio.
 *
 * ── LO QUE NO ES, Y ES DELIBERADO ─────────────────────────────────────────
 *
 * No hay barra de progreso, ni gráfica de tendencia, ni desglose por bucket, ni
 * proyección de "te quedan N días". Nada de eso está en RET-07, y hoy además
 * solo hay un bucket, así que un desglose de una fila no informaría nada.
 *
 * COMPONENTE DE SERVIDOR: sin `'use client'`. No tiene estado, no maneja eventos
 * y no lee nada del navegador.
 */
export function MedidorDeAlmacenamiento({ consumo }: { consumo: ConsumoDeStorage | null }) {
  /*
    `region` y no `alert` ni `status`: es una superficie de estado persistente,
    no un anuncio puntual, y cualquiera de los dos interrumpiría al lector de
    pantalla en cada carga de la página. Mismo criterio que `TiraAvisosAdmin`.
  */
  const comunes = {
    role: 'region',
    'aria-label': 'Consumo de almacenamiento',
  } as const;

  if (consumo === null) {
    return (
      <div
        {...comunes}
        title="No se pudo leer el consumo de almacenamiento. El resto de la pantalla no depende de esta lectura."
        className="flex items-center gap-sm text-micro text-status-warn"
      >
        <HardDrive className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span>Almacenamiento: no se pudo medir</span>
      </div>
    );
  }

  const cruzado = superaElUmbral(consumo);
  const linea = `Almacenamiento · ${formatearBytes(consumo.usadoBytes)} de ${formatearBytes(
    consumo.cupoBytes,
  )} (${porcentajeUsado(consumo)}%)`;

  return (
    <div
      {...comunes}
      title={
        cruzado
          ? `${linea}. Cuando se llene, las aseadoras no van a poder subir las fotos de evidencia.`
          : `${linea}. Se avisa al llegar al ${consumo.umbralPct}%.`
      }
      className={`flex items-center gap-sm text-micro tabular-nums ${
        cruzado ? 'text-status-warn' : 'text-muted-foreground'
      }`}
    >
      {cruzado && (
        <HardDrive className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      )}
      <span>{linea}</span>
    </div>
  );
}
