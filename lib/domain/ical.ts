// PARSER DE iCal DEL PIPELINE. Puro, sin red, sin base, sin dependencias.
//
// POR QUE NO SE USA `node-ical`, Y POR QUE ESTE ARCHIVO EXISTE.
//
// `research/STACK.md` recomienda `node-ical`. El research de la Fase 3 lo ANULA, y
// la razon es una medicion, no una preferencia: `node-ical@0.27.1` se instalo, se
// ejecuto contra este mismo feed real y quedo descalificado por dos motivos.
//
//   1. Devuelve un objeto temporal de JavaScript cuyo instante depende de la zona
//      del proceso. Bajo la zona UTC —que es la de Vercel, la del CI y la que fija
//      a proposito `vitest.config.ts`— el fin de reserva del dia del checkout,
//      formateado al dia de Bogota, sale como el dia ANTERIOR:
//
//        TZ=UTC            end = 2026-09-02T00:00:00.000Z  -> en Bogota: 2026-09-01
//        TZ=America/Bogota end = 2026-09-02T05:00:00.000Z  -> en Bogota: 2026-09-02
//
//      Traducido a operacion: el aseo agendado un dia antes, con el huesped todavia
//      dentro del apartamento. Y el error es SILENCIOSO en toda la suite, porque la
//      suite corre en UTC.
//
//   2. Indexa su resultado por el identificador del evento y colapsa duplicados sin
//      avisar. Medido con dos eventos de fechas distintas y el mismo identificador:
//      "VEVENT en el texto: 2 | eventos devueltos: 1". Gana el ultimo. Para un
//      pipeline cuyo unico trabajo es no perder un checkout, un parser que se traga
//      un evento en silencio esta descalificado.
//
// EN ESTE ARCHIVO NO SE CONSTRUYE NI UN SOLO OBJETO DE FECHA, A PROPOSITO. El
// guardarrail 10 de `scripts/ci/check-service-role.sh` lo vigila por grep sobre
// `lib/domain/ical*.ts`. De los ocho digitos crudos a la forma con guiones se llega
// con un corte de cadena, y las fechas de negocio se comparan lexicograficamente
// sobre esa forma.
//
// La complejidad que justificaria la libreria tampoco existe en este feed: seis
// propiedades, cero reglas de recurrencia, cero definiciones de zona horaria, cero
// alarmas y cero valores con hora. Lo que si hace falta —desdoblado, desescapado,
// pila de componentes y rechazo de los valores con hora— cabe en este archivo.
//
// COSTURA CON `ical-preview.ts`: ese archivo es el escaner DIAGNOSTICO de la Fase 2
// y se conserva tal cual, con su divergencia deliberada. Lo unico que comparte con
// este modulo es `desdoblar`, que se movio aqui porque es la unica funcion donde una
// divergencia entre las dos orillas seria un defecto y no una decision.

/**
 * RFC 5545 §3.1: una linea fisica que empieza por espacio o tabulador es la
 * continuacion de la anterior.
 *
 * Sin esto NADA funciona: Airbnb pliega la `DESCRIPTION` a 75 octetos y parte el
 * codigo de reserva por la mitad, asi que el reconocimiento del codigo falla y el
 * feed lleno se lee como cero reservas.
 *
 * La normalizacion de CRLF a LF NO es cosmetica: el RFC especifica CRLF y es lo que
 * Airbnb manda de verdad. `airbnb-real-crlf.ics` es la fixture que ejerce esa ruta,
 * y borrar esa sustitucion la pone en rojo (senuelo medido en el plan 03-02).
 */
