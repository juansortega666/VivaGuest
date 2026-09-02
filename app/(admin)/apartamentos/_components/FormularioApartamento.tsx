'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AseadorElegible, TipoDeCuarto } from '@/lib/data/apartamentos';
import {
  valoresDesdeFilaGuardada,
  type ApartamentoInput,
  type Faltante,
} from '@/lib/domain/apartamento.schema';
import {
  esquemaFormularioActivar,
  esquemaFormularioBorrador,
  type FormularioInput,
} from '@/lib/domain/cuartos.schema';
import type { Tables } from '@/lib/database.types';

import {
  guardarApartamento,
  guardarCuartosYFaltantes,
  type SecretosApartamento,
} from '../_actions';
import {
  BarraAccionesFormulario,
  type OperacionEnVuelo,
} from './BarraAccionesFormulario';
import { CampoMoneda, opcionesRegistroMoneda } from './CampoMoneda';
import { EditorCuartos, idDeFilaCuarto } from './EditorCuartos';
import { EditorFaltantes, idDeFilaFaltante } from './EditorFaltantes';
import { SeccionGestion } from './SeccionGestion';
import { SelectorCluster } from './SelectorCluster';

/**
 * El formulario de apartamento (UI-SPEC §8), las cinco secciones.
 *
 * ── PAGINA UNICA, SIN WIZARD ────────────────────────────────────────────────
 * El admin va a cargar 39 unidades de una sentada: un wizard multiplica los
 * clics por 39 y, peor, impide volver a tocar un campo suelto tres semanas
 * después. Y pelea de frente con el modelo borrador → activo, que necesita ver
 * el formulario ENTERO para poder decir qué falta.
 *
 * ── EL CALENDARIO NO ESTA AQUI, Y NO ES UN OLVIDO ───────────────────────────
 * Validar el feed es una llamada de red asíncrona con siete resultados posibles.
 * Metida dentro de este submit, obligaría a guardar los otros once campos para
 * poder probar la URL, y a inventarse una respuesta para "el formulario guardó
 * pero el feed falló". Vive en `/apartamentos/[id]/calendario` (plan 02-14): se
 * crea el borrador primero, se conecta el calendario después.
 *
 * ── LA FRONTERA DE LOS SECRETOS SE VE EN EL CODIGO ──────────────────────────
 * Los tres campos de la sección 4 que van a `property_secrets` NO están en el
 * estado de react-hook-form: viven en su propio `useState`. Es deliberado y es
 * la misma frontera que `guardarApartamento` declara en su firma con
 * `{ campos, secretos }`. `campos` va a `properties` con el JWT del admin;
 * `secretos` va a otra tabla, con otro cliente, porque `property_secrets` no
 * tiene grant para `authenticated` y responde `42501` incluso al admin. Fundirlos
 * en un solo objeto de formulario haría invisible la única frontera de seguridad
 * de esta pantalla.
 *
 * ── LA SECCION 5 SE GUARDA CON SU PROPIA ACCION, Y ESO SE VE ────────────────
 * Los cuartos y los faltantes viven en `property_rooms` y en
 * `missing_item_catalog`, dos tablas distintas de `properties` con su propia
 * estrategia de persistencia (nada se borra: lo quitado se marca inactivo, para
 * no dejar checklists huérfanos en la Fase 6). Van por
 * `guardarCuartosYFaltantes`, DESPUES de `guardarApartamento`, porque al crear
 * no hay id al que colgarlos hasta que la primera responde. Son dos operaciones
 * sin transacción común, igual que los secretos, y el precio de eso está escrito
 * en la cabecera de `_actions.ts`.
 */

