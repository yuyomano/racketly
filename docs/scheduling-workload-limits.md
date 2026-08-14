# Norma del algoritmo de agendado — límite de carga por pareja

> Ubicación del código: `packages/utils/src/index.ts` (lógica compartida) ·
> `services/tournament-service/src/routes/tournaments.routes.ts` (`POST /:id/schedule`) ·
> `services/tournament-service/src/routes/tournament-events.routes.ts` (`POST /:id/schedule`)

## 1. Objetivo

El agendador automático de pistas (por torneo individual, o por evento con varios
torneos compartiendo pistas) asigna pista + horario a cada partido pendiente. Esta
norma añade una restricción física de calendario: **ninguna pareja (o jugador, en
torneos individuales) puede quedar agendada para jugar más partidos o sets de los
que puede jugar razonablemente en una jornada**, sin importar cuántas pistas o
tiempo libre haya disponible en el club.

## 2. Definiciones

| Término | Definición |
|---|---|
| **Pareja** | Los dos integrantes de una inscripción (`playerId` + `partnerId`), identificados sin importar el orden. En torneos de tipo `singles` (sin pareja), la "pareja" es el jugador individual. |
| **Jornada / día** | Fecha calendario (UTC) del instante en que arranca el partido — `YYYY-MM-DD`. |
| **Media jornada** | Mitad de la jornada: **mañana** (antes de las 12:00 UTC) o **tarde** (12:00 UTC en adelante). La frontera es fija a mediodía — no depende de las franjas horarias (`schedulingWindows`) que el organizador configuró para ese día, que pueden variar de una fecha a otra. |
| **Set completo** | Un set jugado hasta el final según su modalidad (ej. 6 games con diferencia de 2, o el pro-set correspondiente). Un **super tie-break** (usado para decidir el partido en la modalidad "2 sets + super tie-break" cuando queda 1-1) **no cuenta como set completo** — decide el partido, pero no es un set. |

## 3. Límites

| Restricción | Por jornada completa | Por media jornada |
|---|---|---|
| Partidos por pareja | **máximo 3** | **máximo 2** |
| Sets completos por pareja | **máximo 6** | **máximo 4** |

Ambos límites (partidos y sets) se evalúan **de forma independiente** — un partido
puede bloquearse por exceso de partidos aunque no exceda sets, o viceversa.

Los sets que consume un partido dependen de su modalidad. Como el resultado real
no se conoce al momento de agendar, el algoritmo **reserva el peor caso** (el
máximo de sets completos que esa modalidad puede llegar a producir):

| Modalidad | Sets completos (peor caso) |
|---|---|
| `best_of_3_full` — 3 sets completos | 3 |
| `two_sets_super_tb` — 2 sets + super tie-break | 2 *(el super tie-break no cuenta)* |
| `pro_set_8` — Pro set a 8 games | 1 |
| `pro_set_10` — Pro set a 10 games | 1 |
| `single_set_6` — Set único a 6 games | 1 |
| `timed_30` — Tiempo fijo, 30 min | 1 |
| `timed_40` — Tiempo fijo, 40 min | 1 |

> Reservar el peor caso es intencional: garantiza que la pareja **nunca pueda
> terminar** superando su cupo real de sets, sin importar cómo se desarrollen los
> partidos. El costo es conservador (puede rechazar un horario que en la práctica
> hubiera estado bien si el partido terminó en menos sets de los reservados), pero
> es la única forma de dar la garantía por adelantado, antes de jugarse el partido.

## 4. Alcance — a qué partidos aplica

La restricción solo se puede evaluar cuando **ambos jugadores del partido ya están
definidos** (fase de grupos, y la primera ronda del cuadro eliminatorio ya
sembrada). Las rondas futuras del cuadro (octavos, cuartos, semifinal, final)
todavía no tienen jugadores asignados en el momento de agendar — ahí es imposible
saber de qué pareja se trata, así que **esos partidos se agendan sin verificar el
cupo**. Cuando el resultado de la ronda anterior define quién avanza y se
re-agenda esa ronda (o se ajusta manualmente), en ese momento sí se conoce la
pareja y sí se puede — y se debe — validar.

## 5. Alcance — un torneo vs. un evento

- **Agendado de un torneo individual** (`POST /api/tournaments/:id/schedule`): el
  cupo se calcula solo con los partidos de ese torneo.
- **Agendado de un evento** (`POST /api/tournament-events/:id/schedule`, varios
  torneos del mismo fin de semana compartiendo pistas): el cupo se calcula
  **cruzado entre todos los torneos del evento**. Una pareja puede estar inscrita
  en más de una categoría del mismo evento (ej. mixto y masculino) — sus partidos
  en cualquiera de esos torneos cuentan para el mismo cupo diario.

En ambos casos, si ya existían partidos con horario asignado **antes** de esta
corrida del agendador (de una corrida anterior parcial, o reprogramados a mano),
esos partidos se cuentan primero para "pre-sembrar" el cupo ya consumido, antes de
agendar los pendientes — así agendar por partes sigue respetando el límite
acumulado del día.

## 6. Algoritmo

### 6.1 Estructuras

