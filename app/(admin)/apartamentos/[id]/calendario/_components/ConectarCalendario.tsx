'use client';

import { CircleCheck, Eye, EyeOff, Loader2, TriangleAlert } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeedDeApartamento } from '@/lib/data/feeds';
import { formatFechaBog } from '@/lib/domain/dates';
import { esquemaUrlIcal } from '@/lib/domain/ical-url.schema';

import {
  guardarFeed,
  revalidarFeedGuardado,
  revelarUrlIcal,
  validarFeed,
  type ResultadoValidacion,
} from '../_actions';

/**
 * APTO-12 — el campo, la validación en vivo y los siete estados (UI-SPEC §10.2,
 * §10.3, §10.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LOS ESTADOS 5 Y 6 SON EL MOTIVO POR EL QUE ESTA PANTALLA EXISTE.
 *
 * Una URL de exportación de Airbnb es OPACA: no se puede mirar y saber si quedó
 * bien pegada o si es la del apartamento equivocado. Y hay dos resultados que se
 * parecen y significan cosas opuestas:
 *
 *   Estado 5 — el link responde 200 con un calendario de verdad, pero sin nada
 *   por delante. Puede ser correcto (apartamento libre de aquí en adelante) o
 *   puede ser el calendario de OTRO anuncio. No es un error, no se bloquea, y el
 *   copy manda a verificar en Airbnb antes de guardar. Botón `outline`: no se
 *   celebra un resultado dudoso con un botón primario.
 *
 *   Estado 6 — el link responde 200 con HTML. Un feed muerto de Airbnb hace
 *   exactamente eso. Si se pintara igual que el 5, el admin guardaría un link
 *   roto creyendo que sirve y se enteraría tres días después, cuando no llegó el
 *   aseo. Es el modo de falla más peligroso de la pantalla.
 *
 * Se distinguen por SUPERFICIE, ICONO Y COPY, no solo por color (§5, §13).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL NÚMERO Y LA FECHA VAN EN DISPLAY 24/600 ──────────────────────────────
 * No es decoración. Ese número y esa fecha son LA VERIFICACIÓN HUMANA de que el
 * link es el del apartamento correcto: el admin los contrasta contra lo que ve
 * en Airbnb. Enterrarlos en 14px anula el requisito. Es el único sitio de la app
 * donde el Display se usa fuera de un título de página (§3).
 *
 * ── EL FALLO DE VALIDACIÓN NO VA A TOAST ────────────────────────────────────
 * UI-SPEC §9.4 lo enruta explícitamente a un panel propio de la pantalla. Un
 * toast se va solo a los pocos segundos y este mensaje hay que poder releerlo
 * mientras se vuelve a Airbnb a copiar el link. El toast queda para el fallo de
 * la operación completa de guardado, que sí es un error de la operación.
 *
 * ── LA URL GUARDADA NO SE VUELVE A RENDERIZAR ENTERA (T-02-74) ──────────────
 * `revelarUrlIcal` es una Server Action y no un prop: si la página pasara la URL
 * completa a este componente, viajaría en la carga de React y estaría en el DOM
 * desde el primer render, escondida detrás de un `useState`. Una captura del
 * dashboard —o el inspector— filtraría la credencial entera.
 */

/** Copy literal de UI-SPEC §10.3, estado 7, por familia de status. */
const COPY_INALCANZABLE: Record<string, string> = {
  'no-encontrado':
    'Airbnb no reconoce ese link. Lo más probable es que lo hayan regenerado. Vuelve a Airbnb y copia el link otra vez.',
  rechazado:
    'Airbnb rechazó la petición. Copia el link completo, sin recortarlo ni quitarle la parte después del signo de interrogación.',
  'tiempo-agotado':
    'Airbnb no respondió en 10 segundos. Vuelve a intentar; si sigue igual, el problema es de su lado.',
  red: 'Airbnb no respondió en 10 segundos. Vuelve a intentar; si sigue igual, el problema es de su lado.',
  servidor: 'Airbnb está devolviendo error. Intenta de nuevo en unos minutos.',
  // Una redirección no es un feed: Airbnb sirve el `.ics` directo, y seguirla
  // saltaría la allowlist de host. Se presenta como link no reconocido, que es
  // lo que el admin tiene que hacer al respecto.
  redirigido:
    'Airbnb no reconoce ese link. Lo más probable es que lo hayan regenerado. Vuelve a Airbnb y copia el link otra vez.',
};

