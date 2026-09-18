---
quick_id: 260918-h47
titulo: Fuera el asistente de instalación
tipo: borrado
fecha: 2026-09-18
tareas: 3
autonomous: false
toca_base_de_datos: false

files_modified:
  # BORRADOS
  - app/(cleaner)/instalar/_actions.ts
  - app/(cleaner)/instalar/_actions.test.ts
  - app/(cleaner)/_components/PruebaDeAviso.tsx
  - .planning/phases/05-notificaciones-push-e-instalaci-n-de-la-pwa/05-12-PLAN.md
  # EDITADOS — código
  - app/(cleaner)/_components/BannerAvisos.tsx
  - app/(admin)/aseadores/_components/MenuAseador.tsx
  - lib/domain/avisos.ts
  - lib/push/origen.ts
  # EDITADOS — planning
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/BACKLOG.md
  - .planning/RETOMAR.md
  - .planning/STATE.md

no_se_tocan:
  - app/manifest.ts
  - lib/push/plataforma.ts
  - app/(cleaner)/_components/BotonActivarAvisos.tsx
  - hooks/usarEstadoDeAvisos.ts
  - app/(admin)/operacion/_components/TiraAvisosAdmin.tsx
  - app/(admin)/_components/EstadoAvisosAseador.tsx
  - e2e/fixtures.ts
  - e2e/push-instalacion.spec.ts
  - supabase/migrations/20260911120000_16_push_avisos.sql

requirements: [PWA-02, PWA-03]

must_haves:
  truths:
    - "Cero apariciones de la ruta `/instalar` en el árbol de código (app, lib, e2e, components, hooks, scripts). Hoy son 14."
    - "`BotonActivarAvisos` sigue existiendo, sale sin un solo byte de diferencia, y sigue alcanzable desde la app del aseador en los estados `nunca_pedido` y `roto`."
    - "En todo el árbol del aseador, la petición de permiso vive en UN SOLO archivo, `BotonActivarAvisos.tsx`, igual que hoy. (El admin tiene su propia llamada en `TiraAvisosAdmin.tsx`, para activar sus avisos desde `/operacion`: es correcta, es de otro árbol y no se toca.)"
    - "La detección de instalación no se tocó: `app/manifest.ts` y `lib/push/plataforma.ts` salen sin un solo byte de diferencia."
    - "La migración 16 sale sin un solo byte de diferencia. Este quick no toca la base."
    - "Los seis casos E1 a E6 de `e2e/push-instalacion.spec.ts` siguen siendo seis y siguen pasando (E4 sigue saltado)."
    - "REQUIREMENTS.md no promete ninguna superficie de instalación que ya no exista."
  artifacts:
    - "`app/(cleaner)/instalar/` no existe como directorio."
    - "`app/(cleaner)/_components/PruebaDeAviso.tsx` no existe."
    - "`BannerAvisos.tsx` sin `import Link`, sin la forma `enlace` de la unión de acciones y sin el campo `apoyo` del tipo `Contenido`."
  key_links:
    - "`app/(cleaner)/layout.tsx` sigue montando `<BannerAvisos>` como primer hijo de `<main>`. No se toca."
    - "`BannerAvisos` sigue importando y renderizando `BotonActivarAvisos` en `nunca_pedido` y en `roto`."
---

<objective>
Eliminar por completo el asistente de instalación de la PWA: la isla de código que
se construyó para una página `app/(cleaner)/instalar/page.tsx` que nunca llegó a
existir, los cuatro enlaces del banner del aseador que caen en 404, el ítem del
menú del admin que copia una URL muerta, y la deuda que `.planning` seguía
prometiendo.

Se conserva el botón que pide el permiso de avisos, entero y sin tocar.

**La decisión del dueño, del 2026-09-18, textual:** *"eliminemos absolutamente todo
lo que tiene que ver con instalar, ya sea como feature, como procedimiento, deuda y
demás. Eso se va a hacer uno a uno de manera manual."*

Va a instalar la PWA en cada teléfono a mano, con el aparato en la mano, y va a
entregarlo ya instalado. Una guía dentro de la app no le sirve a nadie.

**Y por eso el botón de activar se queda, que es la parte que no es obvia:** el
permiso de push no se puede conceder desde fuera de la app. iOS y Android exigen que
el diálogo salga de un toque dentro de la aplicación. Instalar la PWA a mano pone el
icono en la pantalla de inicio y **no** activa los avisos. El dueño va a tocar ese
botón él mismo durante el montaje de cada teléfono. Borrarlo mataría NOTIF-01 y con
él el Core Value del producto.

Output: cuatro archivos borrados, cuatro archivos de código editados, cinco de
planning corregidos. Cero migraciones.
</objective>

<contexto_medido>

## Lo que se barrió contra el repo antes de escribir esto

Casi todo lo que se borra es una **isla muerta**. `app/(cleaner)/instalar/` contiene
exactamente dos archivos (`_actions.ts` y `_actions.test.ts`) y **ninguna
`page.tsx`**. La ruta no existe: los cuatro enlaces del banner apuntan a un 404, y
el ítem del menú del admin copia al portapapeles una URL que no lleva a ninguna
parte.

| Archivo | Consumidores, medidos por grep |
|---|---|
| `app/(cleaner)/instalar/_actions.ts` (22 KB) | solo `PruebaDeAviso.tsx` |
| `app/(cleaner)/instalar/_actions.test.ts` (22 KB) | ninguno, es el test de lo anterior |
| `app/(cleaner)/_components/PruebaDeAviso.tsx` (15 KB) | **cero** |

