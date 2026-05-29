# --- 1. PRIMERO: El parcheo de Gevent (SOLO UNA VEZ) ---
import gevent.monkey
gevent.monkey.patch_all()

# --- 2. LUEGO: Los demás imports ---
from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO
from datetime import datetime
import pg8000
import ssl
import os
from flask import jsonify

app = Flask(__name__)
app.secret_key = 'clave_secreta_super_segura_para_el_equipo_bio'
CONTRASENA_ACCESO = "BioPulse2026"

# --- CONFIGURACIÓN DE SOCKETIO (CORREGIDA) ---
# Usamos 'gevent' para que coincida con el worker de gunicorn en Render
# Busca donde declaras 'socketio' y cámbialo a esto:
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')
# ... (El resto de tu código igual, sin el bloque try/except de gevent)

# ==========================================================================
# BASE DE DATOS (NEON.TECH)
# ==========================================================================
def get_db_connection():
    return pg8000.connect(
        user="neondb_owner",
        password="npg_bQj35fMCUcED",
        host="ep-dry-haze-apb62i16-pooler.c-7.us-east-1.aws.neon.tech",
        port=5432,
        database="neondb",
        ssl_context=ssl.create_default_context()
    )

def init_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pacientes (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                edad INTEGER,
                sexo TEXT,
                peso REAL,
                estatura REAL,
                fecha_registro TEXT
            )
        ''')
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error al inicializar DB: {e}")

# Llamamos a la DB al iniciar, pero envuelto en un try por seguridad en despliegue
    init_db()
@app.route('/obtener_datos_paciente/<id_paciente>', methods=['GET'])
def obtener_datos_paciente(id_paciente):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Buscamos los datos en la tabla que ya tienes
        cursor.execute("SELECT id, nombre, edad, sexo, peso, estatura FROM pacientes WHERE id = %s", (id_paciente,))
        paciente = cursor.fetchone()
        cursor.close()
        conn.close()

        if paciente:
            # Retornamos los datos como un objeto JSON
            return jsonify({
                "id": paciente[0],
                "nombre": paciente[1],
                "edad": paciente[2],
                "sexo": paciente[3],
                "peso": paciente[4],
                "estatura": paciente[5]
            })
        else:
            return jsonify({"error": "Paciente no encontrado"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================================================
# LÓGICA DE SOCKETS
# ==========================================================================
@socketio.on('datos_procesados')
def handle_datos_procesados(data):
    """Recibe datos del procesador (tu PC) y los reenvía a la web (navegadores)."""
    socketio.emit('datos_ecg', data)

@socketio.on('connect')
def handle_connect():
    print("Cliente conectado al servidor.")
    socketio.emit('estado_sensor', {'conectado': True})

# ==========================================================================
# RUTAS FLASK
# ==========================================================================
@app.route('/', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        if request.form.get('password') == CONTRASENA_ACCESO:
            session['autenticado'] = True
            return redirect(url_for('interfaz'))
        error = "Contraseña incorrecta."
    return render_template('login.html', error=error)

@app.route('/interfaz')
def interfaz():
    if not session.get('autenticado'): return redirect(url_for('login'))
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre, edad, sexo, peso, estatura, fecha_registro FROM pacientes ORDER BY fecha_registro DESC LIMIT 1")
    lista_pacientes = cursor.fetchall()
    conn.close()
    return render_template('index.html', pacientes=lista_pacientes)

@app.route('/registrar_paciente', methods=['POST'])
def registrar_paciente():
    if not session.get('autenticado'): return redirect(url_for('login'))
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''INSERT INTO pacientes VALUES (%s, %s, %s, %s, %s, %s, %s)''', 
                       (request.form['id_paciente'], request.form['nombre'], request.form['edad'], 
                        request.form['sexo'], request.form['peso'], request.form['estatura'], 
                        datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
    except: conn.rollback()
    finally: conn.close()
    return redirect(url_for('interfaz'))

@app.route('/logout')
def logout():
    session.pop('autenticado', None)
    return redirect(url_for('login'))

# ==========================================================================
# ARRANQUE
# ==========================================================================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Servidor BIO_PULSE iniciado en puerto {port}...")
    socketio.run(app, host='0.0.0.0', port=port, debug=False)