/**
 * Los cuatro resultados que se PINTAN. `formato-invalido` y `no-autorizado` no
 * llegan nunca a un panel: el primero es inline bajo el campo (estado 2) y el
 * segundo no debería ocurrir desde esta pantalla. Excluirlos por tipo, y no con
 * un `default:` en el render, es lo que hace que añadir un estado nuevo a la
 * unión ponga el compilador en rojo en vez de caer en una rama muda.
 */
type ResultadoPintable = Exclude<
  ResultadoValidacion,
  { estado: 'formato-invalido' } | { estado: 'no-autorizado' }
>;

type Vista =
  | { fase: 'formulario' }
  | { fase: 'validando' }
  /**
   * `origen` decide si el panel ofrece guardar. Un resultado de `guardado` viene
   * de revalidar un link que YA está en `property_secrets`: volver a ofrecer
   * `Guardar y conectar calendario` ahí sería un botón que no hace nada nuevo, y
   * además el navegador no tiene la URL para mandarla.
   */
  | { fase: 'resultado'; resultado: ResultadoPintable; origen: 'pegado' | 'guardado' }
  | { fase: 'conectado' };

interface Props {
  propertyId: string;
  /** `…/calendar/ical/12345678.ics?s=••••••••`, o `null` si no hay nada guardado. */
  urlEnmascarada: string | null;
  feed: FeedDeApartamento | null;
}