Las 14 apariciones de la ruta, contadas hoy:

```
app/(cleaner)/instalar/_actions.test.ts        1
app/(cleaner)/instalar/_actions.ts             3
app/(cleaner)/_components/BannerAvisos.tsx     4
app/(cleaner)/_components/PruebaDeAviso.tsx    3
app/(admin)/aseadores/_components/MenuAseador.tsx  2
lib/push/origen.ts                             1   ← comentario, el archivo se queda
```

## TRES CORRECCIONES AL INVENTARIO CON EL QUE SE PIDIÓ ESTE QUICK

Las tres salieron de medir, y las tres reducen el alcance. Van escritas porque un
ejecutor que siga el inventario original rompería cosas que funcionan.

### 1. `e2e/push-instalacion.spec.ts` NO SE TOCA. Ni un caso.

El nombre del archivo engaña. Sus seis casos son E1 (la suscripción llega a la
base), E2 y E3 (entrega real de push al service worker), E4 (saltado, sin comando en
el protocolo de DevTools), E5 (el manifest) y E6 (el service worker sin caché).
**Ninguno prueba el asistente de instalación, ni la prueba de aviso, ni la ruta
`/instalar`.** No hay cobertura que perder ahí, así que no hay nada que borrar ni
nada que declarar.

Los dos casos señalados como inestables en `deferred-items.md` de la Fase 8 (`:215`
y `:248`) son E2 y E3, que son de entrega de push. Siguen en pie y se corren para
demostrar que este quick no los movió.

### 2. `e2e/fixtures.ts` NO SE TOCA.

Lo único suyo que roza esto es `emularInstalada()`, que emula
`display-mode: standalone` por el protocolo de DevTools. Eso es **detección** de
instalación, que se conserva entera: en iOS el push no funciona si la PWA no está en
la pantalla de inicio, así que el sistema tiene que seguir sabiendo si lo está.

Su comentario de la línea 124 (*"un test que quiera medir el estado S1 (sin
instalar) necesita exactamente este mismo contexto sin esa emulación"*) sigue siendo
cierto después de este quick: el estado `sin_instalar` sobrevive.

### 3. PWA-02 no se borra: se retira como requisito de PRODUCTO, y la capacidad se queda.

*"La PWA es instalable en la pantalla de inicio en Android e iOS"* **sigue siendo
verdad y sigue medido**: `app/manifest.ts` declara `standalone` y los dos iconos, y
el caso E5 lo afirma contra `/manifest.webmanifest` servido de verdad. Tacharlo a
secas dejaría el requisito mintiendo en el otro sentido.

Lo que desaparece es la superficie de producto que enseñaba a instalar. Ver Task 3
para la redacción exacta.

## LA CONSECUENCIA QUE HAY QUE MIRAR DE FRENTE, PORQUE NO ES OBVIA

Borrar `instalar/_actions.ts` se lleva por delante las tres únicas llamadas
TypeScript a `registrar_prueba_de_aviso()`, `confirmar_prueba_por_toque()` y
`confirmar_prueba_a_mano()`. Medido en la migración 16: **esas funciones son lo
único en todo el sistema que escribe `verificacion_grado`**, y
`estado_avisos_aseadores()` deriva `verificado_por_toque` de esa columna.

Resultado: en la columna `AVISOS` de `/aseadores`, el estado **`Activos` queda
inalcanzable para siempre**. Un aseador con teléfono registrado se quedará en
`Sin probar`, permanentemente.

**Y aun así se borra, sin tocar el admin.** Las razones, en orden:

1. **La señal que le importa al dueño sigue viva y sigue siendo exacta.** Lo que
   necesita saber es *quién se quedó mudo*, y eso es `Sin avisos`
   (`suscripciones_vivas = 0`), que no depende de la prueba para nada. Esa es la red
   de seguridad que reemplaza al banner que se está podando, y no se toca.
2. **`Sin probar` no miente.** Su significado literal es *"hay a dónde enviar, pero
   nadie comprobó que llegue"*, y a partir de hoy eso es exactamente cierto para
   todos. No hay que reescribir la etiqueta.
3. **Colapsar los tres estados a dos sería una fase, no un quick.** Tocaría
   `lib/domain/avisos.ts`, `lib/data/avisos.ts`, `EstadoAvisosAseador.tsx`,
   `TiraAvisosAdmin.tsx`, los tests de los cuatro y probablemente la RPC de la
   migración 16.
4. **La capacidad queda dormida en la base, no destruida.** La migración 16 no se
   toca: las tres funciones, el token de un solo uso, el índice único y el CHECK
   siguen ahí. Si mañana el dueño quiere mandarse un aviso de prueba a sí mismo
   durante el montaje, se recupera escribiendo una superficie nueva, sin migración.

Lo que sí hay que hacer es **escribirlo donde se lee**, o dentro de tres meses
alguien ve las ocho filas en `Sin probar` y lo lee como un defecto. Eso es la Task 1.

</contexto_medido>

<decision_de_diseno_del_banner>

## Los seis estados de `BannerAvisos.tsx`, uno por uno

El objetivo del dueño es que el banner se reduzca a casi nada: un renglón y, cuando
haya algo que tocar, un botón. Sin guía, sin pasos, sin ayuda diferenciada.

