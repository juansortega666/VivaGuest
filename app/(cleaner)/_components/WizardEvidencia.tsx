'use client';

import { SkipForward, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { terminarAseo } from '@/app/(cleaner)/aseos/[id]/_actions';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cuartoNecesitaFoto, type GrupoDeCuarto } from '@/lib/domain/checklist';
import { ETIQUETAS_SKIP, type MotivoSkip } from '@/lib/domain/motivos';

import { HojaSaltarCuarto } from './HojaSaltarCuarto';
import { PasoDeFoto, type FotoLista } from './PasoDeFoto';

/**
 * EL ASISTENTE DE EVIDENCIA: UN CUARTO POR PANTALLA (D-05, §8.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AQUI SI ES ASISTENTE POR PASOS, Y EN EL CHECKLIST NO. EL CONTRASTE ES
 * DELIBERADO Y ALGUIEN VA A PREGUNTAR POR QUE.
 *
 * El checklist es una **lista de trabajo**: la aseadora esta entre el bano y el
 * cuarto, empieza por donde puede y el orden lo pone la realidad. Imponerle
 * pasos ahi la obliga a marcar de memoria al final, que es peor que no marcar.
 * Por eso D-03 eligio acordeon.
 *
 * Esto es otra cosa: una **secuencia corta con un solo tipo de accion**, tomar
 * una foto, repetida por cuarto. Aqui los pasos ayudan, porque cada pantalla
 * dice exactamente que fotografiar y no hay nada mas que decidir.
 *
 * ── LOS CUARTOS QUE NO PIDEN FOTO NO GENERAN PASO ─────────────────────────
 *
 * El filtro lo hace la proyeccion pura. Un cuarto sin ninguna tarea que exija foto
 * no tiene nada que fotografiar, y hacerlo pasar por el asistente seria una
 * pantalla en la que la unica accion posible es saltarla: la aseadora aprende a
 * tocar `Siguiente` sin mirar, y para cuando llega un cuarto que si importa ya
 * va en piloto automatico.
 *
 * ── SALIR NO CUESTA NADA, Y ESA ES LA REGLA ────────────────────────────────
 *
 * La `✕` vuelve al checklist **sin borrar nada**. Los cuartos ya resueltos
 * siguen resueltos al volver a entrar. Salir a revisar si de verdad se limpio el
 * espejo no puede costar las fotos ya tomadas; si costara, nadie saldria a
 * revisar, que es justo lo contrario de lo que se quiere.
 *
 * El mapa vive en memoria del componente y no se guarda entre visitas al
 * navegador: lo que ya subio esta EN LA BASE, y al volver a la ruta el servidor
 * lo lee de ahi. Guardar una copia en el telefono seria una segunda verdad que
 * puede discrepar de la primera.
 *
 * ── NO HAY NINGUN ATAJO PARA SALTARLOS TODOS ───────────────────────────────
 *
 * Y es a proposito. Un boton de "saltar todo" convertiria D-06 en **skip libre**,
 * que fue la opcion explicitamente descartada: el motivo obligatorio es toda la
 * contrapartida de haber quitado el bloqueo. Sin el, no se quito un bloqueo: se
 * quito la evidencia.
 *
 * El unico camino para no fotografiar un cuarto pasa por la hoja de motivo.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Como quedo cada cuarto. Uno de los dos, nunca los dos. */
type Resultado =
  | { tipo: 'foto'; foto: FotoLista }
  | { tipo: 'saltado'; motivo: MotivoSkip };

const COPY = {
  salir: 'Salir del asistente',
  siguiente: 'Siguiente',
  ultimo: 'Continuar',
  sinCuartos: 'Este aseo no pide fotos.',
  sinCuartosCuerpo: 'Puedes terminarlo directamente.',
  terminar: 'Terminar aseo',
  enVuelo: 'Terminando…',
} as const;