- **`PairWorkloadTracker`** — mapa `pareja → jornada → {partidos, sets}` y
  `pareja → media-jornada → {partidos, sets}`. Dos operaciones:
  - `fits(pareja, instante, sets)` → `true` si agregar un partido de esa pareja en
    ese instante, reservando `sets` sets, **no** rompe ninguno de los 4 límites.
  - `register(pareja, instante, sets)` → confirma la reserva (incrementa los
    contadores de esa jornada y esa media jornada).

- **`findWorkloadEligibleStart(...)`** — dado un horario mínimo (`lowerBound`) y
  las dos parejas del partido, busca el primer instante ≥ `lowerBound` en el que
  la pista más pronto disponible **y** ambas parejas caben:

  ```
  candidato = lowerBound
  repetir hasta 60 veces:
    horaPista = pistaMásPróximaDisponible(candidato)   # ya ajustada a franjas horarias, si las hay
    si ambas parejas caben en horaPista:
        devolver horaPista
    candidato = siguienteFronteraDeMediaJornada(horaPista)   # mediodía del mismo día, o medianoche del día siguiente
  si se agotan los 60 intentos: error — "no se encontró horario que respete el cupo"
  ```

  Cada intento fallido salta al **siguiente bloque** (la otra media jornada del
  mismo día, o el día siguiente si ya era la tarde) — nunca intenta un instante
  intermedio que de todas formas seguiría en el mismo bloque ya agotado. 60
  iteraciones cubren ~30 días de margen, suficiente para cualquier torneo real;
  si se agota es señal de que faltan pistas, días, o el torneo tiene más partidos
  de los que el calendario configurado puede absorber.

### 6.2 Integración en el agendado de partidos "conocidos"

Para cada partido con los dos jugadores ya definidos, en el orden existente
(por ronda, y por torneo en el caso de eventos):

1. Calcular la modalidad del partido (según la ronda, con overrides si el
   organizador definió uno) → duración estimada y sets reservados (peor caso).
2. Calcular el horario mínimo posible por descanso: el mayor entre el momento en
   que cada uno de los dos jugadores termina su descanso mínimo desde su último
   partido (`minRestMinutes` del torneo).
3. Buscar el horario real con `findWorkloadEligibleStart`, combinando ese mínimo
   con la disponibilidad de pistas y el cupo de ambas parejas.
4. Asignar el partido a la pista y hora resultantes; actualizar: la pista
   (ocupada hasta fin del partido + colchón entre partidos), el descanso de
   ambos jugadores, y el `PairWorkloadTracker` de ambas parejas.

### 6.3 Partidos "desconocidos" (rondas futuras)

Sin cambios respecto al algoritmo base: se agendan por "oleada" (una ronda
entera), sin verificar cupo por pareja — ver [§4](#4-alcance--a-qué-partidos-aplica).

## 7. Ejemplo

Torneo "Categoría A Masculino", modalidad `best_of_3_full` (3 sets → reserva 3
sets por partido), viernes agendado de 08:00 a 22:00 (franja horaria del evento).

La pareja **Ana / Mariana** ya tiene agendados:

- 08:00 (mañana) — partido 1
- 10:00 (mañana) — partido 2

Al intentar agendar un tercer partido de esa pareja **a las 11:00 (mañana)**:

- Partidos en media jornada (mañana) = 2 → **al límite** (máximo 2). Un tercer
  partido en la mañana lo rompería.
- `findWorkloadEligibleStart` detecta el bloqueo, salta a la **frontera de la
  tarde** (12:00) y reintenta ahí.
- A las 12:00: partidos en media-jornada (tarde) = 0, partidos en el día = 2 → cabe.
- El partido se agenda a partir de las 12:00 (o más tarde si a esa hora no hay
  pista libre), no a las 11:00.

Si esa pareja ya tuviera **3 partidos en el día completo** (mañana + tarde), el
salto de frontera en frontera terminaría llevándola al **día siguiente** — el
límite diario (3 partidos, 6 sets) no se puede romper saltando de media jornada.

## 8. Parámetros configurables

Los 4 límites (`PAIR_DAILY_MATCH_LIMIT`, `PAIR_HALF_DAY_MATCH_LIMIT`,
`PAIR_DAILY_SET_LIMIT`, `PAIR_HALF_DAY_SET_LIMIT`) y la tabla de sets por
modalidad (`MATCH_FORMAT_MAX_SETS`) están centralizados en
`packages/utils/src/index.ts` como constantes exportadas — cambiarlos ahí los
aplica automáticamente a ambos agendadores (torneo y evento) sin tocar el resto
del algoritmo.

## 9. Limitaciones conocidas / mejoras futuras

- **Rondas futuras sin jugador definido** no se validan contra el cupo (ver §4)
  — requeriría re-agendar dinámicamente a medida que se conocen resultados, fuera
  del alcance actual.
- **La reserva por peor caso** puede ser conservadora: si un partido termina en
  menos sets de los reservados (ej. 6-0, 6-0 en lugar de ir a un tercer set), el
  cupo "liberado" no se recalcula retroactivamente — el agendado ya hecho para el
  resto del día no se reordena. Solo importa al momento de agendar hacia adelante.
- **Franja horaria vs. cupo**: si las franjas horarias configuradas para el
  evento no dejan suficiente tiempo en los días disponibles para que todas las
  parejas jueguen dentro de su cupo, el agendador puede lanzar el error de
  `findWorkloadEligibleStart` (sin horario posible) — la solución es agregar más
  días/franjas o pistas, no relajar el límite por pareja.