| Estado | Hoy | Después | Por qué |
|---|---|---|---|
| `activo` | no renderiza banner | **idéntico** | El llamador corta antes, en `if (!estado.banner)`, y `activo` es la única rama de la unión sin banner. El `throw` de `contenidoDelBanner` se conserva como guarda de desalineación de tipos. Es lo que el dueño confirmó con *"cuando se active lo quitamos"*, y ya funciona así. |
| `sin_instalar` | cuerpo + botón `Ver cómo se instala` → `/instalar` | **cuerpo nuevo, SIN acción** | El estado es real (llega por link de WhatsApp, en una pestaña del navegador) y silenciarlo deja al aseador sin saber por qué no recibe nada. Pero no hay botón que sirva: `sin_instalar` se deriva precisamente de que `Notification` no existe en esa pestaña, así que pedir el permiso desde ahí es imposible. Queda un renglón que nombra la salida real, que es el administrador. |
| `nunca_pedido` | cuerpo + `BotonActivarAvisos` + `Ahora no` | **idéntico** | Es el caso que el dueño va a tocar con el teléfono en la mano. `Ahora no` se conserva: existe para dar salida a quien iba a denegar, y en iPhone una denegación es irreversible sin reinstalar. No tiene nada que ver con instalar y protege el canal único. |
| `negado` | **dos ramas** (iPhone / Android), las dos con enlace a `/instalar` | **UNA rama, sin plataforma, SIN acción** | Ver abajo. |
| `roto` | cuerpo + `BotonActivarAvisos` en modo reconectar | **idéntico** | Es una falla de suscripción con el permiso ya concedido. Nada que ver con instalar. |
| `no_soportado` | 3 sub-casos; el embebido con enlace a `/instalar?navegador=1` | **3 sub-casos, ninguno con acción**; al embebido se le corta la frase final | Ver abajo. |

### `negado`: por qué colapsa a una sola rama

Las dos ramas de hoy existen **únicamente** para mandar al asistente. Se funden en
un renglón sin plataforma y sin botón, por tres razones:

1. Mantener dos cuerpos distintos **es** la "ayuda diferenciada" que el dueño está
   podando. No se puede quitar el asistente y conservar su ramificación.
2. La rama de Android manda a los ajustes del sistema. Si esa ruta funcionara de
   verdad en campo, el dueño no tendría que reinstalar nada. Pero el canal real de
   recuperación es el mismo en los dos sistemas: él, con el teléfono en la mano.
3. En iPhone la denegación es **irreversible sin reinstalar**, y quien reinstala es
   el dueño. Un texto que le explique al aseador cómo borrar el icono y volver a
   instalar es exactamente el procedimiento que este quick elimina.

**Sin botón, y eso ya era la regla del archivo:** su cabecera dice, literal, que este
estado *no vuelve a pedir el permiso* (con el permiso bloqueado esa llamada devuelve
`denied` de inmediato, sin diálogo, y un botón que no produce nada visible se lee
como app rota) y que *no dice "haz clic aquí para activar"*. Antes había un botón
porque navegaba a otra parte. Ya no hay a dónde navegar, así que no hay botón.

### `no_soportado` embebido: el cuerpo se queda, la promesa se corta

Es el sub-caso más probable de los tres, porque el link de onboarding se manda por
WhatsApp y la app se abre dentro de otra aplicación más veces que en ningún otro
sitio. Su instrucción cabe en un renglón, se resuelve sin salir de donde está, y
evita una llamada telefónica. Se conserva.

Lo que se corta es el final de la frase: hoy termina en *"para poder instalarla"*, y
ya no se instala desde ahí.

### Lo que le pasa a la unión de acciones

Al quitar los cuatro enlaces, la forma `{ tipo: 'enlace' }` **se queda sin un solo
caso que la produzca**. Se borra de la unión, y la unión con ella: un discriminante
sobre un solo miembro miente diciendo que existe otra forma. Es la misma regla con
la que `07-06` borró sus tres `.d.ts` al implementarlos, escrita en STATE.md: el
andamio que sobrevive a su motivo queda invisible y muerto.

Arrastra tres cosas más, y las tres hay que quitarlas o queda código huérfano:

- el `import Link from 'next/link'`, que se queda sin uso;
- el bloque JSX `{accion?.tipo === 'enlace' && ...}`;
- **el campo `apoyo` del tipo `Contenido`**, cuyo único productor era
  `APOYO_NEGADO_IPHONE`. Ojo: `APOYO_RECONEXION_FALLIDA` NO va por ese campo, va por
  su propio bloque debajo del botón, y ese se conserva.

**El título de cada estado NO se toca.** Vive en `PRESENTACION_AVISOS` de
`lib/domain/avisos.ts` y cambiarlo movería el dominio y sus tests sin necesidad. Solo
cambian cuerpos y acciones.

</decision_de_diseno_del_banner>

<copy_nuevo>

## El copy nuevo, literal. No se reescribe al ejecutar.

```
CUERPO_SIN_INSTALAR =
  'Desde el navegador no te llegan los avisos de aseo. Avísale a tu administrador
   para que te la instale en el teléfono.'

CUERPO_NEGADO =
  'Los avisos están bloqueados en este teléfono y desde aquí no se pueden
   desbloquear. Avísale a tu administrador para que lo deje listo otra vez.'

cuerpoNavegadorEmbebido(navegador) =
  `Estás viendo VivaGuest dentro de otra aplicación. Toca el menú de arriba y
   elige "Abrir en ${navegador}".`
```