export function desdoblar(texto: string): string {
  return texto.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

/**
 * Las cuatro secuencias escapadas de un valor de texto (RFC 5545 §3.3.11).
 * `\N` es la forma mayuscula legal del salto de linea.
 */
const ESCAPES: Record<string, string> = {
  n: '\n',
  N: '\n',
  ',': ',',
  ';': ';',
  '\\': '\\',
};

/**
 * Desescapa un valor de texto de iCal.
 *
 * UNA SOLA PASADA, y eso importa: desescapar en dos pasos (primero la barra
 * invertida, luego el salto) convierte la secuencia "barra escapada seguida de la
 * letra n" en un salto de linea que el feed nunca mando. Es el modo de fallo
 * clasico de esta funcion y tiene su test.
 *
 * Hace falta para separar la URL de reserva del telefono del huesped dentro del
 * `DESCRIPTION`: en el archivo van en la misma linea logica, unidas por la
 * secuencia escapada del salto.
 */
export function desescapar(valor: string): string {
  return valor.replace(/\\([nN,;\\])/g, (_, c: string) => ESCAPES[c]);
}

/**
 * `'20260904'` produce `'2026-09-04'`. Puro corte de cadena: ni parseo, ni zona
 * horaria, ni objeto temporal. Da lo mismo bajo cualquier zona del proceso, y hay
 * un test que lo mide cambiando la zona en caliente.
 */
export function aIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Por que un evento no se puede interpretar. `null` cuando si se puede. */
export type DefectoEvento = 'fecha-ausente' | 'fecha-no-es-dia-completo';

/**
 * Lo que el parser saca del texto, tal cual.
 *
 * CONTIENE DATO PERSONAL Y NO CRUZA EL MODULO DE NORMALIZACION. El `DESCRIPTION`
 * del feed de Airbnb trae los ultimos cuatro digitos del telefono del huesped.
 * `ical-normalizar.ts` es la frontera: su tipo de salida NO tiene ranura para la
 * descripcion, asi que pasar este objeto hacia la base es un error de compilacion.
 *
 * `dtstart` y `dtend` son los OCHO DIGITOS CRUDOS, nunca un objeto temporal y nunca
 * una forma ya cortada. `null` cuando el valor falta o no es un dia completo.
 */
export type VEventoCrudo = {
  uid: string | null;
  summary: string | null;
  /** `'YYYYMMDD'` crudo. */
  dtstart: string | null;
  /** `'YYYYMMDD'` crudo. ES el dia del aseo: no se le suma ni se le resta nada. */
  dtend: string | null;
  /** Trae los cuatro digitos del telefono del huesped. Ya desescapado. */
  description: string | null;
  /**
   * `false` cuando el evento tiene un defecto de FORMA que impide sacarle una fecha
   * de negocio sin adivinar. El clasificador lo manda a `desconocido` aunque su
   * descripcion traiga la URL de reserva: el defecto de forma gana.
   */
  interpretable: boolean;
  defecto: DefectoEvento | null;
};

export type DocumentoIcs = {
  /** `true` si el cuerpo abre `BEGIN:VCALENDAR`. Es el sniff de la Fase 2. */
  esCalendario: boolean;
  /**
   * `true` solo si el calendario se cerro y no quedo ningun componente abierto.
   *
   * Es la senal que el sniff de cabecera NO da: un cuerpo truncado a mitad de un
   * evento SI empieza por `BEGIN:VCALENDAR`, asi que la validacion de cabecera lo
   * deja pasar. Una respuesta parcial de red no es una cancelacion de reservas, y
   * sin esta senal el diff no puede distinguirlas.
   */
  completo: boolean;
  /**
   * LISTA POSICIONAL, en el orden del archivo. Deliberadamente NO es un indice por
   * identificador: indexar colapsa los duplicados en silencio, que es el segundo
   * motivo por el que `node-ical` quedo descalificado.
   */
  eventos: VEventoCrudo[];
};

/** `NOMBRE;PARAM=VALOR:contenido` sobre una linea ya desdoblada. */
const RE_LINEA = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/;

/** Un dia completo: ocho digitos, sin hora y sin zona. */
const RE_DIA = /^\d{8}$/;

type EventoEnCurso = {
  uid: string | null;
  summary: string | null;
  dtstart: string | null;
  dtend: string | null;
  description: string | null;
  fechaConHora: boolean;
};

const nuevoEvento = (): EventoEnCurso => ({
  uid: null,
  summary: null,
  dtstart: null,
  dtend: null,
  description: null,
  fechaConHora: false,
});

function cerrar(ev: EventoEnCurso): VEventoCrudo {
  // El defecto de forma se decide en un solo sitio y con prioridad fija: si alguna
  // fecha vino con hora, ese es el defecto; si simplemente falta, es el otro.
  let defecto: DefectoEvento | null = null;
  if (ev.fechaConHora) defecto = 'fecha-no-es-dia-completo';
  else if (ev.dtstart === null || ev.dtend === null) defecto = 'fecha-ausente';

  return {
    uid: ev.uid,
    summary: ev.summary,
    dtstart: ev.dtstart,
    dtend: ev.dtend,
    description: ev.description,
    interpretable: defecto === null,
    defecto,
  };
}

/**
 * Lee el cuerpo de un feed iCal y devuelve sus eventos crudos mas el estado del
 * documento.
 *
 * @param cuerpo Texto crudo tal como llego por la red. El desdoblado y los finales
 *   de linea son parte del caso y se resuelven aqui dentro.
 */
export function parsearIcs(cuerpo: string): DocumentoIcs {
  const esCalendario = /BEGIN:VCALENDAR/i.test(cuerpo);
  if (!esCalendario) return { esCalendario: false, completo: false, eventos: [] };

  const lineas = desdoblar(cuerpo).split('\n');

  const eventos: VEventoCrudo[] = [];
  // PILA DE COMPONENTES. El escaner de la Fase 2 es plano, y por eso un `DTSTART`
  // dentro de una alarma o de una definicion de zona horaria envenenaria la fecha
  // del evento contenedor en silencio. Airbnb no los manda hoy; una captura de un
  // anuncio es evidencia de un anuncio, no del formato.
  const pila: string[] = [];
  let enCurso: EventoEnCurso | null = null;
  let cerroCalendario = false;

  for (const cruda of lineas) {
    // El retorno de carro suelto de un feed con finales de linea mezclados.
    const linea = cruda.replace(/\r$/, '');
    if (linea === '') continue;

    const m = RE_LINEA.exec(linea);
    if (!m) continue;

    const nombre = m[1].toUpperCase();
    const params = m[2];
    const valor = m[3];

    if (nombre === 'BEGIN') {
      const componente = valor.trim().toUpperCase();
      // Solo el nivel exterior abre un evento. Un `VEVENT` anidado dentro de otro
      // es ilegal; se trata como componente cualquiera y sus propiedades se ignoran.
      if (componente === 'VEVENT' && enCurso === null) enCurso = nuevoEvento();
      pila.push(componente);
      continue;
    }

    if (nombre === 'END') {
      const componente = valor.trim().toUpperCase();
      const tope = pila[pila.length - 1];
      if (tope === componente) pila.pop();
      if (componente === 'VCALENDAR') cerroCalendario = true;
      // El evento se emite SOLO al cerrarlo de verdad. El octavo evento de un cuerpo
      // truncado no llega aqui, asi que no se emite a medias.
      if (componente === 'VEVENT' && enCurso !== null && tope === 'VEVENT') {
        eventos.push(cerrar(enCurso));
        enCurso = null;
      }
      continue;
    }

    // Las propiedades solo cuentan si el componente MAS INTERNO es el evento.
    if (enCurso === null || pila[pila.length - 1] !== 'VEVENT') continue;

    switch (nombre) {
      case 'UID':
        enCurso.uid = desescapar(valor).trim();
        break;
      case 'SUMMARY':
        enCurso.summary = desescapar(valor).trim();
        break;
      case 'DESCRIPTION':
        enCurso.description = desescapar(valor);
        break;
      case 'DTSTART':
      case 'DTEND': {
        const bruto = valor.trim();
        if (RE_DIA.test(bruto)) {
          if (nombre === 'DTSTART') enCurso.dtstart = bruto;
          else enCurso.dtend = bruto;
        } else {
          // NO se trunca a los ocho primeros digitos y NO se adivina la zona: el
          // evento se marca no interpretable y el clasificador lo manda a
          // `desconocido`. Adivinar la zona es el modo de fallo documentado de los
          // feeds "que sincronizan pero mal", y aqui produciria el aseo un dia
          // corrido. `params` se ignora a proposito: la forma la decide el VALOR.
          void params;
          enCurso.fechaConHora = true;
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    esCalendario: true,
    completo: cerroCalendario && pila.length === 0 && enCurso === null,
    eventos,
  };
}
