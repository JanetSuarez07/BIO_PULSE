import asyncio
import time
from collections import deque

import numpy as np
import socketio

# =========================================================
# CONFIGURACIÓN GENERAL
# =========================================================
FS = 250                 # Muestras por segundo
TAMANO_PAQUETE = 20      # Muestras por paquete (20/250 = 0.08 s)
BPM_SIMULADO = 72        # Frecuencia cardíaca de la señal simulada
DURACION_SEG = 10        # Duración de la señal que se repite en bucle
SERVIDOR = 'http://bio-pulse.onrender.com'

# Si quieres usar una señal real ya grabada, pon aquí la ruta de un
# archivo .csv / .txt con UNA muestra por línea. Ejemplo: "mi_ecg.csv"
# Si es None, se genera una señal sintética.
ARCHIVO_ECG = None

# =========================================================
# SOCKET.IO CLIENT
# =========================================================
sio = socketio.Client(logger=False, engineio_logger=False)


# =========================================================
# GENERACIÓN DE LA SEÑAL ECG
# =========================================================
def generar_ecg_sintetico(fs, bpm, duracion):
    """Genera un ECG con ondas P, Q, R, S, T (suma de gaussianas)."""
    muestras_por_latido = int(fs * 60 / bpm)
    fase = np.linspace(0, 1, muestras_por_latido, endpoint=False)

    # (amplitud, posición en el latido, ancho)
    ondas = [
        (0.12, 0.18, 0.025),    # P
        (-0.15, 0.255, 0.010),  # Q
        (1.00, 0.28, 0.012),    # R
        (-0.25, 0.305, 0.012),  # S
        (0.30, 0.50, 0.050),    # T
    ]

    latido = np.zeros_like(fase)
    for amp, mu, sigma in ondas:
        latido += amp * np.exp(-((fase - mu) ** 2) / (2 * sigma ** 2))

    n_latidos = int(duracion * bpm / 60)
    senal = np.tile(latido, n_latidos)

    # Un poco de ruido para que se vea realista
    senal += np.random.normal(0, 0.005, len(senal))
    return senal


def cargar_senal():
    if ARCHIVO_ECG:
        print(f"Cargando señal desde {ARCHIVO_ECG}...")
        senal = np.loadtxt(ARCHIVO_ECG, delimiter=',').flatten()
    else:
        print("Generando señal ECG sintética...")
        senal = generar_ecg_sintetico(FS, BPM_SIMULADO, DURACION_SEG)

    # Normalización igual que antes: centrada y en rango de ±500
    vmax, vmin = np.max(senal), np.min(senal)
    rango = (vmax - vmin) or 1
    return ((senal - (vmax + vmin) / 2) / rango) * 1000


# =========================================================
# DETECCIÓN DE LATIDOS (misma lógica que tu código original)
# =========================================================
class DetectorBPM:
    def __init__(self):
        self.last_peak_time = -1.0
        self.detectado = False
        self.historial = deque(maxlen=5)

    def procesar(self, valor, t):
        """Devuelve el BPM promedio si hay latido en este instante, si no 0."""
        bpm_promedio = 0
        if valor > 300 and not self.detectado:
            dt = t - self.last_peak_time
            if dt > 0.4:  # Evita dobles detecciones
                if self.last_peak_time >= 0:
                    self.historial.append(60 / dt)
                if self.historial:
                    bpm_promedio = sum(self.historial) / len(self.historial)
                    print(f"Latido detectado | BPM: {bpm_promedio:.1f}")
                self.last_peak_time = t
                self.detectado = True
        elif valor < 100:
            self.detectado = False
        return bpm_promedio


# =========================================================
# MAIN
# =========================================================
async def main():
    print("Conectando con Render...")
    try:
        sio.connect(
            SERVIDOR,
            transports=['polling'],
            socketio_path='/socket.io'
        )
        print("¡Conectado a Render!")
    except Exception as e:
        print(f"No se pudo conectar a Render: {e}")
        return

    senal = cargar_senal()
    detector = DetectorBPM()

    print(f"Enviando señal ({len(senal)} muestras, en bucle)...")

    indice = 0            # Posición dentro de la señal (se repite)
    muestras_totales = 0  # Para calcular el tiempo simulado
    intervalo = TAMANO_PAQUETE / FS
    proximo_envio = time.perf_counter()

    while True:
        paquete = []
        for _ in range(TAMANO_PAQUETE):
            valor = float(senal[indice])
            t = muestras_totales / FS
            bpm = detector.procesar(valor, t)

            paquete.append({'voltaje': valor, 'bpm': float(bpm)})

            indice = (indice + 1) % len(senal)
            muestras_totales += 1

        try:
            sio.emit('datos_procesados', paquete, namespace='/')
        except Exception as e:
            print(f"Error al enviar: {e}")

        # Mantiene el ritmo real de 250 muestras/seg
        proximo_envio += intervalo
        espera = proximo_envio - time.perf_counter()
        if espera > 0:
            await asyncio.sleep(espera)
        else:
            proximo_envio = time.perf_counter()  # Nos atrasamos: reiniciar


# =========================================================
# EJECUCIÓN
# =========================================================
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDetenido.")
        if sio.connected:
            sio.disconnect()

            