# Diferidos de la Fase 3

Hallazgos fuera del alcance del plan que los encontró. No se arreglan aquí (regla de frontera de
alcance del ejecutor): son preexistentes y no los causa el cambio en curso.

## Del plan 03-09

### `npm run lint` en rojo por tres errores preexistentes

- `e2e/fixtures.ts:104,110,116` — `react-hooks/rules-of-hooks`: el `use` de Playwright (fixtures)
  lo confunde con el hook `use` de React. Son funciones de fixture, no componentes. Se cierra con
  una excepción de ESLint acotada a `e2e/`, no tocando el código.
- `lib/domain/aseador.schema.test.ts:40` — aviso de `_phone` asignado y no usado.

Ninguno lo introduce el plan 03-09 y ninguno afecta a `test:unit`, `test:integration`, `db:test`,
`tsc --noEmit` ni `ci:arch`, que son los que la fase verifica.

### El dead man's switch externo (T-03-85)

`estadoDeSincronizacion` cierra el caso "no corre nada dentro de la base" porque se computa AL
LEER, pero si el admin no abre el panel nadie se entera. Aceptado para el MVP y declarado en el
resumen del plan 03-09. Lo cerraría un ping externo desde el dispatcher hacia un servicio de
terceros. Fuera del alcance.

**Dueño:** la fase de despliegue. **Forma de cierre:** el dispatcher hace un `pg_net` extra hacia
un servicio de terceros en cada corrida; si el servicio deja de recibir el ping, avisa por fuera del
sistema. Es la única capa que no es ciega a su propia muerte.

## Del plan 03-10

### 1. El checkpoint 2 queda diferido CON FECHA, no indefinidamente

**Qué pasa.** `feed_sync_runs` guarda en cada corrida de diff el piso del feed (`min_ends_on`) y el
contador de rotaciones de UID. Son los dos instrumentos que contestan empíricamente las dos
preguntas que llevaban dos documentos de research en disputa. Instrumentación escrita y no leída es
instrumentación desperdiciada.

**Por qué no se lee aquí, y esto es lo que lo convierte en diferimiento legítimo.** No se difiere
por falta de tiempo: **se difiere porque producción no existe todavía.** El checkpoint A1 de la
Fase 1 (crear los proyectos Supabase de dev y de producción) sigue abierto, así que no hay tres días
de sync real contra feeds de Airbnb de verdad que leer. Toda la Fase 3 se verificó en local, y en
local el piso del feed y las rotaciones de UID salen de fixtures construidas por nosotros: leerlas
sería medirnos a nosotros mismos.

**Fecha de disparo.** **Al tercer día de sync real corriendo en producción**, atado a que se cierre
el checkpoint A1 de la Fase 1. Con 34 feeds y ~15 reservas por feed hay muestra de sobra en una
semana.

**Dueño:** el usuario, al desplegar producción.

**Las tres consultas, literales y listas para pegar.** No están resumidas a propósito: un resumen
obliga a reconstruirlas dentro de tres meses y ahí se pierden.

1. Serie del piso del feed por hora de Bogotá:

```sql
select date_trunc('hour', started_at at time zone 'America/Bogota') as hora_bog,
 min(min_ends_on), max(min_ends_on) from public.feed_sync_runs
 where outcome = 'ok' group by 1 order by 1;
```

2. Distribución de desapariciones:

```sql
select ends_on, disappeared_at at time zone 'America/Bogota' as se_fue_bog,
 (disappeared_at at time zone 'America/Bogota')::date - ends_on as dias_despues
 from public.calendar_reservations where disappeared_at is not null order by ends_on;
```

3. Rotaciones de UID:

```sql
select sum(uid_rotations) from public.feed_sync_runs;
```

**Las dos preguntas que contestan, y qué decisión desbloquea cada una.**

| Pregunta | La contestan | Qué desbloquea |
|---|---|---|
| ¿La reserva que termina hoy desaparece hoy mismo o mañana, y con qué zona horaria? | Consultas 1 y 2. Si `min_ends_on` salta de D a D+1 **durante el propio día D**, es el mundo B, y la hora de Bogotá en que salta dice qué zona horaria usa Airbnb. Si salta al empezar D+1, es el mundo A. La hora del día de la segunda columna de la consulta 2 contesta la parte de la zona horaria. | La decisión de encoger o no la ventana protegida. Ver la entrada 2. |
| ¿El `UID` de Airbnb sobrevive a un cambio de fechas? | Consulta 3. **Cero** significa que el `UID` es estable. Distinto de cero significa que rota, y que el nivel 1 de identidad (el código de reserva) es el que está sosteniendo el sistema. | Nada bloqueante: el diseño del diff es correcto bajo las dos respuestas, porque la identidad del aseo es `(property_id, scheduled_date)` y no la reserva. Si sale distinto de cero, hay que comprobar que la aserción 12 del plan 03-09 sigue cubriendo el caso. |

