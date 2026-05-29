// 1. CONEXIÓN AL BACKEND (Socket.IO)
const socket = io.connect(window.location.origin, { 
    transports: ['websocket']
});

let horaInicio = "N/A";
let horaFin = "N/A";

// Función auxiliar para calcular duración
function calcularDuracion(inicio, fin) {
    if (inicio === "N/A" || fin === "En monitoreo...") return "N/A";
    const d1 = new Date("01/01/2026 " + inicio);
    const d2 = new Date("01/01/2026 " + fin);
    const diff = (d2 - d1) / 1000 / 60;
    return diff >= 0 ? `${Math.round(diff)} minutos` : "N/A";
}

// Envolvemos todo en DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {

    // 2. CONFIGURACIÓN DE LA GRÁFICA (Chart.js)
    const ctx = document.getElementById('ecgChart').getContext('2d');
    const maxDataPoints = 100;

    const ecgChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(maxDataPoints).fill(''),
            datasets: [{
                label: 'ECG (mV)',
                data: Array(maxDataPoints).fill(0),
                borderColor: '#0035c7',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: { min: -1.5, max: 2.5, grid: { color: '#334155' } },
                x: { grid: { display: false } }
            }
        }
    });

    // 3. SELECCIÓN DE TODOS LOS ELEMENTOS DE INTERFAZ
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const bpmValue = document.getElementById('bpm-value');
    const btnConectar = document.getElementById('btn-conectar');
    const btnDetener = document.getElementById('btn-detener');
    const btnDescargar = document.getElementById('btn-descargar-reporte');
    const btnAbrirRegistro = document.getElementById('btn-abrir-registro');
    const btnCerrarRegistro = document.getElementById('btn-cerrar-registro');
    const modalRegistro = document.getElementById('modal-registro');

    // 4. LÓGICA DE RECEPCIÓN DE DATOS (Socket.io)
    socket.on('connect', () => {
        console.log("Conectado al servidor de procesamiento.");
        statusText.innerText = 'Esperando Sensor...';
    });

    socket.on('estado_sensor', (status) => {
        if (status.conectado) {
            statusIndicator.className = 'connected';
            statusText.innerText = 'Sensor Conectado';
        } else {
            statusIndicator.className = 'disconnected';
            statusText.innerText = 'Esperando Sensor...';
        }
    });

    socket.on('datos_ecg', (data) => {
        if (data.bpm > 0) {
            bpmValue.innerText = data.bpm;
        }
        ecgChart.data.datasets[0].data.push(data.voltaje);
        ecgChart.data.datasets[0].data.shift();
        ecgChart.update('none');
    });

    // 5. GESTIÓN DE BOTONES (Iniciar / Detener)
    if (btnConectar) {
        btnConectar.addEventListener('click', () => {
            socket.connect(); 
            setTimeout(() => {
                socket.emit('start_simulation');
            }, 500);
            btnConectar.disabled = true;
            if (btnDetener) btnDetener.disabled = false;
            horaInicio = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour12: true });
            horaFin = "En monitoreo...";
        });
    }

    if (btnDetener) {
        btnDetener.addEventListener('click', () => {
            socket.disconnect();
            statusIndicator.className = 'disconnected';
            statusText.innerText = 'Desconectado';
            if (btnConectar) btnConectar.disabled = false;
            btnDetener.disabled = true;
            horaFin = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour12: true });
        });
    }

    // 6. EXPORTACIÓN PDF (Versión Conectada a la BD Neon)
    if (btnDescargar) {
        btnDescargar.addEventListener('click', async () => {
        // 1. Obtener el ID del paciente activo (Asegúrate de que este ID sea correcto)
        // Puedes obtenerlo de un input oculto o de la primera celda de tu tabla
        const idPacActual = document.querySelector(".table-container tbody tr td")?.innerText;

        if (!idPacActual) {
            alert("No hay paciente registrado para generar el reporte.");
            return;
        }

        try {
            // 2. PETICIÓN DIRECTA A TU API DE PYTHON (la que creamos en app.py)
            const response = await fetch(`/obtener_datos_paciente/${idPacActual}`);
            const data = await response.json();

            if (data.error) {
                alert("Error al obtener datos: " + data.error);
                return;
            }

            // 3. Preparar los datos visuales
            const bpmActual = document.getElementById('bpm-value').innerText;
            const duracion = typeof calcularDuracion === 'function' ? calcularDuracion(horaInicio, horaFin) : "N/A";
            const imgData = document.getElementById('ecgChart').toDataURL("image/png", 1.0);
            const fechaMexico = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

            // 4. Crear el contenedor limpio
            const reporte = document.createElement('div');
            reporte.style.cssText = "padding: 40px; font-family: Arial, sans-serif; background: #fff; color: #000;";

            reporte.innerHTML = `
                <h1 style="text-align: center;">Reporte Clínico BIO_PULSE</h1>
                <p><strong>Fecha de emisión:</strong> ${fechaMexico}</p>
                <h2 style="border-bottom: 1px solid #ccc;">Datos del Paciente (BD)</h2>
                <table style="width: 100%; margin-bottom: 20px;">
                    <tr><td><strong>ID:</strong> ${data.id}</td><td><strong>Nombre:</strong> ${data.nombre}</td></tr>
                    <tr><td><strong>Edad/Sexo:</strong> ${data.edad} / ${data.sexo}</td><td><strong>Peso/Est:</strong> ${data.peso}kg / ${data.estatura}m</td></tr>
                </table>
                <h2 style="border-bottom: 1px solid #ccc;">Resumen Monitoreo</h2>
                <p><strong>Inicio:</strong> ${horaInicio} | <strong>Fin:</strong> ${horaFin} | <strong>Duración:</strong> ${duracion}</p>
                <p><strong>BPM Final:</strong> ${bpmActual}</p>
                <h2 style="border-bottom: 1px solid #ccc;">Trazado ECG</h2>
                <img src="${imgData}" style="width: 100%; border: 1px solid #000;">
            `;

            // 5. Generar el PDF
            reporte.style.position = "absolute";
            reporte.style.left = "-9999px";
            document.body.appendChild(reporte);

            html2pdf().set({
                margin: 15,
                filename: `Reporte_${data.id}.pdf`,
                html2canvas: { scale: 2, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(reporte).save().then(() => {
                document.body.removeChild(reporte);
            });

        // ... (Todo el código anterior igual hasta el try/catch del btnDescargar)

        } catch (err) {
            console.error("Error al conectar con la BD:", err);
            alert("No se pudo conectar con el servidor para obtener los datos.");
        }
    }); // <--- ESTE CIERRE ES EL DEL addEventListener
} // <--- ESTE CIERRE ES EL DEL if (btnDescargar)

// 7. LÓGICA DE APERTURA Y CIERRE DE MODAL
// Ahora esto queda fuera del if del botón de descarga, pero dentro del DOMContentLoaded
if (btnAbrirRegistro && modalRegistro) {
    btnAbrirRegistro.addEventListener('click', () => {
        modalRegistro.style.display = 'flex';
    });
}

if (btnCerrarRegistro && modalRegistro) {
    btnCerrarRegistro.addEventListener('click', () => {
        modalRegistro.style.display = 'none';
    });
}

}); // Fin del DOMContentLoaded