export function ConectarCalendario({ propertyId, urlEnmascarada, feed }: Props) {
  const idCampo = useId();
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;

  // UI-SPEC §10.4 regla 4: con calendario ya conectado la pantalla entra DIRECTO
  // en estado 4 con el último resultado conocido. Si no, arranca en el estado 1.
  const yaConectado = urlEnmascarada !== null && feed?.last_success_at != null;

  const [vista, setVista] = useState<Vista>(
    yaConectado ? { fase: 'conectado' } : { fase: 'formulario' },
  );
  const [url, setUrl] = useState('');
  const [errorFormato, setErrorFormato] = useState<string | null>(null);
  const [urlRevelada, setUrlRevelada] = useState<string | null>(null);
  const [enVuelo, iniciar] = useTransition();

  /**
   * Estado 2. Zod EN EL CLIENTE, sin ninguna petición de red: es el mismo
   * `esquemaUrlIcal` que corre en el servidor, importado del mismo módulo. Dos
   * copias de la allowlist se desincronizarían.
   */
  function revisarFormato(valor: string): boolean {
    const r = esquemaUrlIcal.safeParse(valor);
    setErrorFormato(r.success ? null : r.error.issues[0].message);
    return r.success;
  }

  function aplicar(resultado: ResultadoValidacion, origen: 'pegado' | 'guardado') {
    if (resultado.estado === 'formato-invalido' || resultado.estado === 'no-autorizado') {
      setErrorFormato(resultado.mensaje);
      setVista({ fase: 'formulario' });
      return;
    }
    setVista({ fase: 'resultado', resultado, origen });
  }

  function lanzarValidacion(valor: string) {
    if (!revisarFormato(valor)) return;

    setVista({ fase: 'validando' });
    iniciar(async () => {
      aplicar(await validarFeed(propertyId, valor), 'pegado');
    });
  }

  /** `Validar de nuevo`: el link ya guardado, que NUNCA llega al navegador. */
  function revalidar() {
    setVista({ fase: 'validando' });
    iniciar(async () => {
      aplicar(await revalidarFeedGuardado(propertyId), 'guardado');
    });
  }

  function conectar(resultado: ResultadoValidacion) {
    iniciar(async () => {
      const r = await guardarFeed(propertyId, url, resultado);
      if (!r.ok) {
        // Fallo de la OPERACIÓN, no de la validación: este sí es toast (§9.4).
        toast.error(r.error);
        return;
      }
      toast.success(r.mensaje);
      setVista({ fase: 'conectado' });
      setUrl('');
      setUrlRevelada(null);
    });
  }

  function alternarRevelado() {
    if (urlRevelada !== null) {
      setUrlRevelada(null);
      return;
    }
    iniciar(async () => {
      const completa = await revelarUrlIcal(propertyId);
      if (completa === null) {
        toast.error('No se pudo leer el link guardado.');
        return;
      }
      setUrlRevelada(completa);
    });
  }

  return (
    <div className="flex flex-col gap-xl">
      {urlEnmascarada !== null && (
        <BloqueUrlGuardada
          enmascarada={urlEnmascarada}
          revelada={urlRevelada}
          onAlternar={alternarRevelado}
          onReemplazar={() => {
            setUrlRevelada(null);
            setErrorFormato(null);
            setVista({ fase: 'formulario' });
          }}
        />
      )}

      {vista.fase === 'conectado' ? (
        <PanelConectado feed={feed} onRevalidar={revalidar} />
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            lanzarValidacion(url);
          }}
          className="flex flex-col gap-lg"
        >
          <div className="flex flex-col gap-xs">
            <label htmlFor={idCampo} className="text-body font-semibold text-foreground">
              Link de exportación del calendario
            </label>

            <Input
              id={idCampo}
              name="ical_url"
              type="url"
              spellCheck={false}
              autoComplete="off"
              readOnly={vista.fase === 'validando'}
              aria-invalid={errorFormato !== null}
              aria-describedby={errorFormato !== null ? idError : idAyuda}
              placeholder="https://www.airbnb.com/calendar/ical/12345678.ics?s=…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                // En `change` solo se LIMPIA el error: marcar en rojo mientras
                // se teclea el tercer carácter de una URL larga es ruido.
                if (errorFormato !== null && esquemaUrlIcal.safeParse(e.target.value).success) {
                  setErrorFormato(null);
                }
              }}
              onBlur={(e) => {
                if (e.target.value.trim().length > 0) revisarFormato(e.target.value);
              }}
            />

            {errorFormato !== null ? (
              <p id={idError} className="text-micro text-destructive">
                {errorFormato}
              </p>
            ) : (
              <p id={idAyuda} className="text-micro text-muted-foreground">
                Pega el link de exportación del calendario de este apartamento. Es secreto: quien
                lo tenga puede ver toda su ocupación sin iniciar sesión.
              </p>
            )}
          </div>

          <div>
            <Button type="submit" disabled={url.trim().length === 0 || vista.fase === 'validando'}>
              {vista.fase === 'validando' ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Validando…
                </>
              ) : (
                'Validar link'
              )}
            </Button>
          </div>
        </form>
      )}

      {/*
        §13: el resultado de la validación se anuncia. `polite` y no `assertive`
        porque no interrumpe nada urgente, y el contenedor existe SIEMPRE aunque
        esté vacío: una región `aria-live` que se monta a la vez que su contenido
        no se anuncia en varios lectores.
      */}
      <div aria-live="polite" className="min-h-0">
        {vista.fase === 'validando' && <EsqueletoResultado />}

        {vista.fase === 'resultado' && (
          <PanelResultado
            resultado={vista.resultado}
            enVuelo={enVuelo}
            onGuardar={vista.origen === 'pegado' ? () => conectar(vista.resultado) : null}
            onReintentar={vista.origen === 'pegado' ? () => lanzarValidacion(url) : revalidar}
          />
        )}
      </div>
    </div>
  );
}

