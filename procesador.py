import asyncio
import websockets
import socketio
import numpy as np
from scipy.signal import butter, lfilter, iirnotch
from collections import deque
import time

# =========================================================
# CONFIGURACIÓN GENERAL
# =========================================================
FS = 250
BUFFER_SIZE = 2000
OFFSET = 2048
paquete_datos = []
TAMANO_PAQUETE = 20

# =========================================================
# SOCKET.IO CLIENT
# =========================================================
sio = socketio.Client(
    logger=True,
    engineio_logger=True
)

# =========================================================
# FILTROS
# =========================================================
def butter_bandpass(lowcut, highcut, fs, order=2):
    nyq = 0.5 * fs
    b, a = butter(
        order,
        [lowcut / nyq, highcut / nyq],
        btype='band'
    )
    return b, a

def notch_filter(cutoff, fs, quality=30.0):
    nyq = 0.5 * fs
    b, a = iirnotch(cutoff / nyq, quality)
    return b, a

# ECG típico
b_band, a_band = butter_bandpass(0.5, 40.0, FS)

# Elimina ruido eléctrico
b_notch, a_notch = notch_filter(60.0, FS)

# =========================================================
# BUFFERS
# =========================================================
raw_buffer = deque([0] * BUFFER_SIZE, maxlen=BUFFER_SIZE)
filt_buffer = deque([0] * BUFFER_SIZE, maxlen=BUFFER_SIZE)

# =========================================================
# VARIABLES BPM
# =========================================================
last_peak_time = 0
detectado = False
historial_bpm = deque(maxlen=5)

# =========================================================
# PROCESAMIENTO ECG
# =========================================================
async def handler(websocket):

    global last_peak_time
    global detectado
    global historial_bpm
    global paquete_datos
    print("¡ESP32 conectado!")

    async for message in websocket:

        try:
            # =============================================
            # LECTURA
            # =============================================
            val = int(message)

            # Eliminar offset ADC
            cruda = val - OFFSET

            raw_buffer.append(cruda)

            # =============================================
            # FILTRO NOTCH
            # =============================================
            temp = lfilter(
                b_notch,
                a_notch,
                list(raw_buffer)
            )

            # =============================================
            # FILTRO PASA BANDA
            # =============================================
            limpia = lfilter(
                b_band,
                a_band,
                temp
            )[-1]

            filt_buffer.append(limpia)

            # =============================================
            # NORMALIZACIÓN DINÁMICA
            # =============================================
            ventana = np.array(filt_buffer)

            val_max = np.max(ventana)
            val_min = np.min(ventana)

            rango = val_max - val_min

            if rango == 0:
                rango = 1

            normalizada = (
                (
                    limpia - ((val_max + val_min) / 2)
                ) / rango
            ) * 1000

            # =============================================
            # DETECCIÓN DE PICOS
            # =============================================
            bpm_promedio = 0

            if normalizada > 300 and not detectado:

                current_time = time.time()

                dt = current_time - last_peak_time

                # Evita dobles detecciones
                if dt > 0.4:

                    bpm_instantaneo = 60 / dt

                    historial_bpm.append(
                        bpm_instantaneo
                    )

                    bpm_promedio = (
                        sum(historial_bpm)
                        / len(historial_bpm)
                    )

                    print(
                        f"Latido detectado | BPM: "
                        f"{bpm_promedio:.1f}"
                    )

                    last_peak_time = current_time
                    detectado = True

            elif normalizada < 100:
                detectado = False

            # =============================================
            # ENVÍO A FLASK / RENDER
            # =============================================
            # 1. Agregamos el dato a la "caja" (paquete_datos)
            paquete_datos.append({
                'voltaje': float(normalizada),
                'bpm': float(bpm_promedio)
            })

            # 2. DECISIÓN: ¿Ya está la caja llena?
            if len(paquete_datos) >= TAMANO_PAQUETE:
                
                # 3. SÍ: Usamos el sio.emit para enviar el paquete completo
                sio.emit(
                    'datos_procesados',
                    paquete_datos, # <--- Enviamos la lista completa de 20 datos
                    namespace='/'
                )
                
                # 4. Limpiamos la caja para volver a empezar
                paquete_datos = [] 
            
            # (No hay 'else', si la caja no está llena, 
            # simplemente esperamos a la siguiente muestra)

        except Exception as e:
            print(f"Error: {e}")

# =========================================================
# MAIN
# =========================================================
async def main():

    print("Conectando con Render...")

    try:

        sio.connect(
            'http://bio-pulse.onrender.com',
            transports=['polling'],
            socketio_path='/socket.io'
        )

        print("¡Conectado a Render!")

    except Exception as e:

        print(
            f"No se pudo conectar a Render: {e}"
        )

        return

    # =============================================
    # SERVIDOR LOCAL PARA ESP32
    # =============================================
    async with websockets.serve(
        handler,
        "0.0.0.0",
        8000
    ):

        print(
            "Esperando datos del ESP32 "
            "en puerto 8000..."
        )

        await asyncio.Future()

# =========================================================
# EJECUCIÓN
# =========================================================
if __name__ == "__main__":
    asyncio.run(main())