**Qué hacer con la salida.** Pegarla **literal** en este archivo, con su fecha. No un resumen: la
salida real es el dato, y el resumen es la interpretación de quien la miró ese día.

### 2. La ventana protegida se queda en `today_bog() + 1`. Decisión tomada, no pendiente

**Decisión:** no se encoge. Se queda en `today_bog() + 1` hasta que las consultas de la entrada 1
den un dato real de producción.

**Justificación, y es la única que importa:** no hay ni un dato medido que confirme el mundo A. Lo
que hay son dos documentos de research en desacuerdo y fixtures construidas por nosotros, que
prueban que el código se comporta bien bajo los dos mundos pero no cuál es el mundo real.

Y la asimetría de costos es la que el propio plan describe:

- **Coste de dejarla en `+1` si el mundo real fuera A:** un aseo de más, que un humano revisa en el
  panel y cancela en diez segundos.
- **Coste de encogerla a `today_bog()` si el mundo real fuera B:** el aseo de hoy cancelado con la
  aseadora ya en camino al apartamento.

Ante cualquier duda no se encoge. La postura conservadora se mantiene por escrito y con dueño, que
es distinto de mantenerse por olvido.

### 3. Los proyectos Supabase de dev y de producción no existen (checkpoint A1 de la Fase 1)

**Qué pasa.** El checkpoint A1 sigue abierto desde la Fase 1. Toda la Fase 3 se verificó contra el
stack local: `supabase start`, migraciones aplicadas, `pg_cron` y `pg_net` instalados en local.

**Impacto.** Bloquea el checkpoint 2 de este plan (entrada 1) y las entradas 5 y 6. Ninguna decisión
de ingeniería de esta fase depende de él: el diseño es seguro bajo las dos respuestas de las
preguntas abiertas, y por eso la fase cierra igual.

**Lo que NO es una migración.** Los secretos de Vault (el secreto compartido del cron y la URL base
del worker) son **datos**, no schema. No pueden ir en una migración: quedarían en texto plano en el
repositorio y en `cron.job.command`, que es texto plano y está medido. Son un paso operativo del
despliegue y están documentados en `docs/despliegue-sync.md`.

**Dueño:** el usuario, al desplegar. **Forma de cierre:** crear los dos proyectos, cargar los dos
secretos en Vault y correr el agendado del dispatcher.

### 4. `CRON_SHARED_SECRET` vive en tres sitios que tienen que coincidir

**Qué pasa.** El mismo secreto compartido tiene que estar en `.env.local` (para la suite de
integración), en Vercel (para el worker desplegado) y en Vault (para el dispatcher de `pg_cron`).
Nada del sistema comprueba que los tres coincidan.

