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

    // 6. EXPORTACIÓN PDF (Versión Estable y Completa)
if (btnDescargar) {
    btnDescargar.addEventListener('click', async () => {
        // Obtenemos el ID del paciente desde la tabla
        const idPacActual = document.querySelector(".table-container tbody tr td")?.innerText;
        
        if (!idPacActual) {
            alert("No se detectó un paciente válido en la tabla.");
            return;
        }

        try {
            // 1. Obtener datos del servidor
            const response = await fetch(`/obtener_datos_paciente/${idPacActual}`);
            const data = await response.json();
            
            // 2. Crear un contenedor temporal para el PDF
            const divReporte = document.createElement('div');
            divReporte.style.cssText = "padding: 50px; font-family: Arial, sans-serif; background: white; width: 700px; color: #000;";
            
            // 3. Estructura del reporte (Tabla limpia, sin canvas/gráficos inestables)
            divReporte.innerHTML = `
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #0035c7; margin-bottom: 5px;">BIO_PULSE</h1>
                    <p style="font-size: 14px; color: #555;">Reporte Clínico de Paciente</p>
                </div>
                <div style="border-top: 2px solid #0035c7; padding-top: 20px;">
                    <h2 style="color: #0035c7; font-size: 18px;">Información del Paciente</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>ID:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.id}</td></tr>
                        <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Nombre:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.nombre}</td></tr>
                        <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Edad:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.edad} años</td></tr>
                        <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Sexo:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.sexo}</td></tr>
                        <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Peso:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.peso} kg</td></tr>
                        <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Estatura:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.estatura} m</td></tr>
                    </table>
                </div>
                <div style="margin-top: 60px; text-align: center; color: #999; font-size: 11px;">
                    <p>Reporte generado automáticamente por sistema BIO_PULSE</p>
                </div>
            `;

            // Agregamos al documento para poder renderizarlo
            document.body.appendChild(divReporte);

            // 4. Configuración y Generación del PDF
            const opt = {
                margin: 15,
                filename: `Reporte_${data.id}.pdf`,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { scale: 2, useCORS: true }, 
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            // Ejecutamos la descarga
            await html2pdf().set(opt).from(divReporte).save();
            
            // Limpiamos el DOM eliminando el contenedor temporal
            document.body.removeChild(divReporte);

        } catch (err) {
            console.error(err);
            alert("Hubo un error al generar el PDF. Asegúrate de que el servidor esté respondiendo.");
        }
    });
}
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