Sin cambio, y se copian aquí para que el ejecutor sepa que NO son descuidos:
`CUERPO_NUNCA_PEDIDO`, `CUERPO_ROTO`, `CUERPO_ROTO_TRAS_FALLO`,
`APOYO_RECONEXION_FALLIDA`, `CUERPO_NO_SOPORTADO_IOS_VIEJO`,
`CUERPO_NO_SOPORTADO_GENERICO`.

Se borran: `CUERPO_NEGADO_IPHONE`, `APOYO_NEGADO_IPHONE`, `CUERPO_NEGADO_ANDROID`.

</copy_nuevo>

<tasks>

<task type="auto" id="1">
  <name>Task 1: La isla muerta, y lo que su borrado le cuesta a la columna del admin</name>

  <files>
app/(cleaner)/instalar/_actions.ts          (BORRAR)
app/(cleaner)/instalar/_actions.test.ts     (BORRAR)
app/(cleaner)/instalar/                     (BORRAR el directorio, queda vacío)
app/(cleaner)/_components/PruebaDeAviso.tsx (BORRAR)
lib/domain/avisos.ts                        (EDITAR: una nota de caducidad)
lib/push/origen.ts                          (EDITAR: un ejemplo muerto en un comentario)
  </files>

  <read_first>
- `app/(cleaner)/instalar/_actions.ts` — entero antes de borrarlo. Lo que se pierde
  hay que poder declararlo con nombre, no con un "se borró una carpeta".
- `app/(cleaner)/instalar/_actions.test.ts` — sus siete `describe` son la cobertura
  que se pierde. Hay que nombrarlos uno a uno en el commit.
- `lib/domain/avisos.ts` líneas 265 a 302 — `estadoDeAvisosDeAseador` y
  `derivarClaveDeAseador`, que es donde va la nota.
- `lib/push/origen.ts` líneas 10 a 35 — el comentario con el ejemplo muerto.
- `supabase/migrations/20260911120000_16_push_avisos.sql` líneas 330 a 470 — las tres
  funciones que se quedan sin llamador. **Solo leer. Este quick no toca la base.**
  </read_first>

  <action>
MIDE EL BASELINE ANTES DE BORRAR NADA. Corre `npm run test:unit` y anota el total de
casos verdes. Es el único modo de demostrar después que la suite bajó exactamente en
los casos del archivo borrado y en ninguno más.

Borra `app/(cleaner)/instalar/` entero (los dos archivos y el directorio, que queda
vacío) y `app/(cleaner)/_components/PruebaDeAviso.tsx`. Ninguno de los tres tiene
consumidor fuera de sí mismo: `PruebaDeAviso.tsx` es el único que importa
`instalar/_actions`, y a `PruebaDeAviso` no lo importa nadie. Está medido por grep y
`tsc` lo va a confirmar.

En `lib/domain/avisos.ts`, dentro de `derivarClaveDeAseador`, encima de la línea que
devuelve `verificado_por_toque ? 'activos' : 'sin_probar'`, escribe una nota con
fecha explicando que la rama `activos` quedó inalcanzable el 2026-09-18 y por qué:
las tres funciones de la migración 16 que escriben `verificacion_grado` siguen
existiendo en la base pero ya no tienen llamador en TypeScript, porque la superficie
que las llamaba se eliminó con el asistente. La nota tiene que decir las cuatro
cosas, o no sirve: (a) que `Sin probar` es hoy el techo para cualquier aseador con
teléfono registrado; (b) que eso **no es un defecto**, porque su significado literal
sigue siendo cierto; (c) que la señal que el producto necesita de verdad es
`sin_avisos`, que no depende de la prueba y sigue exacta; (d) que la capacidad está
dormida en la base, no destruida, y se recupera escribiendo superficie nueva sin
tocar ninguna migración. Sin esa nota, las ocho filas en `Sin probar` se leen como un
bug dentro de tres meses.

En `lib/push/origen.ts`, en el comentario de cabecera, quita el ejemplo de la ruta
del aviso de prueba de la lista de rutas relativas. **El archivo se queda entero**:
sigue resolviendo el destino de los avisos de aseo, y su decisión de seguridad (el
origen sale de la configuración del servidor y nunca del header `Host`) no cambia. Es
una edición de un ejemplo, no de la lógica.

NO toques `supabase/migrations/`. NO toques `lib/data/avisos.ts`,
`EstadoAvisosAseador.tsx` ni `TiraAvisosAdmin.tsx`: la decisión de no colapsar los
tres estados del admin está tomada y razonada arriba.
  </action>

  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>npm run lint</automated>
    <automated>npm run test:unit</automated>
    <automated>test ! -d "app/(cleaner)/instalar" &amp;&amp; test ! -f "app/(cleaner)/_components/PruebaDeAviso.tsx" &amp;&amp; echo BORRADOS</automated>
    <automated>git diff --stat -- supabase/ | wc -l | grep -qx '0' &amp;&amp; echo "MIGRACIONES INTACTAS"</automated>
  </verify>

  <acceptance_criteria>
- `npx tsc --noEmit` pasa limpio. Es la prueba de que los tres archivos borrados no
  tenían ningún consumidor vivo: un import huérfano habría salido aquí.
- `npm run lint` pasa sin errores nuevos.
- `npm run test:unit` pasa en verde, y el total bajó **exactamente** en los casos de
  `app/(cleaner)/instalar/_actions.test.ts` y en ningún otro archivo. El número
  concreto va escrito en el commit, contra el baseline medido al empezar.