**El modo de fallo, que es lo peligroso.** Cuando no coinciden, el dispatcher manda la petición, el
worker responde **401 sin cuerpo** (a propósito: distinguir "no mandaste header" de "el secreto no
coincide" es información gratis para quien sondea el endpoint) y `pg_net` es fire-and-forget, así
que nadie lee esa respuesta. **El sync deja de correr en silencio.** Solo se ve por dos vías
indirectas: el historial del job y la obsolescencia de la salud del feed, que es exactamente lo que
`estadoDeSincronizacion` computa.

**Dueño:** la fase de despliegue. **Forma de cierre:** una comprobación de arranque en el despliegue
que haga una llamada de prueba al worker con el secreto de Vault y verifique que no da 401.

### 5. Que el job corra cada minuto durante días no está verificado, y no puede estarlo sin producción

**Qué pasa.** En local la cadencia se aproxima con el agendado de segundos, que es lo que hace la
suite del dispatcher. Eso mide el mecanismo, no la resistencia: un job que corre cada minuto durante
días acumula historial, lease vencidos y feeds con backoff largo, y ninguna de esas condiciones se
alcanza en una corrida de test.

**Dueño:** la primera semana de producción. **Forma de cierre:** revisar `cron.job_run_details` y la
distribución de `consecutive_failures` al séptimo día.

### 6. Que el feed real llegue con CRLF no está probado

**Qué pasa.** `airbnb-real-crlf.ics` prueba que el código lo aguanta, no que Airbnb lo mande así. La
fixture real llegó normalizada a LF por el proceso de anonimización. El RFC 5545 §3.1 especifica
CRLF, así que es lo más probable, pero la captura que tenemos no lo demuestra.

**Impacto.** Ninguno si el desdoblado sigue normalizando el retorno de carro, que es lo que el
señuelo 1 del plan 03-02 vigila con cinco tests. La entrada existe para que nadie borre esa
normalización pensando que es defensiva.

**Dueño:** la primera corrida real. **Forma de cierre:** una sola corrida contra el feed en vivo lo
confirma o lo desmiente.

### 7. `npx tsc --noEmit` y `npm run build` en rojo por directorios duplicados en `node_modules` del checkout principal

**Encontrado en:** plan 03-10, al correr la puerta de fase.

**Qué pasa.** `tsc` devuelve 1 con **nueve** errores `TS2688`, todos de la misma forma:

```
error TS2688: Cannot find type definition file for 'chai 2'.
error TS2688: Cannot find type definition file for 'node 3'.
error TS2688: Cannot find type definition file for 'react 3'.
```

El checkout principal tiene `node_modules/@types/` con cada paquete **duplicado con un sufijo
numérico**: `chai` y `chai 2`, `node` y `node 3`, `react` y `react 3`, y así los nueve. Es el patrón
de renombrado que dejan los servicios de sincronización de archivos (iCloud Drive y similares)
cuando resuelven un conflicto. `tsc` recorre los `typeRoots` **hacia arriba** en el árbol de
directorios, así que un worktree con su `node_modules` recién instalado y limpio los hereda igual.

**Por qué no lo causa este plan, medido tres veces.**

1. Los nueve errores son idénticos y en el mismo número corriendo `npx tsc --noEmit` en el checkout
   principal, sin ningún cambio de este plan.
2. La cuenta cuadra exactamente: `node_modules/@types` de este worktree tiene **9** directorios y
   todos limpios; el del checkout principal tiene **9** duplicados con sufijo numérico. Nueve
   duplicados, nueve errores.
3. **La prueba decisiva:** `npx tsc --noEmit --typeRoots ./node_modules/@types` sale con **cero
   errores y cero salida**. Fijar la raíz de tipos al worktree corta el recorrido hacia arriba y el
   proyecto compila limpio. Los nueve son `TS2688` sobre bibliotecas de tipos implícitas, ninguno
   sobre un archivo fuente.

**Impacto.** Las puertas `tsc --noEmit` **y `npm run build`** quedan en rojo en esta máquina. El
build compila bien (`✓ Compiled successfully in 13.9s`, 0 errores de webpack) y muere después, en el
paso "Linting and checking validity of types", que es `tsc` otra vez y falla con el **mismo** primer
error, `Cannot find type definition file for 'chai 2'`. No afecta a `test:unit`, `test:integration`,
`db:test`, `db:advisors` ni `ci:arch`, que son los que miden el código de esta fase. En CI no
aparece, porque ahí `node_modules` sale de un `npm ci` limpio sobre una ruta que no está
sincronizada.

**Y arrastra a `npm run test:e2e`**, cuyo `webServer` de Playwright corre `npm run build && npm run
start`: el build muere y Playwright reporta `Process from config.webServer was not able to start.
Exit code: 1`. Medido con `PLAYWRIGHT_PORT=3117`. No es un fallo de ningún spec: la suite ni
arranca.

**Forma de cierre.** Borrar los directorios duplicados del checkout principal y reinstalar:

```sh
rm -rf /Users/juanortega/Documents/VivaGuest/node_modules && npm ci
```

**No se ejecuta desde aquí:** es `node_modules` de la máquina del usuario, está fuera del repositorio
y borrar directorios ajenos al worktree es exactamente lo que la frontera de alcance del ejecutor
prohíbe. **Dueño:** el usuario. Y la salida duradera es sacar el proyecto de la carpeta sincronizada,
o excluir `node_modules` de la sincronización.

### 8. El `.ics` real con bloqueos del propietario: DIFERIDO. La clasificación se queda en MEDIA

**Estado del checkpoint 1 del plan 03-10: diferido por decisión del usuario.** La prioridad es
sacar el MVP y la captura cuesta diez minutos que hoy no se gastan. **El archivo
`lib/domain/__fixtures__/ical/airbnb-real-bloqueos.ics` NO existe**, y no se creó ninguno con ese
nombre: etiquetar una fixture sintética como captura real de Airbnb dejaría el repositorio
afirmando algo falso sobre su propia evidencia, que es exactamente la circularidad que esta entrada
existe para denunciar.

**La frase que el plan exige, literal:**

> la distinción entre reserva y bloqueo del propietario está en confianza MEDIA y no la cierra ningún test de este repo

**La consecuencia declarada, sin suavizar.**

- **No hay ni un solo bloqueo real del propietario en todo el repositorio.** Los quince eventos del
  feed real capturado el 2026-09-02 son `Reserved`, los quince.
- `solo-bloqueos.ics` y `airbnb-bloqueos-1dia.ics` son **sintéticas**, y las escribió la Fase 2 a
  partir de los mismos documentos que pretenderían validar. Usarlas como evidencia de cómo se ve un
  bloqueo es circular. El verificador de la fase no debe contarlas como cobertura de esta pregunta.
- **La suposición A1 del research sigue sin verificar contra datos reales:** que un bloqueo del
  propietario **no** trae la URL de detalle de reserva dentro de su campo libre. Si la trajera, la
  whitelist positiva del clasificador clasificaría un bloqueo como reserva, y un apartamento cerrado
  tres meses generaría ~90 aseos fantasma con sus 90 notificaciones y sus 90 pagos presupuestados.

**El señuelo del plan 03-02 sigue sin poder atraparse, y es la misma laguna vista desde el otro
lado.** Invertir el orden de las dos ramas de `clasificar()` (mirar el `SUMMARY` antes que el campo
libre) **no pone en rojo ni una sola aserción sobre una fixture**: ni las 15 reservas del feed real,
ni los 90 bloqueos, ni los 3 desconocidos, ni los 15 del descriptor mutilado se mueven. Lo único que
cae es un test sintético escrito a mano. La razón es que en la única muestra real que existe los dos
discriminadores están correlacionados al **100%**, porque no hay ni un evento que traiga a la vez la
URL de detalle y un resumen de no disponibilidad. Con el `.ics` real de bloqueos en el repositorio,
ese señuelo pasaría a ser medible y la confianza subiría de MEDIA a ALTA.

**La mitigación vigente, que es lo que hace aceptable diferir.** Equivocarse aquí **no es
destructivo**, y eso está construido a propósito en tres capas independientes:

1. **El clasificador falla CERRADO.** Un `SUMMARY` jamás visto no clasifica reserva: clasifica
   `desconocido`. Y `desconocido` **no genera aseo**. El error posible es "falta un aseo que un
   humano crea a mano", no "aparecen noventa aseos fantasma".
2. **Se emite alerta.** Un evento desconocido produce una notificación al admin, así que un cambio
   de formato de Airbnb no apaga la sincronización en silencio.
3. **La guarda de colapso atrapa el caso masivo.** Si el formato cambiara y los eventos cayeran en
   bloque a `desconocido`, la guarda sobre **reservas clasificadas** (no sobre eventos) corta antes
   de llamar al RPC, y el reconcile no cancela los aseos del apartamento. Medida en los planes 03-06
   y 03-08.

**Dueño:** el usuario.

**Forma de cerrarse**, y son diez minutos:

1. Entrar al panel de anfitrión de Airbnb con la cuenta de VivaGuest.
2. Elegir un anuncio propio y **bloquear tres fechas a mano** en su calendario. Fechas cerradas por
   el anfitrión, no una reserva.
3. Esperar unos minutos y **exportar el calendario** de ese anuncio, con la misma URL de exportación
   iCal que ya usa el sistema.
4. Anonimizar el `.ics` con el criterio exacto de `airbnb-real-anonimizado.ics`: se anonimizan
   códigos de reserva, últimos 4 dígitos de teléfono, `UID` e id del anuncio; se **conservan**
   fechas, plegado a 75 octetos, orden de propiedades y estructura del `UID`. El crudo no entra al
   repositorio.
5. Guardarlo como `lib/domain/__fixtures__/ical/airbnb-real-bloqueos.ics`, documentarlo en el README
   de fixtures, y añadir a `ical-clasificar.test.ts` las tres aserciones: los bloqueos clasifican
   `bloqueo`, producen **cero** aseos, y **si de verdad no traen la URL de detalle de reserva**. Si
   la trajeran, es un hallazgo **bloqueante** y hay que registrarlo aquí antes de seguir.
6. Correr el señuelo del orden de las ramas y registrar si ahora sí se atrapa.
