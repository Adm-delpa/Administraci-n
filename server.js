const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── MIDDLEWARE DE ACTIVIDAD AUTOMÁTICA ──
// Mapeo de rutas → descripción legible. Nuevos módulos solo necesitan agregarse aquí.
const ROUTE_LABELS = {
  'POST /api/login':                            null, // login se registra por separado con accion 'login'
  'POST /api/log':                              null, // evitar recursión
  'POST /api/pendientes-acreditacion':          { accion: 'pendiente_cargado',    label: (b) => `Cargó pendiente: ${b.concepto} ($${b.importe})` },
  'PUT /api/pendientes-acreditacion/:id/confirmar': { accion: 'pendiente_confirmado', label: (b,p) => `Confirmó pendiente #${p.id}` },
  'POST /api/chess/saldos':                     { accion: 'chess_cc_import',        label: () => `Importó saldos desde Chess ERP (cuentas corrientes)` },
  'POST /api/chess/sync':                       { accion: 'chess_import',           label: (b) => `Importó Chess ERP (${b.desde} al ${b.hasta})` },
  'POST /api/tickets':                          { accion: 'ticket_creado',          label: (b) => `Creó ticket: ${b.titulo}` },
  'PUT /api/tickets/:id/proceso':               { accion: 'ticket_en_proceso',     label: (b,p) => `Pasó ticket #${p.id} a en proceso` },
  'POST /api/tickets/:id/notas':                { accion: 'ticket_nota',           label: (b,p) => `Nota en ticket #${p.id}: ${(b.texto||'').slice(0,80)}` },
  'PUT /api/tickets/:id/finalizar':             { accion: 'ticket_finalizado',     label: (b,p) => `Finalizó ticket #${p.id} (${b.resuelto?'resuelto':'no resuelto'})` },
};

function matchRoute(method, url) {
  const path = url.split('?')[0];
  for (const key of Object.keys(ROUTE_LABELS)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
    const match = path.match(regex);
    if (match) {
      const paramNames = [...pattern.matchAll(/:([^/]+)/g)].map(x => x[1]);
      const params = {};
      paramNames.forEach((n, i) => { params[n] = match[i + 1]; });
      return { config: ROUTE_LABELS[key], params };
    }
  }
  return null;
}