- `app/(cleaner)/instalar/` no existe como directorio.
- `app/(cleaner)/_components/PruebaDeAviso.tsx` no existe.
- `git diff --stat -- supabase/` sale vacío. Ni un byte de la base.
- `lib/domain/avisos.ts` tiene la nota con fecha 2026-09-18 dentro de
  `derivarClaveDeAseador`, y dice las cuatro cosas.
- `grep -c "/instalar" lib/push/origen.ts` da 0, y el resto del archivo está intacto.
- El mensaje del commit declara por escrito la cobertura perdida, nombrando los siete
  `describe` del test borrado: el guard antes de tocar nada, el registro del intento
  antes del envío, el payload del aviso de prueba, la respuesta del push service,
  `confirmarPruebaPorToque`, `confirmarPruebaAMano` y las propiedades de las tres.
  Una cobertura que se borra sin nombrarla es una cobertura que nadie sabe que se
  perdió.
  </acceptance_criteria>
</task>

<task type="auto" id="2">
  <name>Task 2: El banner reducido, la unión colapsada y el último enlace del admin</name>

  <files>
app/(cleaner)/_components/BannerAvisos.tsx
app/(admin)/aseadores/_components/MenuAseador.tsx
  </files>

  <read_first>
- `app/(cleaner)/_components/BannerAvisos.tsx` — **entero, las 414 líneas, antes de
  tocar una sola**. Su cabecera fija reglas de producto que este quick NO deroga y
  que hay que conservar: el estado de permiso bloqueado no se pinta con el token de
  las acciones destructivas, no vuelve a pedir el permiso, y mientras el estado no se
  sepa no se renderiza nada.
- `app/(cleaner)/_components/BotonActivarAvisos.tsx` — entero. **No se modifica.** Se
  lee para no romper su contrato de props al editar el sitio de uso.
- `app/(cleaner)/layout.tsx` líneas 67 a 83 — el sitio de montaje. **No se modifica.**
- `lib/domain/avisos.ts` líneas 30 a 141 — la unión de estados y
  `PRESENTACION_AVISOS`, que son de donde salen icono, título y color. **No se
  modifica.**
- `app/(admin)/aseadores/_components/MenuAseador.tsx` — entero, sobre todo el
  comentario del separador en las líneas 132 a 138.
- Las secciones `<decision_de_diseno_del_banner>` y `<copy_nuevo>` de este plan.
  </read_first>

  <action>
En `BannerAvisos.tsx`, aplica los seis estados de la tabla de
`<decision_de_diseno_del_banner>` y el copy literal de `<copy_nuevo>`.

Concretamente:

Borra las tres constantes de copy del estado de permiso bloqueado (las dos de iPhone
y la de Android) y sustitúyelas por una sola, sin plataforma. Reescribe el cuerpo de
`sin_instalar`. Corta la frase final de `cuerpoNavegadorEmbebido`, que prometía una
instalación que ya no ocurre ahí.

En `contenidoDelBanner`, quita la acción de los cuatro casos que la tenían como
enlace: `sin_instalar`, las dos ramas de permiso bloqueado (que además se funden en
un solo retorno, sin mirar la plataforma) y el sub-caso de navegador embebido.
**`nunca_pedido` y `roto` conservan su acción intacta**, con las mismas etiquetas, el
mismo `reconectar` y el mismo `modo`. El `switch` sigue sin rama por defecto: es lo
que hace que `tsc` rompa aquí si la unión de estados crece, y no se debilita.

Colapsa el tipo `Accion` a la única forma que queda, la que dispara el botón, y
quítale el discriminante `tipo`: con un solo miembro, ese campo afirma que existe
otra forma y ya no existe. Ajusta el sitio de uso del JSX para que condicione por la
presencia de la acción en vez de por el discriminante. Quita el `import Link`, que
se queda sin uso, y el bloque JSX que renderizaba el botón-enlace.

Quita el campo `apoyo` del tipo `Contenido` y su bloque JSX: su único productor era
el texto de apoyo del caso de iPhone, que se va. **No confundas ese campo con el
apoyo de reconexión fallida**, que vive en su propio bloque debajo del botón, se
conserva tal cual, y sigue siendo lo que evita un toast duplicando el estado.

El parámetro `plataforma` de `contenidoDelBanner` **se conserva**: deja de usarlo el
caso de permiso bloqueado, pero lo sigue necesitando `no_soportado` para elegir entre
Chrome y Safari y para el sub-caso de iOS antiguo. `plataformaVisible()` y
`esNavegadorEmbebido()` de `lib/push/plataforma.ts` no se tocan.

Actualiza la cabecera del archivo. Hoy describe una ayuda diferenciada por plataforma
que deja de existir, y un archivo cuya cabecera describe otro archivo es peor que uno
sin cabecera. Deja escrito, con fecha, que el estado de permiso bloqueado ya no
diferencia por sistema operativo y por qué: sus dos ramas existían solo para enlazar
al asistente, no hay ningún clic dentro de la app que desbloquee un permiso denegado,
y la salida real es el administrador. Conserva las tres reglas de producto que la
cabecera ya fijaba y que este quick no deroga.

