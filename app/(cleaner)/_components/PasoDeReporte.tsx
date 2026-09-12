'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  registrarFotoDeReporte,
  reportarDano,
  reportarFaltantes,
  reportarGasto,
  type ResultadoDeReporte,
} from '@/app/(cleaner)/aseos/[id]/_actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  CATEGORIAS,
  ETIQUETAS_CATEGORIA,
  type CategoriaDeReporte,
} from '@/lib/domain/reporte.schema';

import { CampoDeMonto } from './CampoDeMonto';
import { FotoDeReporte } from './FotoDeReporte';

/**
 * EL ULTIMO PASO: ¿PASO ALGO? (REPORT-01 a REPORT-03, §9).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE PASO ES OPCIONAL DE VERDAD, Y ESA ES LA PROPIEDAD QUE NO SE PUEDE ROMPER.
 *
 * `Terminar el aseo` **sigue disponible sin haber reportado nada**, y no depende
 * en ningun punto del estado del formulario de reporte. La frase que lo resume:
 * **un paso "opcional" que no deja avanzar es un paso obligatorio con mal copy**.
 *
 * Es facil de romper sin querer: basta con apagar el boton "mientras hay un
 * reporte a medias", que suena razonable y convierte el paso en obligatorio para
 * quien empezo a escribir y se arrepintio.
 *
 * ── LA SIMPLIFICACION DE D-07 ──────────────────────────────────────────────
 *
 * UN formulario con tres categorias, no tres formularios. La aseadora escribe
 * que paso y elige a cual pertenece. Tres pantallas distintas para tres cosas
 * que se cuentan igual era trabajo de sobra, para nosotros y para ella.
 *
 * ── LAS ETIQUETAS SON FRASES DE CAMPO, NO NOMBRES DE TABLA ─────────────────
 *
 * `Se dañó algo`, `Tuve que comprar algo`, `Faltaba algo`. Las palabras que usa
 * el esquema por dentro **no aparecen en pantalla**: §14 del contrato prohibe la
 * jerga en cualquier texto que vea un aseador, y esas son jerga de base de
 * datos. Las etiquetas salen de `lib/domain/reporte.schema.ts`, asi que el dia
 * que se anada una cuarta categoria el compilador exige su frase.
 *
 * ── CADA REPORTE ES UN HECHO APARTE ────────────────────────────────────────
 *
 * Se puede reportar mas de una cosa, y cada una va a la base por separado, con
 * su propia notificacion. Dos daños del mismo aseo son dos daños: la clave de
 * deduplicacion de la migracion 19 lleva el identificador de cada uno justo para
 * que no se coman entre si.
 *
 * ── LA FOTO DEL DAÑO Y LA DEL RECIBO ───────────────────────────────────────
 *
 * Cuelgan del identificador que devuelve el RPC, y por eso las actions lo
 * devuelven. Se recogen DESPUES de guardar el hecho: primero existe el daño,
 * luego su prueba. Al reves habria que inventar un destino para una foto que
 * todavia no tiene de que colgar.
 * ════════════════════════════════════════════════════════════════════════════
 */

const COPY = {
  titulo: '¿Pasó algo?',
  falta_foto: 'Falta la foto',
  cuerpo: 'Si no pasó nada, puedes terminar.',
  descripcion: 'Cuéntale a tu administrador qué pasó',
  faltantes: 'Escribe una cosa por renglón',
  guardar: 'Guardar el reporte',
  guardando: 'Guardando…',
  otro: 'Reportar algo más',
  terminar: 'Terminar el aseo',
  terminando: 'Terminando…',
  yaReportado: 'Ya reportaste',
} as const;

/** Lo que queda listado arriba tras guardar. */
interface Guardado {
  id: string;
  categoria: CategoriaDeReporte;
  resumen: string;
  /** El daño la exige y el gasto lleva la del recibo. Se marca hasta que llega. */
  faltaFoto: boolean;
}

