const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── BASE DE DATOS ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined,
  } : false
});

// Inicializar tablas
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL DEFAULT 'vista',
        nombre VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS datos_modulos (
        id SERIAL PRIMARY KEY,
        modulo VARCHAR(50) NOT NULL,
        periodo VARCHAR(10) NOT NULL,
        datos JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(modulo, periodo)
      );
    `);

    // Crear usuarios por defecto si no existen
    const adminExists = await client.query("SELECT id FROM usuarios WHERE username='admin'");
    if (adminExists.rows.length === 0) {
      const hashAdmin = await bcrypt.hash('admin2024', 10);
      const hashMario = await bcrypt.hash('mario2024', 10);
      await client.query(`
        INSERT INTO usuarios (username, password_hash, rol, nombre) VALUES
        ('admin', $1, 'admin', 'Administrador'),
        ('mario', $2, 'vista', 'Mario')
      `, [hashAdmin, hashMario]);
      console.log('Usuarios por defecto creados.');
    }
    console.log('Base de datos inicializada.');
  } finally {
    client.release();
  }
}

// ── AUTH ──
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Datos incompletos' });
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE username=$1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    res.json({ ok: true, username: user.username, rol: user.rol, nombre: user.nombre });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ── DATOS MÓDULOS ──

// Guardar datos de un período
app.post('/api/datos/:modulo', async (req, res) => {
  const { modulo } = req.params;
  const { periodo, datos } = req.body;
  if (!periodo || !datos) return res.status(400).json({ error: 'Faltan datos' });
  try {
    await pool.query(`
      INSERT INTO datos_modulos (modulo, periodo, datos, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (modulo, periodo) DO UPDATE SET datos=$3, updated_at=NOW()
    `, [modulo, periodo, JSON.stringify(datos)]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// Leer todos los períodos de un módulo
app.get('/api/datos/:modulo', async (req, res) => {
  const { modulo } = req.params;
  try {
    const result = await pool.query(
      'SELECT periodo, datos, updated_at FROM datos_modulos WHERE modulo=$1 ORDER BY periodo ASC',
      [modulo]
    );
    const out = {};
    result.rows.forEach(r => { out[r.periodo] = r.datos; });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al leer' });
  }
});

// Borrar un período
app.delete('/api/datos/:modulo/:periodo', async (req, res) => {
  const { modulo, periodo } = req.params;
  try {
    await pool.query('DELETE FROM datos_modulos WHERE modulo=$1 AND periodo=$2', [modulo, periodo]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al borrar' });
  }
});

// Cambiar contraseña
app.post('/api/cambiar-password', async (req, res) => {
  const { username, password_actual, password_nueva } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE username=$1', [username]);
    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const valid = await bcrypt.compare(password_actual, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const hash = await bcrypt.hash(password_nueva, 10);
    await pool.query('UPDATE usuarios SET password_hash=$1 WHERE username=$2', [hash, username]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// ── CHESS ERP INTEGRATION ──

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

app.post('/api/chess/sync', async (req, res) => {
  const { desde, hasta } = req.body;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan fechas' });

  const chessUser = process.env.CHESS_USER || 'aldana';
  const chessPass = process.env.CHESS_PASS;
  if (!chessPass) return res.status(500).json({ error: 'Credenciales Chess no configuradas (CHESS_PASS)' });

  try {
    // 1. Login
    const loginBody = querystring.stringify({ j_username: chessUser, j_password: chessPass });
    const loginRes = await httpsRequest({
      hostname: 'delpalacio.chesserp.com',
      path: '/AR459/static/auth/j_spring_security_check',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(loginBody),
        'Referer': 'https://delpalacio.chesserp.com/AR459/',
        'Origin': 'https://delpalacio.chesserp.com',
      }
    }, loginBody);

    // Extraer cookies de sesión
    const setCookies = loginRes.headers['set-cookie'] || [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

    if (!cookies.includes('JSESSIONID')) {
      return res.status(401).json({ error: 'Login Chess fallido — verificar credenciales' });
    }

    // 2. Obtener datos bancarios
    const dataRes = await httpsRequest({
      hostname: 'delpalacio.chesserp.com',
      path: `/AR459/web/api/conciliacionBancaria/obtenerResumenCuenta?pdtdesde=${desde}&pdthasta=${hasta}&pidCtasBco=10`,
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'Referer': 'https://delpalacio.chesserp.com/AR459/',
        'Accept': 'application/json',
      }
    });

    if (dataRes.status !== 200) {
      return res.status(502).json({ error: `Chess respondió ${dataRes.status}` });
    }

    const data = JSON.parse(dataRes.body);
    res.json({ ok: true, data });

  } catch (err) {
    console.error('Chess sync error:', err);
    res.status(500).json({ error: 'Error al conectar con Chess ERP' });
  }
});

// Servir páginas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'panel.html')));
app.get('/facturacion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'facturacion.html')));
app.get('/cuentas-corrientes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cuentas-corrientes.html')));
app.get('/conciliacion-bancaria', (req, res) => res.sendFile(path.join(__dirname, 'public', 'conciliacion-bancaria.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  try {
    await initDB();
  } catch (err) {
    console.error('Error al inicializar DB:', err.message);
  }
});