En `MenuAseador.tsx`, borra el ítem que copia el link de instalación: la función que
lo copia, el `DropdownMenuItem` que la dispara y el párrafo de la cabecera que lo
explica. Arrastra dos cosas más, y las dos hay que quitarlas:

  · **El `DropdownMenuSeparator`.** Con el ítem fuera, la rama de aseador activo
    queda con una sola opción y el separador vuelve a ser lo que el plan 02-07 dejó
    advertido por escrito: un separador como primer hijo pinta una raya suelta contra
    el borde del popup. Su propia condición de existencia era *cuando exista algo de
    lo que separarlo*, y deja de existir.
  · **El import del icono de copiar**, que se queda huérfano. `npm run lint` lo
    atrapa si se olvida.

Lo demás del menú no se toca: la asimetría deliberada entre desactivar (con diálogo,
porque revoca acceso) y reactivar (directo, porque no revoca nada) sigue igual, y el
disparador de tres puntos se queda aunque cada rama tenga ahora una sola opción,
porque la columna ya está dimensionada alrededor de él.
  </action>

  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>npm run lint</automated>
    <automated>npm run test:unit</automated>
    <automated>npm run ci:arch</automated>
    <automated>grep -rn "/instalar" app lib e2e components hooks scripts --include="*.ts" --include="*.tsx" --include="*.sh" | wc -l | grep -qx '0' &amp;&amp; echo "RUTA EN CERO"</automated>
    <automated>grep -rl "requestPermission" "app/(cleaner)" --include="*.tsx" | grep -qx "app/(cleaner)/_components/BotonActivarAvisos.tsx" &amp;&amp; echo "UN SOLO ARCHIVO EN EL ARBOL DEL ASEADOR"</automated>
    <automated>grep -rl "requestPermission" "app/(cleaner)" --include="*.tsx" | wc -l | grep -qx '1' &amp;&amp; echo "Y NINGUN OTRO"</automated>
    <automated>grep -n "BotonActivarAvisos" "app/(cleaner)/_components/BannerAvisos.tsx"</automated>
    <automated>git diff --stat -- app/manifest.ts lib/push/plataforma.ts "app/(cleaner)/_components/BotonActivarAvisos.tsx" "app/(cleaner)/layout.tsx" | wc -l | grep -qx '0' &amp;&amp; echo "LO ESTRUCTURAL INTACTO"</automated>
    <automated>npm run build</automated>
  </verify>

  <acceptance_criteria>
- `grep -rn "/instalar" app lib e2e components hooks scripts` da **cero**. Hoy da 14.
  (El grep se acota a esos seis directorios a propósito: `supabase/` conserva la ruta
  en los comentarios de la migración 16, que no se toca, y `.planning/` documenta este
  mismo borrado.)
- En todo `app/(cleaner)/`, la petición de permiso vive en **un solo archivo**,
  `BotonActivarAvisos.tsx`, igual que hoy. El banner sigue sin contenerla nunca, que
  es una regla que su propia cabecera ya fijaba y que este quick no deroga.
  (`TiraAvisosAdmin.tsx` tiene su propia llamada para que el admin active sus avisos
  desde `/operacion`. Es de otro árbol, es correcta y no se cuenta aquí.)
- `git diff` de `BotonActivarAvisos.tsx` sale **vacío**. El archivo no se tocó.
- `git diff` de `app/manifest.ts`, `lib/push/plataforma.ts` y
  `app/(cleaner)/layout.tsx` sale **vacío**. La detección de instalación no se tocó.
- `BannerAvisos.tsx` sigue importando y renderizando `BotonActivarAvisos`, y lo hace
  en los dos estados que deben conservarlo: `nunca_pedido` y `roto`.
- `BannerAvisos.tsx` no contiene `import Link`, ni la forma `enlace` de la unión de
  acciones, ni el campo `apoyo` del tipo `Contenido`.
- El bloque de apoyo de reconexión fallida **sigue estando**, debajo del botón, con su
  condición de modo intacta.
- El `switch` de `contenidoDelBanner` sigue cubriendo los seis casos y sigue **sin
  rama por defecto**.
- El caso `activo` sigue lanzando en vez de devolver una caja vacía, y el llamador
  sigue cortando antes en la comprobación de banner.
- El estado de permiso bloqueado tiene **un solo retorno**, sin mirar la plataforma,
  sin acción y sin texto de apoyo.
- `plataformaVisible()` y `esNavegadorEmbebido()` siguen importándose y usándose en
  `no_soportado`, y `lib/push/plataforma.ts` sale sin diff.
- `MenuAseador.tsx` no tiene el ítem de copiar el link, ni el separador, ni el import
  del icono de copiar. La asimetría entre desactivar y reactivar sigue intacta.
- `npm run ci:arch` pasa: las tres compuertas (rol de servicio, anchos con nombre de
  talla, escala tipográfica móvil) siguen en verde sobre el banner editado.
- `npm run build` verde. Es la única capa que ve los defectos de compilación del
  árbol de cliente, y este quick le quita nodos a un componente de cliente.
  </acceptance_criteria>
</task>

<task type="auto" id="3">
  <name>Task 3: Lo que .planning seguía prometiendo, y las dos suites que lo miran de verdad</name>

  <files>
.planning/REQUIREMENTS.md
.planning/ROADMAP.md
.planning/BACKLOG.md
.planning/RETOMAR.md
.planning/STATE.md
.planning/phases/05-notificaciones-push-e-instalaci-n-de-la-pwa/05-12-PLAN.md  (BORRAR)
  </files>

  <read_first>
- `.planning/REQUIREMENTS.md` líneas 65 a 76 y 216 a 227 — la lista de requisitos de
  la PWA y su tabla de estado. Fíjate en cómo quedaron marcados PWA-08, PWA-09 y
  PWA-10 al diferirse: ese es el patrón del repo para un requisito que cambia de
  estado, y se copia.
