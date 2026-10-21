# Canchita online

Juego de fútbol con clases, con salas privadas por código de cuatro caracteres y contraseña. De 1v1 a 3v3, sin jugadores automáticos en las salas online.

## Jugar

Abrí la dirección del servidor desde PC o celular. En JUGAR → CREAR SALA elegí una contraseña. Compartí el código y la contraseña con tus amigos; ellos entran en UNIRSE A SALA. En la sala, el anfitrión elige 1v1, 2v2 o 3v3; cada jugador elige equipo y clase. El primer jugador conectado de cada equipo elige el conjunto. Todos deben marcar LISTO para que el anfitrión inicie.

Controles: WASD/flechas, mouse y clic sostenido, clic derecho para pase, Shift para sprint, Espacio para dash y E para habilidad. En móvil, joystick circular y botones de Pase y Dash del mismo tamaño, alineados a la derecha, con la habilidad de clase a la izquierda de Pase. Tocar Dash activa el desplazamiento; mantenerlo activa sprint. JUEGO ACTUAL permite practicar sin conexión. En una partida online se vuelve a la sala desde MENÚ → VOLVER A LA SALA (anfitrión).

Los goles incluyen la repetición con borde rojo y cámara lenta 0,60× desde medio segundo antes del remate. Solo suenan los remates y los rebotes en paredes; los rebotes suaves tienen menor volumen. Tocar durante la repetición la omite en ese dispositivo; el siguiente saque espera a que termine el tiempo compartido de repetición.

Los partidos duran dos tiempos de un minuto de juego, con tres segundos de entretiempo. El reloj se detiene durante las repeticiones, los saques y las desconexiones. En el segundo tiempo los equipos cambian de lado. Al terminar aparecen el resultado, los goleadores, el detalle de goles y los MVP. El MVP suma 5 puntos por gol, 3 por asistencia, 1 por robo y 1 por atajada, y resta 2 por gol en contra; los empates comparten el premio. Todos los jugadores deben elegir REJUGAR para empezar una revancha en la misma sala. También pueden salir o volver a la sala con el anfitrión.

Un dash que toca el cuerpo de un rival con posesión lo atraviesa y transfiere la pelota. El jugador que la pierde tiene un breve tiempo de espera antes de volver a recuperarla. La stamina mantiene su consumo real mientras su barra se anima de forma fluida.

## Ejecutar el servidor

Necesita Node.js 22 o posterior.

```
npm ci
npm start
```

Abrí http://localhost:3000. Otros dispositivos de la misma red pueden entrar en http://IP-DE-TU-PC:3000 si el firewall lo permite. Para jugar por Internet, desplegá el mismo proyecto como servicio web Node en Render; `render.yaml` configura el plan gratuito. No necesita base de datos. El servidor sirve el HTML y las conexiones WebSocket desde la misma dirección. `PORT` lo define el alojamiento. `TRUST_PROXY=1` se utiliza detrás del proxy de Render; debe quedar en 0 fuera de ese entorno.

La versión descargable del HTML contiene todos los audios y fuentes. Para el modo online usa el servidor publicado que lleva configurado; la práctica funciona sin conexión.

## Comprobaciones

```
npm test
```

Pruebas de salas, contraseñas erróneas, cupos, permisos, movimiento entre clientes reales, reconexión, clases, rebotes y goles. La interfaz también se comprueba con dos clientes del juego y entradas de PC y móvil en el entorno de desarrollo.

## Funcionamiento y límites

El servidor calcula a 120 pasos por segundo y envía estados a 30 Hz; el cliente interpola y anticipa el movimiento propio. Las contraseñas se guardan únicamente como hash scrypt con sal aleatoria. La contraseña y el token de reconexión no se envían a otros jugadores. El token del propio jugador se conserva en la sesión de esa pestaña para recuperar la conexión, con 90 segundos de tolerancia. El partido se pausa mientras falta un jugador y vuelve a la sala si no regresa. La salida del anfitrión transfiere su rol a otro jugador conectado.

Las salas son temporales y viven en la memoria de una sola instancia. Un reinicio del servicio las cierra. Render gratuito puede dormir por inactividad, demorar el primer acceso y reiniciar instancias: no es una garantía de disponibilidad. No se incluye escalado entre múltiples instancias, cuentas ni persistencia de partidos.

## Créditos de recursos

Fuentes Oxanium, Teko y Barlow Condensed: Google Fonts, SIL Open Font License; textos de licencia incluidos en el HTML. Audios de remate y rebote: recursos reutilizables CC0 de la versión anterior, conservados con sus créditos dentro del HTML. Biblioteca `ws`: MIT (licencia en su paquete). El código y el arte del juego conservan sus derechos; este repositorio no concede una licencia nueva sobre el juego.

Las repeticiones son compartidas. Solo quien marcó puede pedir al servidor que salte la repetición para todos. Cada saque tiene un identificador para descartar posiciones anteriores y liberar los controles. El cliente integra el movimiento local por cuadro y reconcilia su historial con los estados recibidos; los paquetes de estado atrasados se descartan antes de saturar la conexión.

## Modos

Normal conserva la posesión, las clases y los controles existentes. Original usa una cancha de 1725 × 937,5 unidades (cada dimensión es 1,5 veces la normal), discos que se empujan por colisión y remates radiales por cercanía, sin posesión ni carga. Todos los jugadores tienen la misma física de movimiento. En PC se patea con Espacio, X, Control o click; en móvil con PATEAR. La práctica Original no agrega rivales automáticos. Las salas tienen un modo fijo y solo admiten jugadores del mismo modo. Referencia del modelo de física: https://github.com/haxball/haxball-issues/wiki/Stadium-(.hbs)-File .

Original permite configurar duración por tiempo (0 = sin límite, hasta 30 minutos, en pasos de 30 segundos), uno o dos tiempos, límite de 0 a 50 goles (0 = sin límite), repeticiones y desempate a gol de oro. La configuración se fija al empezar, la edita solamente el anfitrión en la sala y los cambios cancelan las confirmaciones de Listo. En práctica se conserva en este navegador. El límite de goles termina el partido tras la repetición del gol decisivo, si está habilitada. Normal conserva sus reglas actuales.