/** Los valores del formulario más lo que el admin ve de `property_secrets`. */
interface Props {
  clusters: string[];
  aseadores: AseadorElegible[];
  /** El catálogo global de `room_types`, leído de la base. Nunca codificado. */
  tipos: TipoDeCuarto[];
  /** Sin fila se crea; con fila se edita. */
  fila?: Tables<'properties'>;
  /**
   * Lo que devolvió `leerSecretos`, que corre con el cliente administrativo. Es
   * la ÚNICA forma de mostrar el código guardado: el mismo select con el JWT del
   * admin devuelve `42501`.
   */
  secretosGuardados?: SecretosApartamento | null;
  /** Los cuartos ACTIVOS del apartamento, tal como los da `leerApartamento`. */
  cuartosGuardados?: Tables<'property_rooms'>[];
  /**
   * Los faltantes propios del apartamento. Llegan SIN filtrar por activos —así
   * los devuelve `leerApartamento`, a propósito— y se filtran aquí abajo.
   */
  faltantesGuardados?: Tables<'missing_item_catalog'>[];
}

/** Los tres campos de la sección 4 que no viven en `properties`. */
type CamposSecretos = {
  tipo_cerradura: string;
  codigo_acceso: string;
  notas_acceso: string;
};

const TIPOS_CERRADURA = [
  { valor: 'inteligente', etiqueta: 'Cerradura inteligente' },
  { valor: 'llave_fisica', etiqueta: 'Llave física' },
] as const;

/** ¿Este `campo` de un `ResultadoAccion` es de la sección de secretos? */
function esCampoDeSecretos(campo: string | undefined): campo is keyof CamposSecretos {
  return campo === 'tipo_cerradura' || campo === 'codigo_acceso' || campo === 'notas_acceso';
}

/** Un texto que viene de la base, en la forma que un `<input>` sabe mostrar. */
function texto(v: string | null | undefined): string {
  return v ?? '';
}

/**
 * Los `defaultValues`.
 *
 * `hora_limite` arranca en `11:30` (UI-SPEC §8.1) y una fila guardada pasa por
 * `valoresDesdeFilaGuardada`, que recorta los segundos que PostgREST añade al
 * serializar un `time`. Sin ese recorte, el resolver marca `hora_limite` como
 * inválida nada más abrir la pantalla de edición de CUALQUIER apartamento.
 *
 * Todos los nulos se convierten a `''`: es lo que un `<input>` muestra, y el
 * esquema los devuelve a `null` con `vacioANulo`.
 */
function valoresIniciales(
  fila: Tables<'properties'> | undefined,
  cuartos: Tables<'property_rooms'>[],
  faltantes: Tables<'missing_item_catalog'>[],
): FormularioInput {
  // Los dos arrays se ordenan por `sort_order` en `leerApartamento` y ese orden
  // ES el del formulario: el índice de la fila es lo que se vuelve a guardar
  // como `sort_order` al enviar.
  const colecciones = {
    cuartos: cuartos.map((c, i) => ({
      id: c.id,
      room_type_id: c.room_type_id,
      etiqueta: c.etiqueta,
      sort_order: i,
    })),
    // FILTRO POR ACTIVOS AQUI, y no en `leerApartamento`: esa función devuelve
    // TODOS los faltantes del apartamento a propósito (el plan 02-10 lo dejó
    // escrito), porque `mic_prop_uniq` tampoco excluye los inactivos y hay que
    // poder reactivarlos en vez de chocar con su duplicado. Quien reactiva es
    // `guardarCuartosYFaltantes`, en el servidor; el formulario solo pinta las
    // filas vivas. Sin este filtro, un faltante que el admin quitó ayer vuelve a
    // aparecer hoy como si nunca lo hubiera quitado.
    faltantes: faltantes
      .filter((f) => f.is_active)
      .map((f, i) => ({ id: f.id, nombre: f.nombre, sort_order: i })),
  };

  if (!fila) {
    return {
      nombre: '',
      cluster: '',
      direccion: '',
      maps_url: '',
      gestion_vivaguest: true,
      tarifa_huesped: '',
      pago_aseador: '',
      fee_discriminado: false,
      responsable_id: '',
      suplente_id: '',
      contacto_externo: '',
      hora_limite: '11:30',
      ...colecciones,
    };
  }

  const v = valoresDesdeFilaGuardada(fila);
  return {
    ...v,
    direccion: texto(fila.direccion),
    maps_url: texto(fila.maps_url),
    responsable_id: texto(fila.responsable_id),
    suplente_id: texto(fila.suplente_id),
    contacto_externo: texto(fila.contacto_externo),
    tarifa_huesped: fila.tarifa_huesped ?? '',
    pago_aseador: fila.pago_aseador ?? '',
    ...colecciones,
  };
}