- `.planning/ROADMAP.md` líneas 173 a 212 y la línea 411 — el estado de la Fase 5, su
  lista de planes y la tabla del milestone.
- `.planning/BACKLOG.md` línea 85 — la fila del asistente.
- `.planning/RETOMAR.md` líneas 240 a 252.
- `.planning/STATE.md` línea 569.
  </read_first>

  <action>
Corrige los cinco sitios de `.planning` que siguen prometiendo el asistente, y borra
el plan que nunca se ejecutó.

**REQUIREMENTS.md — PWA-02.** No se borra de la lista: se retira como requisito de
producto, tachado, con la misma forma con la que se marcaron los tres diferidos a v2.
Texto exacto:

> ~~**PWA-02**: La PWA es instalable en la pantalla de inicio en Android e iOS~~ →
> **RETIRADO COMO REQUISITO DE PRODUCTO el 2026-09-18** (quick `260918-h47`). La
> CAPACIDAD TÉCNICA no se toca y sigue medida: `app/manifest.ts` declara `standalone`
> y los dos iconos, y el caso E5 de `e2e/push-instalacion.spec.ts` lo afirma contra
> `/manifest.webmanifest` servido de verdad. Lo que desaparece es toda superficie de
> producto que enseñe a instalar. El dueño instala la PWA a mano, teléfono por
> teléfono, y entrega el aparato ya instalado.

En la tabla de estado: `| PWA-02 | — | Withdrawn (2026-09-18) |`.

**REQUIREMENTS.md — PWA-03.** Alcance reducido, no retirado. Texto exacto:

> **PWA-03**: Si el aseador no tiene push activo, la PWA muestra un banner
> persistente. **ALCANCE REDUCIDO el 2026-09-18** (quick `260918-h47`): el banner
> sigue siendo persistente y sigue distinguiendo "nunca lo pedí" de "ya lo negué" por
> icono, título y cuerpo, pero **la ayuda diferenciada por plataforma en "ya lo
> negué" desaparece** y ese estado pasa a no tener ninguna acción. Razón: sus dos
> ramas, iPhone y Android, existían únicamente para enlazar al asistente de
> instalación, que se eliminó. Desde dentro de la app no hay ningún clic que
> desbloquee un permiso ya denegado, así que la única salida real es el
> administrador, y eso es lo que el banner dice ahora en un solo renglón.

En la tabla de estado: `| PWA-03 | Fase 5 | Reduced (2026-09-18) |`.

**ROADMAP.md.** Tres sitios. En el bloque de estado de la Fase 5, el asistente deja
de ser un plan pendiente y pasa a eliminado, y **hay que quitar la frase de que los
cuatro enlaces del banner caen en 404**: ya no hay enlaces. En la lista de planes, el
ítem del asistente se tacha como eliminado por decisión del dueño con la fecha. En la
tabla del milestone, la casilla de la Fase 5 deja de contar el asistente como
diferido. El otro plan pendiente de esa fase (la validación en dispositivo) **no se
toca**: no tiene nada que ver con este quick.

Cuidado con el criterio de éxito 4 de la Fase 5, que dice *"ve un banner persistente
con instrucciones distintas según si nunca dio el permiso o si ya lo negó"*. Sigue
cumpliéndose: los dos estados siguen teniendo cuerpos distintos. Lo que cambió es que
"ya lo negó" ya no ramifica por sistema operativo. Anótalo ahí mismo, en una línea
con fecha, en vez de dejar el criterio sin contexto.

**BACKLOG.md.** La fila del asistente sale del backlog. No se difiere a v2 ni se
mueve a otra fase: **se elimina como idea**, con la razón y la fecha. Dejarla ahí
sería exactamente lo que el dueño pidió que no volviera a aparecer.

**RETOMAR.md.** Dos correcciones, y la segunda es un dato falso que lleva ahí desde
antes de este quick: el archivo afirma que *"la ruta existe y no da 404"*, y es
mentira. Nunca existió una página en ese directorio; el propio ROADMAP dice lo
contrario en su línea 175. Corrige la afirmación y reescribe el párrafo para que diga
lo que pasa desde hoy: el asistente está eliminado del código, no descartado a la
espera, y la instalación es manual y presencial.

**STATE.md.** En la línea de diferidos por decisión del desarrollador, el asistente
deja de ser un diferido y pasa a eliminado, con la fecha y el identificador del
quick. Añade la fila de este quick a la tabla de Quick Tasks Completed, con el hash
del commit.

**Y añade a los Blockers/Concerns de STATE.md la consecuencia medida en la Task 1**,
que es lo que no se puede perder: la columna `AVISOS` de `/aseadores` ya no puede
llegar a `Activos`, porque las tres funciones de la migración 16 que escriben el
grado de verificación se quedaron sin llamador. Escribe que **no es un defecto**, que
`Sin probar` sigue siendo literalmente cierto, que la señal que importa (`Sin avisos`)
no depende de eso y sigue exacta, y que la capacidad sigue dormida en la base y se
recupera sin migración. Si esto no queda escrito donde se lee, alguien lo va a
"arreglar" dentro de tres meses.

**Borra** `.planning/phases/05-notificaciones-push-e-instalaci-n-de-la-pwa/05-12-PLAN.md`.
Es el plan del asistente, nunca ejecutado (no tiene SUMMARY). Los SUMMARY de la Fase 5
que lo mencionan **no se tocan**: son bitácora histórica y decir hoy lo que se creía
entonces es su función.