app.use((req, res, next) => {
  if (!['POST','PUT','DELETE'].includes(req.method)) return next();
  const matched = matchRoute(req.method, req.url);
  if (!matched || matched.config === null) return next();
  const { config, params } = matched;
  const origJson = res.json.bind(res);
  res.json = function(data) {
    if (res.statusCode < 300) {
      const body = req.body || {};
      const username = body.username || body.adminUsername;
      const nombre = body.nombre || null;
      if (username && config) {
        try {
          const detalle = config.label(body, params);
          pool.query('INSERT INTO activity_log (username, nombre, accion, detalle) VALUES ($1,$2,$3,$4)',
            [username, nombre, config.accion, detalle]).catch(() => {});
        } catch(e) {}
      }
    }
    return origJson(data);
  };
  next();
});

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

      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS modulos JSONB DEFAULT NULL;
      DO $$ BEGIN
        IF (SELECT data_type FROM information_schema.columns WHERE table_name='usuarios' AND column_name='modulos') = 'ARRAY' THEN
          ALTER TABLE usuarios ALTER COLUMN modulos TYPE JSONB USING NULL;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS datos_modulos (
        id SERIAL PRIMARY KEY,
        modulo VARCHAR(50) NOT NULL,
        periodo VARCHAR(10) NOT NULL,
        datos JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(modulo, periodo)
      );

      CREATE TABLE IF NOT EXISTS pendientes_acreditacion (
        id SERIAL PRIMARY KEY,
        concepto VARCHAR(200) NOT NULL,
        importe NUMERIC(14,2) NOT NULL,
        detalle TEXT,
        cargado_por VARCHAR(50) NOT NULL,
        cargado_por_nombre VARCHAR(100),
        cargado_at TIMESTAMP DEFAULT NOW(),
        confirmado_por VARCHAR(50),
        confirmado_por_nombre VARCHAR(100),
        confirmado_at DATE,
        estado VARCHAR(20) DEFAULT 'pendiente'
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        nombre VARCHAR(100),
        accion VARCHAR(100) NOT NULL,
        detalle TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS modulo_visto (
        username VARCHAR(50) NOT NULL,
        modulo VARCHAR(50) NOT NULL,
        last_seen_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (username, modulo)
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL,
        titulo VARCHAR(200) NOT NULL,
        descripcion TEXT,
        num_cliente VARCHAR(50),
        nombre_cliente VARCHAR(200),
        alta_nombre VARCHAR(100),
        alta_telefono VARCHAR(50),
        alta_direccion VARCHAR(200),
        alta_localidad VARCHAR(100),
        alta_rubro VARCHAR(100),
        asignado_a VARCHAR(50),
        asignado_a_nombre VARCHAR(100),
        cargado_por VARCHAR(50) NOT NULL,
        cargado_por_nombre VARCHAR(100),
        cargado_at TIMESTAMP DEFAULT NOW(),
        estado VARCHAR(20) DEFAULT 'abierto',
        en_proceso_at TIMESTAMP,
        resuelto BOOLEAN,
        motivo_cierre TEXT,
        cerrado_por VARCHAR(50),
        cerrado_por_nombre VARCHAR(100),
        cerrado_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ticket_notas (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        texto TEXT NOT NULL,
        autor VARCHAR(50) NOT NULL,
        autor_nombre VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
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
    const result = await pool.query('SELECT * FROM usuarios WHERE LOWER(username)=LOWER($1)', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    res.json({ ok: true, username: user.username, rol: user.rol, nombre: user.nombre, modulos: user.modulos || null });
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

// ── ADMIN USUARIOS ──

async function esAdmin(username) {
  const r = await pool.query("SELECT rol FROM usuarios WHERE username=$1", [username]);
  return r.rows.length > 0 && r.rows[0].rol === 'admin';
}

app.get('/api/usuarios', async (req, res) => {
  const adminUsername = req.headers['x-admin'];
  if (!adminUsername || !(await esAdmin(adminUsername))) return res.status(403).json({ error: 'Sin permiso' });
  try {
    const r = await pool.query('SELECT id, username, nombre, rol, modulos, created_at FROM usuarios ORDER BY created_at ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error al listar usuarios' }); }
});

app.post('/api/usuarios', async (req, res) => {
  const { adminUsername, nombre, username, password, rol } = req.body;
  if (!adminUsername || !(await esAdmin(adminUsername))) return res.status(403).json({ error: 'Sin permiso' });
  if (!nombre || !username || !password || !rol) return res.status(400).json({ error: 'Faltan datos' });
  if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO usuarios (username, password_hash, rol, nombre) VALUES ($1,$2,$3,$4)', [username, hash, rol, nombre]);
    res.json({ ok: true });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.put('/api/usuarios/:username', async (req, res) => {
  const { adminUsername, nombre, newUsername } = req.body;
  const { username } = req.params;
  if (!adminUsername || !(await esAdmin(adminUsername))) return res.status(403).json({ error: 'Sin permiso' });
  if (!nombre && !newUsername) return res.status(400).json({ error: 'Nada que actualizar' });
  try {
    if (newUsername && newUsername !== username) {
      const exists = await pool.query('SELECT id FROM usuarios WHERE username=$1', [newUsername]);
      if (exists.rows.length) return res.status(400).json({ error: 'El usuario ya existe' });
      await pool.query('UPDATE usuarios SET username=$1, nombre=$2 WHERE username=$3', [newUsername, nombre||null, username]);
    } else {
      await pool.query('UPDATE usuarios SET nombre=$1 WHERE username=$2', [nombre||null, username]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al actualizar usuario' }); }
});

app.put('/api/usuarios/:username/modulos', async (req, res) => {
  const { adminUsername, modulos } = req.body;
  const { username } = req.params;
  if (!adminUsername || !(await esAdmin(adminUsername))) return res.status(403).json({ error: 'Sin permiso' });
  try {
    await pool.query('UPDATE usuarios SET modulos=$1 WHERE username=$2', [modulos ? JSON.stringify(modulos) : null, username]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al actualizar módulos' }); }
});

app.post('/api/usuarios/reset-password', async (req, res) => {
  const { adminUsername, targetUsername, nuevaPassword } = req.body;
  if (!adminUsername || !(await esAdmin(adminUsername))) return res.status(403).json({ error: 'Sin permiso' });
  if (!targetUsername || !nuevaPassword) return res.status(400).json({ error: 'Faltan datos' });
  if (nuevaPassword.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });
  try {
    const hash = await bcrypt.hash(nuevaPassword, 10);
    const r = await pool.query('UPDATE usuarios SET password_hash=$1 WHERE username=$2', [hash, targetUsername]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al resetear contraseña' }); }
});

// helper interno de log
async function log(username, nombre, accion, detalle) {
  try { await pool.query('INSERT INTO activity_log (username, nombre, accion, detalle) VALUES ($1,$2,$3,$4)', [username, nombre||null, accion, detalle||null]); } catch(e) {}
}

// ── PENDIENTES ACREDITACIÓN ──

app.get('/api/pendientes-acreditacion', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM pendientes_acreditacion ORDER BY estado ASC, cargado_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error al leer' }); }
});

app.post('/api/pendientes-acreditacion', async (req, res) => {
  const { concepto, importe, detalle, username, nombre } = req.body;
  if (!concepto || !importe || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'INSERT INTO pendientes_acreditacion (concepto, importe, detalle, cargado_por, cargado_por_nombre) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [concepto, importe, detalle||null, username, nombre||username]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al guardar' }); }
});

app.put('/api/pendientes-acreditacion/:id/confirmar', async (req, res) => {
  const { username, nombre } = req.body;
  const { id } = req.params;
  if (!username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'UPDATE pendientes_acreditacion SET estado=$1, confirmado_por=$2, confirmado_por_nombre=$3, confirmado_at=CURRENT_DATE WHERE id=$4 RETURNING *',
      ['confirmado', username, nombre||username, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al confirmar' }); }
});

app.delete('/api/pendientes-acreditacion/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pendientes_acreditacion WHERE id=$1 AND estado=$2', [id, 'pendiente']);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al borrar' }); }
});

// ── TICKETS ──

app.get('/api/tickets', async (req, res) => {
  const { estado, tipo, asignado } = req.query;
  try {
    let where = [];
    let params = [];
    if (estado) { params.push(estado); where.push(`estado=$${params.length}`); }
    if (tipo) { params.push(tipo); where.push(`tipo=$${params.length}`); }
    if (asignado) { params.push(asignado); where.push(`asignado_a=$${params.length}`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM tickets ${whereClause} ORDER BY cargado_at DESC`, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error al leer tickets' }); }
});

app.get('/api/tickets/:id', async (req, res) => {
  try {
    const t = await pool.query('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const notas = await pool.query('SELECT * FROM ticket_notas WHERE ticket_id=$1 ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...t.rows[0], notas: notas.rows });
  } catch(e) { res.status(500).json({ error: 'Error al leer ticket' }); }
});

app.post('/api/tickets', async (req, res) => {
  const { tipo, titulo, descripcion, num_cliente, nombre_cliente,
          alta_nombre, alta_telefono, alta_direccion, alta_localidad, alta_rubro,
          asignado_a, asignado_a_nombre, username, nombre } = req.body;
  if (!tipo || !titulo || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(`
      INSERT INTO tickets (tipo, titulo, descripcion, num_cliente, nombre_cliente,
        alta_nombre, alta_telefono, alta_direccion, alta_localidad, alta_rubro,
        asignado_a, asignado_a_nombre, cargado_por, cargado_por_nombre)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [tipo, titulo, descripcion||null, num_cliente||null, nombre_cliente||null,
       alta_nombre||null, alta_telefono||null, alta_direccion||null, alta_localidad||null, alta_rubro||null,
       asignado_a||null, asignado_a_nombre||null, username, nombre||username]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al crear ticket' }); }
});

app.put('/api/tickets/:id/proceso', async (req, res) => {
  const { username, nombre } = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE tickets SET estado='en_proceso', en_proceso_at=NOW() WHERE id=$1 AND estado='abierto' RETURNING *`,
      [req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'No se puede cambiar estado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al actualizar' }); }
});

app.post('/api/tickets/:id/notas', async (req, res) => {
  const { texto, username, nombre } = req.body;
  if (!texto || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'INSERT INTO ticket_notas (ticket_id, texto, autor, autor_nombre) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, texto, username, nombre||username]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al guardar nota' }); }
});

app.put('/api/tickets/:id/finalizar', async (req, res) => {
  const { resuelto, motivo_cierre, username, nombre } = req.body;
  if (resuelto === undefined || !motivo_cierre || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      `UPDATE tickets SET estado='finalizado', resuelto=$1, motivo_cierre=$2,
       cerrado_por=$3, cerrado_por_nombre=$4, cerrado_at=NOW()
       WHERE id=$5 AND estado='en_proceso' RETURNING *`,
      [resuelto, motivo_cierre, username, nombre||username, req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'No se puede finalizar' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al finalizar' }); }
});

app.get('/api/usuarios-lista', async (req, res) => {
  try {
    const r = await pool.query('SELECT username, nombre FROM usuarios ORDER BY nombre ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// ── NOVEDADES (notificaciones por módulo) ──

app.get('/api/novedades/pendientes', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Falta username' });
  try {
    // Buscar el last_seen del usuario para este módulo
    const visto = await pool.query(
      'SELECT last_seen_at FROM modulo_visto WHERE username=$1 AND modulo=$2',
      [username, 'pendientes-acreditacion']
    );
    const lastSeen = visto.rows.length ? visto.rows[0].last_seen_at : null;

    // Contar items más nuevos que su last_seen (tanto cargados como confirmados)
    let count = 0;
    if (!lastSeen) {
      // Nunca entró: cualquier item es novedad
      const r = await pool.query('SELECT COUNT(*) FROM pendientes_acreditacion');
      count = parseInt(r.rows[0].count);
    } else {
      const r = await pool.query(
        `SELECT COUNT(*) FROM pendientes_acreditacion
         WHERE cargado_at > $1
            OR (confirmado_at IS NOT NULL AND confirmado_at::timestamp > $1)`,
        [lastSeen]
      );
      count = parseInt(r.rows[0].count);
    }
    res.json({ novedades: count });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Error al consultar novedades' });
  }
});

app.post('/api/novedades/pendientes/marcar-visto', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Falta username' });
  try {
    await pool.query(
      `INSERT INTO modulo_visto (username, modulo, last_seen_at) VALUES ($1, $2, NOW())
       ON CONFLICT (username, modulo) DO UPDATE SET last_seen_at=NOW()`,
      [username, 'pendientes-acreditacion']
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Error al marcar visto' });
  }
});

// ── ACTIVITY LOG ──

app.post('/api/log', async (req, res) => {
  const { username, nombre, accion, detalle } = req.body;
  if (!username || !accion) return res.status(400).json({ error: 'Faltan datos' });
  try {
    await pool.query('INSERT INTO activity_log (username, nombre, accion, detalle) VALUES ($1,$2,$3,$4)', [username, nombre||null, accion, detalle||null]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Error al guardar log' });
  }
});

app.get('/api/log', async (req, res) => {
  const adminUsername = req.headers['x-admin'];
  if (!adminUsername || !(await esAdmin(adminUsername))) return res.status(403).json({ error: 'Sin permiso' });
  const { usuario, desde, hasta, limit } = req.query;
  try {
    let where = [];
    let params = [];
    if (usuario) { params.push(usuario); where.push(`username=$${params.length}`); }
    if (desde) { params.push(desde); where.push(`created_at >= $${params.length}::date`); }
    if (hasta) { params.push(hasta); where.push(`created_at < ($${params.length}::date + interval '1 day')`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const lim = Math.min(parseInt(limit)||200, 500);
    const r = await pool.query(`SELECT id, username, nombre, accion, detalle, created_at FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT ${lim}`, params);
    res.json(r.rows);
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Error al leer log' });
  }
});

// ── FERIADOS ARGENTINA ──

app.get('/api/feriados/:year', async (req, res) => {
  const { year } = req.params;
  try {
    const result = await httpsRequest({
      hostname: 'api.argentinadatos.com',
      path: `/v1/feriados/${year}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data = JSON.parse(result.body);
    // Devolver solo las fechas como array de strings YYYY-MM-DD
    const fechas = data.map(f => f.fecha).filter(Boolean);
    res.json({ ok: true, feriados: fechas });
  } catch(e) {
    console.error('Error feriados:', e);
    res.status(500).json({ error: 'No se pudieron obtener los feriados' });
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

    let parsed;
    try { parsed = JSON.parse(dataRes.body); } catch(e) { return res.status(502).json({ error: 'Respuesta Chess inválida' }); }
    const movimientos = parsed.ttresubco || [];
    res.json({ ok: true, data: movimientos });

  } catch (err) {
    console.error('Chess sync error:', err);
    res.status(500).json({ error: 'Error al conectar con Chess ERP' });
  }
});

app.post('/api/chess/saldos', async (req, res) => {
  const chessUser = process.env.CHESS_USER || 'aldana';
  const chessPass = process.env.CHESS_PASS;
  if (!chessPass) return res.status(500).json({ error: 'Credenciales Chess no configuradas (CHESS_PASS)' });

  try {
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

    const setCookies = loginRes.headers['set-cookie'] || [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');
    if (!cookies.includes('JSESSIONID')) return res.status(401).json({ error: 'Login Chess fallido' });

    const dataRes = await httpsRequest({
      hostname: 'delpalacio.chesserp.com',
      path: '/AR459/web/api/saldoTotalDeudores/ObtenerSaldoTotalDeudores?pcEmp=0&pcSuc=1,%202&piLineaCredito=1&pdFec=null&pcDocs=-1&plactual=true',
      method: 'GET',
      headers: { 'Cookie': cookies, 'Referer': 'https://delpalacio.chesserp.com/AR459/', 'Accept': 'application/json' }
    });

    let parsed;
    try { parsed = JSON.parse(dataRes.body); } catch(e) { return res.status(502).json({ error: 'Respuesta Chess inválida' }); }
    res.json({ ok: true, data: parsed.ttsaldototaldeudores || [] });
  } catch(err) {
    console.error('Chess saldos error:', err);
    res.status(500).json({ error: 'Error al conectar con Chess ERP' });
  }
});

// Servir páginas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'panel.html')));
app.get('/facturacion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'facturacion.html')));
app.get('/cuentas-corrientes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cuentas-corrientes.html')));
app.get('/conciliacion-bancaria', (req, res) => res.sendFile(path.join(__dirname, 'public', 'conciliacion-bancaria.html')));
app.get('/actividad', (req, res) => res.sendFile(path.join(__dirname, 'public', 'actividad.html')));
app.get('/pendientes-acreditacion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pendientes-acreditacion.html')));
app.get('/tickets', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tickets.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  try {
    await initDB();
  } catch (err) {
    console.error('Error al inicializar DB:', err.message);
  }
});