/** Estado 3: tres líneas, la geometría del panel que va a aparecer (§9.3). */
function EsqueletoResultado() {
  return (
    <div className="flex flex-col gap-sm rounded-md border border-border p-lg">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

/** El par cifra + rótulo del estado 4. La cifra manda: Display 24/600. */
function CifraDestacada({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-display text-foreground tabular-nums">{valor}</span>
      <span className="text-micro text-muted-foreground">{rotulo}</span>
    </div>
  );
}

function PanelResultado({
  resultado,
  enVuelo,
  onGuardar,
  onReintentar,
}: {
  resultado: ResultadoPintable;
  enVuelo: boolean;
  /** `null` cuando el resultado viene de revalidar un link ya guardado. */
  onGuardar: (() => void) | null;
  onReintentar: () => void;
}) {
  // ── ESTADO 4 ──────────────────────────────────────────────────────────────
  if (resultado.estado === 'valido') {
    return (
      <section className="flex flex-col gap-lg rounded-md border border-status-ok bg-surface-ok p-lg">
        <p className="flex items-center gap-sm text-body font-semibold text-status-ok">
          <CircleCheck className="size-4" strokeWidth={2} aria-hidden="true" />
          El calendario responde correctamente.
        </p>

        <div className="flex flex-wrap gap-2xl">
          <CifraDestacada
            valor={String(resultado.reservas)}
            rotulo="reservas encontradas"
          />
          {/*
            `formatFechaBog` parte la cadena `'YYYY-MM-DD'` y la formatea anclada
            a UTC. El `DTEND` ES el día del checkout, sin sumar ni restar: un
            `new Date('2026-09-04')` aquí pintaría el 3 de septiembre.
          */}
          <CifraDestacada
            valor={formatFechaBog(resultado.proximoCheckout)}
            rotulo="próximo checkout detectado"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-lg">
          {resultado.horasDesdeActualizacion !== null ? (
            <p className="text-micro text-muted-foreground">
              {`El feed se actualizó hace ${resultado.horasDesdeActualizacion} h.`}
            </p>
          ) : (
            <span />
          )}

          {onGuardar !== null && (
            <Button type="button" onClick={onGuardar} disabled={enVuelo}>
              {enVuelo ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : (
                'Guardar y conectar calendario'
              )}
            </Button>
          )}
        </div>
      </section>
    );
  }

  // ── ESTADO 5 ──────────────────────────────────────────────────────────────
  if (resultado.estado === 'sin-reservas') {
    return (
      <section className="flex flex-col gap-lg rounded-md border border-status-warn bg-surface-warn p-lg">
        <p className="flex items-center gap-sm text-body font-semibold text-status-warn">
          <TriangleAlert className="size-4" strokeWidth={2} aria-hidden="true" />
          El link responde, pero no trae ninguna reserva ni bloqueo futuro.
        </p>

        <p className="text-body text-foreground">
          Puede ser correcto si el apartamento está libre de aquí en adelante, o puede ser el
          calendario de otro anuncio. Verifica en Airbnb que el anuncio sea este antes de guardar.
        </p>

        {onGuardar !== null && (
          <div>
            {/* `outline` y NO primario: no se celebra un resultado dudoso. */}
            <Button type="button" variant="outline" onClick={onGuardar} disabled={enVuelo}>
              {enVuelo ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : (
                'Guardar de todos modos'
              )}
            </Button>
          </div>
        )}
      </section>
    );
  }

  // ── ESTADO 6 ──────────────────────────────────────────────────────────────
  if (resultado.estado === 'no-es-ical') {
    return (
      <section className="flex flex-col gap-lg rounded-md border border-destructive/30 bg-surface-destructive p-lg">
        <p className="flex items-center gap-sm text-body font-semibold text-destructive">
          <TriangleAlert className="size-4" strokeWidth={2} aria-hidden="true" />
          El link responde, pero no devuelve un calendario.
        </p>

        <p className="text-body text-foreground">
          Suele pasar al pegar el link de la página del anuncio en vez del de exportación. Vuelve
          al paso 4 de la guía.
        </p>

        <div>
          <Button type="button" variant="outline" onClick={onReintentar} disabled={enVuelo}>
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  // ── ESTADO 7 ──────────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-lg rounded-md border border-destructive/30 bg-surface-destructive p-lg">
      <p className="flex items-center gap-sm text-body font-semibold text-destructive">
        <TriangleAlert className="size-4" strokeWidth={2} aria-hidden="true" />
        No se pudo leer el calendario.
      </p>

      <p className="text-body text-foreground">{COPY_INALCANZABLE[resultado.motivo]}</p>

      <div>
        <Button type="button" variant="outline" onClick={onReintentar} disabled={enVuelo}>
          Reintentar
        </Button>
      </div>
    </section>
  );
}

/**
 * Estado 4 al reabrir la pantalla (UI-SPEC §10.4 regla 4).
 *
 * Muestra el ÚLTIMO RESULTADO CONOCIDO, no uno nuevo: no hay `proximoCheckout`
 * guardado en ninguna columna —`calendar_feeds` no tiene una para eso— y
 * fabricar una fecha aquí sería inventarla. Lo que sí está guardado es cuántas
 * reservas trajo la última validación y cuándo fue, que es lo que el UI-SPEC
 * nombra. Para una fecha fresca está `Validar de nuevo`.
 */
function PanelConectado({
  feed,
  onRevalidar,
}: {
  feed: FeedDeApartamento | null;
  onRevalidar: () => void;
}) {
  const cuando = feed?.last_success_at ?? null;

  return (
    <section className="flex flex-col gap-lg rounded-md border border-status-ok bg-surface-ok p-lg">
      <p className="flex items-center gap-sm text-body font-semibold text-status-ok">
        <CircleCheck className="size-4" strokeWidth={2} aria-hidden="true" />
        El calendario está conectado.
      </p>

      <div className="flex flex-wrap gap-2xl">
        <CifraDestacada
          valor={String(feed?.last_event_count ?? 0)}
          rotulo="reservas en la última validación"
        />
        {cuando !== null && (
          <CifraDestacada
            valor={formatFechaBog(cuando.slice(0, 10))}
            rotulo="última validación correcta"
          />
        )}
      </div>

      <div>
        <Button type="button" variant="outline" onClick={onRevalidar}>
          Validar de nuevo
        </Button>
      </div>
    </section>
  );
}

/**
 * La URL guardada, enmascarada (UI-SPEC §10.4 regla 2).
 *
 * Geist Mono en 12px es el ÚNICO uso de esa tipografía en toda la app (§3):
 * está aquí porque una cadena de puntos y barras necesita ancho fijo para que el
 * ojo cuente los caracteres.
 */
function BloqueUrlGuardada({
  enmascarada,
  revelada,
  onAlternar,
  onReemplazar,
}: {
  enmascarada: string;
  revelada: string | null;
  onAlternar: () => void;
  onReemplazar: () => void;
}) {
  const visible = revelada !== null;

  return (
    <div className="flex flex-col gap-sm rounded-md bg-canvas p-lg">
      <p className="text-micro font-semibold text-muted-foreground uppercase">
        Link guardado
      </p>

      <div className="flex flex-wrap items-center gap-sm">
        <code className="font-mono text-micro break-all text-foreground">
          {revelada ?? enmascarada}
        </code>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAlternar}
          aria-label={visible ? 'Ocultar el link guardado' : 'Mostrar el link guardado'}
        >
          {visible ? (
            <>
              <EyeOff aria-hidden="true" />
              Ocultar
            </>
          ) : (
            <>
              <Eye aria-hidden="true" />
              Mostrar
            </>
          )}
        </Button>

        <Button type="button" variant="outline" size="sm" onClick={onReemplazar}>
          Reemplazar link
        </Button>
      </div>
    </div>
  );
}