Corre las dos suites que miran esto de verdad. El E2E va con el puerto fijado, o se
reusa el servidor de desarrollo de otro proyecto y salen catorce rojos falsos con la
pantalla de login en 404. Y con un solo worker, porque dos de sus casos están
declarados inestables en paralelo en `deferred-items.md` de la Fase 8 y este quick no
es el sitio para arreglar eso.
  </action>

  <verify>
    <automated>npm run test:unit</automated>
    <automated>npm run build</automated>
    <automated>PLAYWRIGHT_PORT=3210 npx playwright test e2e/push-instalacion.spec.ts --workers=1</automated>
    <automated>test ! -f ".planning/phases/05-notificaciones-push-e-instalaci-n-de-la-pwa/05-12-PLAN.md" &amp;&amp; echo "PLAN BORRADO"</automated>
    <automated>git diff --stat -- e2e/ | wc -l | grep -qx '0' &amp;&amp; echo "E2E SIN TOCAR"</automated>
  </verify>

  <acceptance_criteria>
- `PLAYWRIGHT_PORT=3210 npx playwright test e2e/push-instalacion.spec.ts --workers=1`
  da **5 pasando y 1 saltado**, los mismos seis casos de antes. E4 sigue saltado por
  la limitación del protocolo de DevTools, que este quick no cambia.
- `git diff --stat -- e2e/` sale **vacío**. Ni `push-instalacion.spec.ts` ni
  `fixtures.ts` se tocaron: está medido que ningún caso de ese archivo prueba lo que
  se borró, así que no hay cobertura perdida que declarar ahí.
- **Ninguna aserción de seguridad se debilitó** para que la suite pase. Si algo sale
  rojo, se arregla el código o se declara el rojo con su causa; no se ablanda el test.
- `npm run test:unit` y `npm run build` en verde.
- `.planning/REQUIREMENTS.md` tiene PWA-02 tachado con la redacción exacta de arriba y
  `Withdrawn (2026-09-18)` en la tabla, y PWA-03 con su nota de alcance reducido y
  `Reduced (2026-09-18)`.
- Ningún archivo vivo de `.planning` (REQUIREMENTS, ROADMAP, BACKLOG, RETOMAR, STATE)
  describe el asistente como pendiente, diferido, bloqueado o por hacer.
- `.planning/RETOMAR.md` ya no afirma que la ruta existe y no da 404.
- `.planning/ROADMAP.md` ya no afirma que los cuatro enlaces del banner caen en 404.
- `.planning/STATE.md` tiene, en Blockers/Concerns, la consecuencia sobre la columna
  `AVISOS`, con sus cuatro puntos y la fecha.
- `.planning/STATE.md` tiene la fila de este quick en Quick Tasks Completed.
- `05-12-PLAN.md` no existe. Los SUMMARY de la Fase 5 salen sin diff.
  </acceptance_criteria>
</task>

</tasks>

<verificacion_final>

Con el árbol quieto, después de las tres tareas:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run ci:arch
npm run build
PLAYWRIGHT_PORT=3210 npx playwright test e2e/push-instalacion.spec.ts --workers=1

# Las tres prohibiciones del quick, en una línea cada una
grep -rn "/instalar" app lib e2e components hooks scripts --include="*.ts" --include="*.tsx" --include="*.sh" | wc -l   # → 0
grep -rl "requestPermission" "app/(cleaner)" --include="*.tsx"                                                          # → solo BotonActivarAvisos.tsx
git diff --stat -- supabase/ app/manifest.ts lib/push/plataforma.ts "app/(cleaner)/_components/BotonActivarAvisos.tsx" e2e/   # → vacío
```

</verificacion_final>

<lo_que_este_quick_no_hace>

Escrito para que no se confunda con un olvido:

- **No toca la base de datos.** La migración 16 conserva las tres funciones de la
  prueba de aviso, el token de un solo uso, su índice único y el CHECK que ata el
  grado a la fecha. Quedan sin llamador, a propósito y con la razón escrita. No hay
  compuerta de migración en este quick.
- **No colapsa los tres estados de la columna `AVISOS` del admin a dos.** Eso tocaría
  cuatro archivos de producto, sus tests y probablemente la RPC. Es una fase.
- **No toca `TiraAvisosAdmin.tsx` ni `EstadoAvisosAseador.tsx`.** Son la red de
  seguridad que reemplaza al banner que se está podando: es lo que le dice al dueño
  qué aseadora no tiene avisos activos.
- **No toca los SUMMARY de la Fase 5.** Son bitácora histórica.
- **No arregla la inestabilidad en paralelo de los dos casos de entrega de push.**
  Está declarada en `deferred-items.md` de la Fase 8 y sigue ahí; por eso el E2E de
  este quick corre con un solo worker.
- **No arregla el desajuste de RETOMAR.md sobre el plan de validación en dispositivo
  de la Fase 5.** Solo se corrige lo que este quick invalida.

</lo_que_este_quick_no_hace>

<output>
Al terminar, escribe
`.planning/quick/260918-h47-fuera-el-asistente-de-instalacion/260918-h47-SUMMARY.md`
con: el conteo de las cuatro suites antes y después, los siete `describe` de
cobertura perdida nombrados uno a uno, el estado final de PWA-02 y PWA-03, y la
consecuencia sobre la columna `AVISOS` con su ruta de recuperación.
</output>