export function WizardEvidencia({
  aseoId,
  grupos,
}: {
  aseoId: string;
  grupos: GrupoDeCuarto[];
}) {
  const router = useRouter();

  // Solo los cuartos con alguna tarea que exija foto. Ver la cabecera.
  const pasos = grupos.filter(cuartoNecesitaFoto);

  const [indice, setIndice] = useState(0);
  const [resultados, setResultados] = useState<Record<string, Resultado>>(() => {
    // Lo que el servidor ya sabe entra como estado inicial: un cuarto que se
    // salto en una visita anterior aparece saltado al volver, sin preguntarlo
    // otra vez.
    const inicial: Record<string, Resultado> = {};
    for (const g of grupos) {
      if (g.saltado !== null) inicial[g.propertyRoomId] = { tipo: 'saltado', motivo: g.saltado.motivo };
    }
    return inicial;
  });
  const [saltando, setSaltando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const actual = pasos[indice] ?? null;
  const total = pasos.length;
  const esUltimo = indice === total - 1;

  function salir() {
    router.push(`/aseos/${aseoId}`);
  }

  function avanzar() {
    if (!esUltimo) {
      setIndice((i) => i + 1);
      return;
    }
    cerrarElAseo();
  }

  /**
   * ── LA COSTURA CON EL PASO DE REPORTE ─────────────────────────────────────
   *
   * Hoy el ultimo `Continuar` cierra el aseo. En el plan 06-09 se intercala
   * antes el paso de reporte (dano, gasto, faltante) y su pantalla de cierre,
   * que es quien pasa a llamar aqui. Lo que NO cambia: el reporte es OPCIONAL,
   * asi que este camino —terminar sin reportar nada— sigue existiendo entero.
   */
  function cerrarElAseo() {
    if (cerrando) return;
    setCerrando(true);

    void (async () => {
      const cuerpo = new FormData();
      cuerpo.set('aseo', aseoId);

      const r = await terminarAseo(null, cuerpo);
      if (!r.ok) {
        toast.error(r.error);
        setCerrando(false);
        return;
      }

      toast.success(r.mensaje);
      router.push('/mis-aseos');
    })();
  }

  if (total === 0) {
    return (
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <h1 className="text-display-movil text-foreground">{COPY.sinCuartos}</h1>
          <p className="text-body-movil text-muted-foreground">{COPY.sinCuartosCuerpo}</p>
        </div>
        <Button
          type="button"
          onClick={cerrarElAseo}
          className="min-h-toque-comodo w-full text-body-movil"
        >
          {cerrando ? COPY.enVuelo : COPY.terminar}
        </Button>
      </div>
    );
  }

  if (actual === null) return null;

  const resuelto = resultados[actual.propertyRoomId] ?? null;
  const motivoSaltado = resuelto?.tipo === 'saltado' ? ETIQUETAS_SKIP[resuelto.motivo] : null;
  const resueltos = pasos.filter((g) => resultados[g.propertyRoomId] !== undefined).length;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm">
        <div className="flex items-center justify-between gap-md">
          {/*
            La salida va arriba a la IZQUIERDA y no abajo: es donde el pulgar no
            llega por accidente mientras se toca la accion principal.
          */}
          <Button
            type="button"
            variant="ghost"
            onClick={salir}
            aria-label={COPY.salir}
            className="min-h-toque min-w-toque"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </Button>

          <span className="text-micro-movil tabular-nums text-muted-foreground">
            Cuarto {indice + 1} de {total}
          </span>
        </div>

        <Progress
          value={resueltos}
          max={total}
          aria-label="Avance de la evidencia"
          className="flex"
        />
      </div>

      {/*
        CADA PASO SE ANUNCIA (§12.2). Sin esto, quien usa lector de pantalla
        toca `Siguiente` y no se entera de que cambio la pantalla: el foco se
        queda donde estaba y el contenido se reemplaza en silencio.
      */}
      <p aria-live="polite" className="sr-only">
        Cuarto {indice + 1} de {total}, {actual.etiqueta}
      </p>

      {motivoSaltado !== null ? (
        <div className="flex flex-col gap-lg">
          <div className="flex flex-col gap-xs">
            <h2 className="text-display-movil text-foreground">{actual.etiqueta}</h2>
            {/*
              Ambar, nunca rojo: la aseadora reporto honestamente que no pudo.
              La razon larga esta en `HojaSaltarCuarto.tsx`.
            */}
            <p className="flex items-center gap-xs text-body-movil text-status-warn">
              <SkipForward size={20} strokeWidth={2} aria-hidden="true" />
              {motivoSaltado}
            </p>
          </div>

          <Button
            type="button"
            onClick={avanzar}
            className="min-h-toque-comodo w-full text-body-movil"
          >
            {esUltimo ? COPY.ultimo : COPY.siguiente}
          </Button>
        </div>
      ) : (
        <PasoDeFoto
          // La clave cambia con el cuarto: sin esto, React reusa el estado del
          // paso anterior y la foto del bano aparece como si fuera la de la sala.
          key={actual.propertyRoomId}
          aseoId={aseoId}
          cuarto={actual}
          etiquetaSiguiente={esUltimo ? COPY.ultimo : COPY.siguiente}
          onSubida={(foto) => {
            setResultados((prev) => ({
              ...prev,
              [actual.propertyRoomId]: { tipo: 'foto', foto },
            }));
          }}
          onSiguiente={avanzar}
          onSaltar={() => setSaltando(true)}
        />
      )}

      <Sheet open={saltando} onOpenChange={(v) => (v ? null : setSaltando(false))}>
        <SheetContent side="bottom" className="max-w-aseador">
          <SheetTitle className="sr-only">Saltar la foto de {actual.etiqueta}</SheetTitle>
          <div className="p-lg">
            <HojaSaltarCuarto
              aseoId={aseoId}
              cuartoId={actual.propertyRoomId}
              onListo={(motivo) => {
                setResultados((prev) => ({
                  ...prev,
                  [actual.propertyRoomId]: { tipo: 'saltado', motivo },
                }));
                setSaltando(false);
                avanzar();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