export function FormularioApartamento({
  clusters,
  aseadores,
  tipos,
  fila,
  secretosGuardados,
  cuartosGuardados,
  faltantesGuardados,
}: Props) {
  const router = useRouter();
  const prefijo = useId();

  // Un id estable y compartido por campo. La barra de acciones los necesita para
  // llevar el foco al campo de cada ítem del checklist, y `SeccionGestion` los
  // recibe por prop en vez de acuñar los suyos por la misma razón.
  const idDe = (campo: keyof ApartamentoInput) => `${prefijo}-${campo}`;

  const form = useForm<FormularioInput>({
    // El resolver POR DEFECTO es el de borrador: es lo que hace que al salir de
    // un campo se pinte su error inline sin exigir todavía lo que solo hace falta
    // para activar. El submit elige el esquema según el botón (§8.2).
    //
    // `esquemaFormularioBorrador` es `esquemaBorrador` MAS los dos arrays de la
    // sección 5. Resolver con `esquemaBorrador` a secas dejaría los arrays sin
    // mirar —un `z.object` descarta las claves que no conoce— y el duplicado de
    // etiqueta llegaría a la base como un 23505 sobre una fila que el admin no
    // sabría cuál es.
    resolver: zodResolver(esquemaFormularioBorrador),
    mode: 'onBlur',
    defaultValues: valoresIniciales(fila, cuartosGuardados ?? [], faltantesGuardados ?? []),
  });

  const {
    register,
    control,
    watch,
    getValues,
    setError,
    formState: { errors },
  } = form;

  // SUSCRIPCION GRANULAR, CON ARRAY DE NOMBRES. La forma sin argumentos de esta
  // misma API re-renderiza el formulario entero en cada tecla de cualquiera de
  // los 12 campos, y con los dos arrays que añade el plan 02-13 eso se siente.
  // Está prohibida en este directorio y hay un `grep` que lo verifica, así que su
  // nombre no se escribe literal ni en este comentario.
  //
  // Estos ocho son los únicos campos que cambian algo FUERA de su propio input.
  const [nombre, cluster, gestion, tarifa, pago, responsable, contacto, mapsUrl] = watch([
    'nombre',
    'cluster',
    'gestion_vivaguest',
    'tarifa_huesped',
    'pago_aseador',
    'responsable_id',
    'contacto_externo',
    'maps_url',
  ]);

  const [secretos, setSecretos] = useState<CamposSecretos>({
    tipo_cerradura: secretosGuardados?.tipo_cerradura ?? 'inteligente',
    codigo_acceso: texto(secretosGuardados?.codigo_acceso),
    notas_acceso: texto(secretosGuardados?.notas_acceso),
  });
  const [errorSecreto, setErrorSecreto] = useState<{ campo: string; mensaje: string } | null>(
    null,
  );

  const [enVuelo, setEnVuelo] = useState<OperacionEnVuelo>(null);

  /** Regla 1 de §8.2: `Guardar` se habilita con nombre y cluster, nada más. */
  const puedeGuardar =
    typeof nombre === 'string' &&
    nombre.trim().length > 0 &&
    typeof cluster === 'string' &&
    cluster.trim().length > 0;

  function enfocarCampo(campo: Faltante['campo']) {
    const nodo = document.getElementById(idDe(campo));
    if (!nodo) return;
    nodo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    nodo.focus({ preventScroll: true });
  }

  async function enviar(modo: 'borrador' | 'activar') {
    setErrorSecreto(null);

    const valores = getValues();
    const esquema = modo === 'activar' ? esquemaFormularioActivar : esquemaFormularioBorrador;
    const parseado = esquema.safeParse(valores);

    if (!parseado.success) {
      // El botón de activar está deshabilitado mientras falte algo, así que
      // llegar aquí con `modo === 'activar'` significa que la lista de faltantes
      // y el esquema discrepan. Se pinta inline igual, porque un submit que no
      // hace nada ni dice nada es peor que un mensaje redundante.
      //
      // El nombre del campo es el PATH COMPLETO (`cuartos.1.etiqueta`), no su
      // primer segmento: con `problema.path[0]` los errores de los dos arrays se
      // apilarían todos sobre `cuartos` y ninguna fila mostraría el suyo, que es
      // exactamente lo que el issue por índice de `esquemaCuartos` evita.
      for (const problema of parseado.error.issues) {
        const nombre = nombreDeCampo(problema.path);
        if (nombre) setError(nombre, { message: problema.message });
      }
      enfocarPorRuta(parseado.error.issues[0]?.path);
      // El submit NO llega al servidor. Es la mitad de la regla de §8.1 sección
      // 5 que el spec de este plan verifica contando las filas de la base.
      return;
    }

    setEnVuelo(modo);
    try {
      const resultado = await guardarApartamento({
        id: fila?.id,
        modo,
        campos: valores,
        secretos: {
          tipo_cerradura: secretos.tipo_cerradura,
          codigo_acceso: secretos.codigo_acceso,
          notas_acceso: secretos.notas_acceso,
        },
      });

      if (!resultado.ok) {
        // §9.4: con `campo` va inline bajo ese input; sin `campo` va a toast. Y
        // en los dos casos el formulario CONSERVA todo lo escrito, que es gratis
        // con react-hook-form porque el estado vive en el cliente.
        if (esCampoDeSecretos(resultado.campo)) {
          setErrorSecreto({ campo: resultado.campo, mensaje: resultado.error });
        } else if (resultado.campo) {
          setError(resultado.campo as keyof ApartamentoInput, { message: resultado.error });
          enfocarPrimerError(resultado.campo);
        } else {
          toast.error(resultado.error);
        }
        return;
      }

      // ── LA SECCION 5, DESPUES Y CON SU PROPIA ACCION ───────────────────────
      // Va después a la fuerza: al crear no existe el `property_id` al que
      // colgar los cuartos hasta que la llamada de arriba devuelve el id. Los
      // `sort_order` se derivan del ORDEN DE LAS FILAS en pantalla, no del valor
      // que traían: es lo que hace que quitar la fila del medio renumere el
      // resto en vez de dejar un hueco.
      const idGuardado = resultado.id;
      if (idGuardado) {
        const colecciones = await guardarCuartosYFaltantes(
          idGuardado,
          parseado.data.cuartos.map((c, i) => ({ ...c, sort_order: i })),
          parseado.data.faltantes.map((f, i) => ({ ...f, sort_order: i })),
        );

        if (!colecciones.ok) {
          // A TOAST, aunque el error traiga `campo`. `campoDeConstraint` traduce
          // `property_rooms_etiqueta_uniq` a `etiqueta` y `mic_prop_uniq` a
          // `nombre`, y ninguno de los dos es un campo de nivel superior de este
          // formulario: son una fila de un array, y el error no dice CUAL.
          // Pintarlo bajo una fila elegida al azar sería peor que un toast.
          //
          // En la práctica no debería verse: `esquemaFormularioBorrador` bloquea
          // el duplicado antes de llegar aquí y la action reactiva el cuarto que
          // solo estaba desactivado. Si un usuario lee este toast, es que la UI
          // dejó pasar algo.
          toast.error(colecciones.error);
          return;
        }
      }

      toast.success(resultado.mensaje);

      if (!fila && resultado.id) {
        // Al CREAR hay que quedarse en el detalle del apartamento nuevo. Sin
        // esto, el segundo `Guardar` volvería a insertar y el admin se
        // encontraría con `Ya existe un apartamento con ese nombre.` sobre un
        // apartamento que acaba de crear él mismo.
        router.replace(`/apartamentos/${resultado.id}`);
        return;
      }

      // La action ya hizo `revalidatePath`; esto pide el árbol de servidor ya,
      // para que el estado del encabezado refleje la activación sin recargar.
      router.refresh();
    } finally {
      setEnVuelo(null);
    }
  }

  function enfocarPrimerError(campo: unknown) {
    if (typeof campo !== 'string') return;
    document.getElementById(`${prefijo}-${campo}`)?.focus();
  }

  /**
   * De la ruta de un issue de Zod al nombre de campo de react-hook-form.
   *
   * Para los 12 campos planos la ruta tiene un solo segmento y el nombre es ese
   * segmento. Para los dos arrays tiene tres (`['cuartos', 1, 'etiqueta']`) y el
   * nombre es la ruta ENTERA unida por puntos, que es la notación con la que RHF
   * indexa los `useFieldArray`. Quedarse con el primer segmento apilaría todos
   * los errores de las ocho filas sobre `cuartos` y ninguna fila mostraría el
   * suyo.
   */
  function nombreDeCampo(
    ruta: readonly PropertyKey[],
  ): Parameters<typeof setError>[0] | undefined {
    if (ruta.length === 0 || typeof ruta[0] !== 'string') return undefined;
    return ruta.join('.') as Parameters<typeof setError>[0];
  }

  /** Lleva el foco al control que falló, sea un campo plano o una fila. */
  function enfocarPorRuta(ruta: readonly PropertyKey[] | undefined) {
    if (!ruta || ruta.length === 0) return;
    const [raiz, indice, campo] = ruta;

    if (raiz === 'cuartos' && typeof indice === 'number') {
      const cual = campo === 'room_type_id' ? 'tipo' : 'etiqueta';
      document.getElementById(idDeFilaCuarto(prefijo, indice, cual))?.focus();
      return;
    }
    if (raiz === 'faltantes' && typeof indice === 'number') {
      document.getElementById(idDeFilaFaltante(prefijo, indice))?.focus();
      return;
    }

    enfocarPrimerError(raiz);
  }

  return (
    <form
      className="flex max-w-formulario flex-col gap-xl"
      // El submit nativo no dispara nada: los dos botones de la barra son
      // `type="button"` y cada uno elige su esquema. `noValidate` apaga la
      // validación del navegador, cuyos mensajes vienen en el idioma del sistema
      // y no en el copy de §15.
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      <Seccion titulo="Identificación">
        <Field data-invalid={Boolean(errors.nombre) || undefined}>
          <FieldLabel htmlFor={idDe('nombre')}>Nombre</FieldLabel>
          <Input
            id={idDe('nombre')}
            autoComplete="off"
            {...register('nombre')}
            aria-invalid={Boolean(errors.nombre) || undefined}
          />
          <FieldError errors={[errors.nombre]} />
        </Field>

        <Field data-invalid={Boolean(errors.cluster) || undefined}>
          <FieldLabel id={`${idDe('cluster')}-label`} htmlFor={idDe('cluster')}>
            Cluster
          </FieldLabel>
          <Controller
            control={control}
            name="cluster"
            render={({ field }) => (
              <SelectorCluster
                id={idDe('cluster')}
                idEtiqueta={`${idDe('cluster')}-label`}
                valor={typeof field.value === 'string' ? field.value : ''}
                onChange={(v) => field.onChange(v)}
                clusters={clusters}
                invalido={Boolean(errors.cluster)}
              />
            )}
          />
          <FieldError errors={[errors.cluster]} />
        </Field>

        <Field>
          <FieldLabel htmlFor={idDe('direccion')}>Dirección</FieldLabel>
          <Input id={idDe('direccion')} autoComplete="off" {...register('direccion')} />
        </Field>

        <Field data-invalid={Boolean(errors.maps_url) || undefined}>
          <FieldLabel htmlFor={idDe('maps_url')}>Link de Google Maps</FieldLabel>
          <div className="flex items-center gap-sm">
            <Input
              id={idDe('maps_url')}
              type="url"
              inputMode="url"
              autoComplete="off"
              {...register('maps_url')}
              aria-invalid={Boolean(errors.maps_url) || undefined}
            />
            {typeof mapsUrl === 'string' && mapsUrl.trim().length > 0 && (
              // `rel="noopener noreferrer"` con `target="_blank"`: sin `noopener`
              // la página abierta puede reescribir esta pestaña por
              // `window.opener`. Es un link que el propio admin pegó, pero el
              // atributo cuesta cero (T-02-66).
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Abrir en Google Maps en una pestaña nueva"
                render={
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden="true" />
                  </a>
                }
              />
            )}
          </div>
          <FieldError errors={[errors.maps_url]} />
        </Field>
      </Seccion>

      <Seccion titulo="Gestión">
        <SeccionGestion form={form} aseadores={aseadores} idDe={idDe} />
      </Seccion>

      <Seccion titulo="Dinero">
        {gestion === false ? (
          // La sección desaparece ENTERA, no se deshabilita: `properties` prohíbe
          // tarifas en una unidad externa por `cl_unmanaged_is_inert`, así que un
          // campo gris pero presente sugeriría que el dato existe y solo está
          // bloqueado.
          <p className="text-body text-muted-foreground">
            Las unidades de gestión externa no llevan tarifas.
          </p>
        ) : (
          <>
            <Field data-invalid={Boolean(errors.tarifa_huesped) || undefined}>
              <FieldLabel htmlFor={idDe('tarifa_huesped')}>Tarifa al huésped</FieldLabel>
              <CampoMoneda
                id={idDe('tarifa_huesped')}
                {...register('tarifa_huesped', opcionesRegistroMoneda)}
                aria-invalid={Boolean(errors.tarifa_huesped) || undefined}
              />
              <FieldError errors={[errors.tarifa_huesped]} />
            </Field>

            <Field data-invalid={Boolean(errors.pago_aseador) || undefined}>
              <FieldLabel htmlFor={idDe('pago_aseador')}>Pago al aseador</FieldLabel>
              <CampoMoneda
                id={idDe('pago_aseador')}
                {...register('pago_aseador', opcionesRegistroMoneda)}
                aria-invalid={Boolean(errors.pago_aseador) || undefined}
              />
              <FieldError errors={[errors.pago_aseador]} />
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="fee_discriminado"
                render={({ field }) => (
                  <Switch
                    id={idDe('fee_discriminado')}
                    name={field.name}
                    checked={field.value === true}
                    onCheckedChange={(activado) => field.onChange(activado)}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <div className="flex flex-col gap-xs">
                <FieldLabel htmlFor={idDe('fee_discriminado')}>Fee discriminado</FieldLabel>
                {/* APTO-10: el helper existe porque el nombre del campo sugiere
                    que participa en algún cálculo, y no participa en ninguno. */}
                <FieldDescription>Solo informativo. No entra en ningún cálculo.</FieldDescription>
              </div>
            </Field>
          </>
        )}
      </Seccion>

      <Seccion titulo="Operación">
        <Field data-invalid={Boolean(errors.hora_limite) || undefined}>
          <FieldLabel htmlFor={idDe('hora_limite')}>Hora límite</FieldLabel>
          {/*
            `step="60"` deja fuera los segundos del selector nativo: la columna es
            `time` y el esquema exige `HH:MM` exacto.

            DIVERGENCIA MEDIDA CON §8.4, que pide formato 24h: el control nativo
            se pinta según la LOCALE DEL NAVEGADOR, y `es-CO` es de 12 horas, así
            que en pantalla se lee `11:30 AM`. Se probó poner `lang` en el propio
            input y Chrome lo ignora (comprobado con captura). El VALOR que viaja
            sigue siendo `11:30` en 24h, que es lo que la base guarda, y forzar el
            formato exigiría sustituir el control nativo por uno propio, con lo
            que se pierden el teclado, el selector del sistema y la
            accesibilidad que trae de fábrica. Se acepta la divergencia; queda
            escrita para que no se reporte como hallazgo nuevo.
          */}
          <Input
            id={idDe('hora_limite')}
            type="time"
            step="60"
            className="w-col-dinero"
            {...register('hora_limite')}
            aria-invalid={Boolean(errors.hora_limite) || undefined}
          />
          <FieldError errors={[errors.hora_limite]} />
        </Field>

        <Field data-invalid={errorSecreto?.campo === 'tipo_cerradura' || undefined}>
          <FieldLabel
            id={`${prefijo}-tipo_cerradura-label`}
            htmlFor={`${prefijo}-tipo_cerradura`}
          >
            Tipo de cerradura
          </FieldLabel>
          <Select
            value={secretos.tipo_cerradura}
            onValueChange={(valor) =>
              setSecretos((s) => ({
                ...s,
                tipo_cerradura: typeof valor === 'string' ? valor : s.tipo_cerradura,
              }))
            }
          >
            {/* Etiqueta MAS contenido en el nombre accesible: con solo
                `htmlFor`, el disparador se anuncia sin el valor elegido. Medido;
                ver la nota de `SeccionGestion`. */}
            <SelectTrigger
              id={`${prefijo}-tipo_cerradura`}
              aria-labelledby={`${prefijo}-tipo_cerradura-label ${prefijo}-tipo_cerradura`}
              className="w-full"
            >
              <SelectValue>
                {(v: string) =>
                  TIPOS_CERRADURA.find((t) => t.valor === v)?.etiqueta ?? 'Elige un tipo'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TIPOS_CERRADURA.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errorSecreto?.campo === 'tipo_cerradura' && (
            <FieldError>{errorSecreto.mensaje}</FieldError>
          )}
        </Field>

        <Field data-invalid={errorSecreto?.campo === 'codigo_acceso' || undefined}>
          <FieldLabel htmlFor={`${prefijo}-codigo_acceso`}>Código de acceso</FieldLabel>
          <Input
            id={`${prefijo}-codigo_acceso`}
            // `autoComplete="off"` y no `type="password"`: el admin lo está
            // editando y tiene que poder leerlo para comprobarlo. Quien lo ve es
            // el admin autenticado en la pantalla donde lo escribe (T-02-63).
            autoComplete="off"
            value={secretos.codigo_acceso}
            onChange={(e) => setSecretos((s) => ({ ...s, codigo_acceso: e.target.value }))}
            aria-invalid={errorSecreto?.campo === 'codigo_acceso' || undefined}
          />
          <FieldDescription>
            Solo lo ve el aseador asignado a un aseo vigente, y cada consulta queda
            registrada.
          </FieldDescription>
          {errorSecreto?.campo === 'codigo_acceso' && (
            <FieldError>{errorSecreto.mensaje}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor={`${prefijo}-notas_acceso`}>Notas de acceso</FieldLabel>
          <Textarea
            id={`${prefijo}-notas_acceso`}
            rows={2}
            value={secretos.notas_acceso}
            onChange={(e) => setSecretos((s) => ({ ...s, notas_acceso: e.target.value }))}
          />
        </Field>
      </Seccion>

      {/*
        SECCION 5 (UI-SPEC §8.1). Va después de Operación y antes de la barra.

        Los dos editores NO alimentan la barra de acciones: los cuartos y los
        faltantes no son puertas de activación, así que la suscripción granular
        de arriba sigue teniendo los mismos ocho nombres y no se le añade ninguno.
        Verificado con un test de Playwright que activa un apartamento completo
        con la sección vacía.
      */}
      <Seccion titulo="Cuartos y faltantes">
        <EditorCuartos form={form} tipos={tipos} prefijo={prefijo} />

        {/*
          UNA sola sección con las dos listas, no dos secciones: §8.1 dice
          "cinco secciones" y las enumera, y la quinta es esta. El sub-encabezado
          de 14/600 separa las dos listas sin acuñar una sexta regla de 1px, que
          es lo que las convertiría en dos secciones de hecho.
        */}
        <h3 className="text-body font-semibold text-foreground">
          Faltantes de este apartamento
        </h3>
        <EditorFaltantes form={form} prefijo={prefijo} />
      </Seccion>

      <BarraAccionesFormulario
        valores={{
          gestion_vivaguest: gestion,
          tarifa_huesped: tarifa,
          pago_aseador: pago,
          responsable_id: responsable,
          contacto_externo: contacto,
        }}
        enfocarCampo={enfocarCampo}
        onGuardar={() => void enviar('borrador')}
        onActivar={() => void enviar('activar')}
        puedeGuardar={puedeGuardar}
        enVuelo={enVuelo}
      />
    </form>
  );
}

/** Una sección de §8.1: heading 16/600 con una regla de 1px encima. */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-lg border-t border-border pt-lg">
      <h2 className="text-heading text-foreground">{titulo}</h2>
      {children}
    </section>
  );
}