export function PasoDeReporte({
  aseoId,
  onTerminar,
  terminando,
}: {
  aseoId: string;
  /** Cierra el aseo. NO depende de nada de esta pantalla. */
  onTerminar: () => void;
  terminando: boolean;
}) {
  const [guardados, setGuardados] = useState<Guardado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaDeReporte | ''>('');
  const [texto, setTexto] = useState('');
  const [enVuelo, setEnVuelo] = useState(false);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);

  /**
   * Lo ultimo guardado que todavia espera su foto.
   *
   * El daño la EXIGE (§9) y el gasto lleva la del recibo. Se recoge DESPUES de
   * guardar el hecho, y no antes, porque antes no habria de que colgarla: el
   * identificador lo devuelve el RPC.
   *
   * **Y aun asi no bloquea terminar.** Un daño sin foto es un daño peor
   * documentado; un aseo que no se puede cerrar es una llamada telefonica. Mismo
   * criterio que D-06 en todo lo demas de la fase.
   */
  const [pendienteDeFoto, setPendienteDeFoto] = useState<
    { id: string; tipo: 'dano' | 'gasto' } | null
  >(null);

  function limpiar() {
    setCategoria('');
    setTexto('');
    setErrorCampo(null);
    setAbierto(false);
  }

  async function guardar(formData: FormData) {
    if (categoria === '') return;
    setEnVuelo(true);
    setErrorCampo(null);

    formData.set('aseo', aseoId);

    let r: ResultadoDeReporte;
    if (categoria === 'dano') r = await reportarDano(null, formData);
    else if (categoria === 'gasto') r = await reportarGasto(null, formData);
    else r = await reportarFaltantes(null, formData);

    setEnVuelo(false);

    if (!r.ok) {
      // Con campo, inline; sin campo, aviso flotante y el formulario CONSERVA lo
      // escrito. Perder lo tecleado por un error de servidor es la forma mas
      // rapida de que alguien deje de usar la herramienta.
      if (r.campo) setErrorCampo(r.error);
      else toast.error(r.error);
      return;
    }

    setGuardados((prev) => [
      ...prev,
      {
        id: r.id,
        categoria: categoria as CategoriaDeReporte,
        resumen: texto.trim(),
        faltaFoto: categoria === 'dano' || categoria === 'gasto',
      },
    ]);
    if (categoria === 'dano' || categoria === 'gasto') {
      setPendienteDeFoto({ id: r.id, tipo: categoria });
    }
    limpiar();
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <h1 className="text-display-movil text-foreground">{COPY.titulo}</h1>
        <p className="text-body-movil text-muted-foreground">{COPY.cuerpo}</p>
      </div>

      {guardados.length > 0 && (
        <section className="flex flex-col gap-xs">
          <h2 className="text-micro-movil text-muted-foreground">{COPY.yaReportado}</h2>
          <ul className="flex flex-col gap-xs">
            {guardados.map((g) => (
              <li key={g.id} className="flex items-start gap-xs text-body-movil text-foreground">
                <Check
                  size={20}
                  strokeWidth={2}
                  className="mt-[2px] shrink-0 text-status-ok"
                  aria-hidden="true"
                />
                <span>
                  <span className="text-muted-foreground">{ETIQUETAS_CATEGORIA[g.categoria]}: </span>
                  {g.resumen}
                  {/* Ambar, no rojo: falta una prueba, no fallo nadie (§4.2). */}
                  {g.faltaFoto && (
                    <span className="block text-micro-movil text-status-warn">
                      {COPY.falta_foto}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendienteDeFoto !== null && (
        <FotoDeReporte
          aseoId={aseoId}
          tipo={pendienteDeFoto.tipo}
          onSubida={async (datos) => {
            const cuerpo = new FormData();
            cuerpo.set('aseo', aseoId);
            cuerpo.set('destino', pendienteDeFoto.id);
            cuerpo.set('tipo', pendienteDeFoto.tipo);
            cuerpo.set('ruta', datos.ruta);
            cuerpo.set('bytes', String(datos.bytes));
            cuerpo.set('ancho', String(datos.width));
            cuerpo.set('alto', String(datos.height));

            const r = await registrarFotoDeReporte(null, cuerpo);
            if (!r.ok) {
              toast.error(r.error);
              return false;
            }

            const id = pendienteDeFoto.id;
            setGuardados((prev) =>
              prev.map((g) => (g.id === id ? { ...g, faltaFoto: false } : g)),
            );
            setPendienteDeFoto(null);
            return true;
          }}
          onOmitir={() => setPendienteDeFoto(null)}
        />
      )}

      {abierto ? (
        <form action={guardar} className="flex flex-col gap-lg">
          <RadioGroup
            name="categoria"
            value={categoria}
            onValueChange={(v) => setCategoria(v as CategoriaDeReporte)}
            className="flex flex-col gap-xs"
          >
            {CATEGORIAS.map((c) => (
              // 44px de area por opcion: el rotulo entero es el destino del toque.
              <Label
                key={c}
                htmlFor={`categoria-${c}`}
                className="transicion flex min-h-toque cursor-pointer items-center gap-md rounded-md px-md text-body-movil text-foreground"
              >
                <RadioGroupItem id={`categoria-${c}`} value={c} />
                {ETIQUETAS_CATEGORIA[c]}
              </Label>
            ))}
          </RadioGroup>

          {categoria !== '' && (
            <div className="flex flex-col gap-lg">
              <div className="flex flex-col gap-xs">
                <Label htmlFor="detalle" className="text-micro-movil text-muted-foreground">
                  {categoria === 'faltante' ? COPY.faltantes : COPY.descripcion}
                </Label>
                <Textarea
                  id="detalle"
                  // El nombre del campo cambia con la categoria porque lo que
                  // viaja tambien: una lista de cosas, o un texto suelto.
                  name={categoria === 'faltante' ? 'items' : 'descripcion'}
                  rows={3}
                  value={texto}
                  onChange={(e) => setTexto(e.currentTarget.value)}
                  // 16px: por debajo, iOS Safari hace zoom al enfocar.
                  className="text-body-movil"
                />
              </div>

              {categoria === 'gasto' && <CampoDeMonto />}

              {errorCampo !== null && (
                <p role="alert" className="text-micro-movil text-status-warn">
                  {errorCampo}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-sm">
            <Button
              type="submit"
              variant="outline"
              disabled={categoria === '' || enVuelo}
              className="min-h-toque-comodo w-full text-body-movil"
            >
              {enVuelo ? COPY.guardando : COPY.guardar}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={limpiar}
              className="min-h-toque w-full text-body-movil"
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setAbierto(true)}
          className="min-h-toque w-full text-body-movil"
        >
          {guardados.length === 0 ? 'Sí, pasó algo' : COPY.otro}
        </Button>
      )}

      {/*
        LA ACCION PRINCIPAL NO MIRA NADA DE ARRIBA. Ni la categoria, ni el texto,
        ni cuantos reportes hay. Ver la cabecera: si dependiera, el paso dejaria
        de ser opcional sin que el copy cambiara.
      */}
      <Button
        type="button"
        onClick={onTerminar}
        className="min-h-toque-comodo w-full text-body-movil"
      >
        {terminando ? COPY.terminando : COPY.terminar}
      </Button>
    </div>
  );
}
