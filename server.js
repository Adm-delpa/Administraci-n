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
        estado VARCHAR(20) DEFAULT 'pendiente',
        importe_real NUMERIC(14,2)
      );
      CREATE TABLE IF NOT EXISTS pendientes_acreditacion_notas (
        id SERIAL PRIMARY KEY,
        pendiente_id INTEGER REFERENCES pendientes_acreditacion(id) ON DELETE CASCADE,
        texto TEXT NOT NULL,
        username VARCHAR(50) NOT NULL,
        nombre VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE pendientes_acreditacion ADD COLUMN IF NOT EXISTS importe_real NUMERIC(14,2);

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
        alta_fantasia VARCHAR(200),
        alta_direccion VARCHAR(200),
        alta_localidad VARCHAR(100),
        alta_rubro VARCHAR(100),
        chq_motivo VARCHAR(100),
        chq_banco VARCHAR(100),
        chq_suc VARCHAR(50),
        chq_numero VARCHAR(100),
        chq_fecha_conf DATE,
        chq_fecha_cobro DATE,
        chq_importe NUMERIC(14,2),
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

      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS alta_fantasia VARCHAR(200);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_motivo VARCHAR(100);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_banco VARCHAR(100);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_suc VARCHAR(50);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_numero VARCHAR(100);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_fecha_conf DATE;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_fecha_cobro DATE;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_importe NUMERIC(14,2);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cierre_imagen TEXT;

      CREATE TABLE IF NOT EXISTS ticket_notas (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        texto TEXT NOT NULL,
        autor VARCHAR(50) NOT NULL,
        autor_nombre VARCHAR(100),
        imagen TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE ticket_notas ADD COLUMN IF NOT EXISTS imagen TEXT;
      ALTER TABLE tareas ADD COLUMN IF NOT EXISTS descripcion TEXT;
      ALTER TABLE tareas ADD COLUMN IF NOT EXISTS dia_semana INTEGER;
      ALTER TABLE tareas ADD COLUMN IF NOT EXISTS completada BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS tareas_categorias (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        color TEXT DEFAULT '#1E6FD9',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tareas (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        prioridad TEXT DEFAULT 'Media',
        tipo TEXT DEFAULT 'diaria',
        fecha_inicio TEXT,
        dia_del_mes INTEGER,
        proxima_fecha TEXT,
        responsable TEXT DEFAULT 'cualquiera',
        categoria_id INTEGER REFERENCES tareas_categorias(id) ON DELETE SET NULL,
        descripcion TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tareas_subtareas (
        id SERIAL PRIMARY KEY,
        tarea_id INTEGER REFERENCES tareas(id) ON DELETE CASCADE,
        texto TEXT NOT NULL,
        orden INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tareas_historial (
        id SERIAL PRIMARY KEY,
        tarea_id INTEGER,
        nombre_tarea TEXT NOT NULL,
        fecha TEXT NOT NULL,
        hora TEXT,
        persona TEXT NOT NULL,
        tipo TEXT,
        responsable_tarea TEXT,
        a_tiempo BOOLEAN DEFAULT true,
        dias_atraso INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tareas_subtareas_estado (
        subtarea_id INTEGER REFERENCES tareas_subtareas(id) ON DELETE CASCADE,
        fecha TEXT NOT NULL,
        completada BOOLEAN DEFAULT false,
        PRIMARY KEY (subtarea_id, fecha)
      );

      CREATE TABLE IF NOT EXISTS cuentas_pagar (
        id SERIAL PRIMARY KEY,
        acreencia VARCHAR(50),
        razon_social VARCHAR(200) NOT NULL,
        comprobante VARCHAR(100) NOT NULL,
        fecha DATE,
        cuotas VARCHAR(50),
        vence DATE,
        total NUMERIC(14,2) DEFAULT 0,
        pagado NUMERIC(14,2) DEFAULT 0,
        saldo NUMERIC(14,2) DEFAULT 0,
        vencido BOOLEAN DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS cuentas_pagar_sync (
        id SERIAL PRIMARY KEY,
        archivo VARCHAR(200),
        filas INTEGER,
        subido_por VARCHAR(100),
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
    const notas = await pool.query('SELECT * FROM pendientes_acreditacion_notas ORDER BY created_at ASC');
    const notasMap = {};
    notas.rows.forEach(n => { if(!notasMap[n.pendiente_id]) notasMap[n.pendiente_id]=[]; notasMap[n.pendiente_id].push(n); });
    res.json(r.rows.map(row => ({ ...row, notas: notasMap[row.id] || [] })));
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
  const { username, nombre, importe_real } = req.body;
  const { id } = req.params;
  if (!username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'UPDATE pendientes_acreditacion SET estado=$1, confirmado_por=$2, confirmado_por_nombre=$3, confirmado_at=CURRENT_DATE, importe_real=$5 WHERE id=$4 RETURNING *',
      ['confirmado', username, nombre||username, id, importe_real||null]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al confirmar' }); }
});

app.post('/api/pendientes-acreditacion/:id/notas', async (req, res) => {
  const { texto, username, nombre } = req.body;
  const { id } = req.params;
  if (!texto || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'INSERT INTO pendientes_acreditacion_notas (pendiente_id, texto, username, nombre) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, texto, username, nombre||username]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al guardar nota' }); }
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
    if (estado) { params.push(estado); where.push(`t.estado=$${params.length}`); }
    if (tipo) { params.push(tipo); where.push(`t.tipo=$${params.length}`); }
    if (asignado) { params.push(asignado); where.push(`t.asignado_a=$${params.length}`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const r = await pool.query(`
      SELECT t.*,
        GREATEST(
          t.cargado_at,
          t.en_proceso_at,
          (SELECT MAX(n.created_at) FROM ticket_notas n WHERE n.ticket_id = t.id)
        ) AS ultimo_movimiento
      FROM tickets t ${whereClause} ORDER BY t.cargado_at DESC`, params);
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
          alta_nombre, alta_telefono, alta_fantasia, alta_direccion, alta_localidad, alta_rubro,
          chq_motivo, chq_banco, chq_suc, chq_numero, chq_fecha_conf, chq_fecha_cobro, chq_importe,
          asignado_a, asignado_a_nombre, username, nombre } = req.body;
  if (!tipo || !titulo || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(`
      INSERT INTO tickets (tipo, titulo, descripcion, num_cliente, nombre_cliente,
        alta_nombre, alta_telefono, alta_fantasia, alta_direccion, alta_localidad, alta_rubro,
        chq_motivo, chq_banco, chq_suc, chq_numero, chq_fecha_conf, chq_fecha_cobro, chq_importe,
        asignado_a, asignado_a_nombre, cargado_por, cargado_por_nombre)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [tipo, titulo, descripcion||null, num_cliente||null, nombre_cliente||null,
       alta_nombre||null, alta_telefono||null, alta_fantasia||null, alta_direccion||null, alta_localidad||null, alta_rubro||null,
       chq_motivo||null, chq_banco||null, chq_suc||null, chq_numero||null, chq_fecha_conf||null, chq_fecha_cobro||null, chq_importe||null,
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
  const { texto, username, nombre, imagen } = req.body;
  if (!texto || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'INSERT INTO ticket_notas (ticket_id, texto, autor, autor_nombre, imagen) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, texto, username, nombre||username, imagen||null]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al guardar nota' }); }
});

app.put('/api/tickets/:id/finalizar', async (req, res) => {
  const { resuelto, motivo_cierre, username, nombre, cierre_imagen } = req.body;
  if (resuelto === undefined || !motivo_cierre || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      `UPDATE tickets SET estado='finalizado', resuelto=$1, motivo_cierre=$2,
       cerrado_por=$3, cerrado_por_nombre=$4, cerrado_at=NOW(), cierre_imagen=$6
       WHERE id=$5 AND estado='en_proceso' RETURNING *`,
      [resuelto, motivo_cierre, username, nombre||username, req.params.id, cierre_imagen||null]);
    if (!r.rows.length) return res.status(400).json({ error: 'No se puede finalizar' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al finalizar' }); }
});

app.delete('/api/tickets/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tickets WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al eliminar' }); }
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

// ── TAREAS ──

// Usuarios con acceso al módulo administracion
app.get('/api/usuarios/con-acceso/administracion', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT username, nombre FROM usuarios
      WHERE rol='admin' OR (modulos IS NOT NULL AND modulos->>'administracion' IS NOT NULL)
      ORDER BY nombre ASC
    `);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// Categorías
app.get('/api/tareas/categorias', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM tareas_categorias ORDER BY nombre ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/tareas/categorias', async (req, res) => {
  const { nombre, color } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  try {
    const r = await pool.query('INSERT INTO tareas_categorias (nombre, color) VALUES ($1,$2) RETURNING *', [nombre, color||'#1E6FD9']);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

app.delete('/api/tareas/categorias/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tareas_categorias WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// Historial
app.get('/api/tareas/historial', async (req, res) => {
  const { persona, desde, hasta } = req.query;
  try {
    let where = [];
    let params = [];
    if (persona) { params.push(persona); where.push(`h.persona=$${params.length}`); }
    if (desde) { params.push(desde); where.push(`h.fecha >= $${params.length}`); }
    if (hasta) { params.push(hasta); where.push(`h.fecha <= $${params.length}`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const r = await pool.query(`
      SELECT h.*, tc.nombre AS categoria_nombre, tc.color AS categoria_color
      FROM tareas_historial h
      LEFT JOIN tareas t ON t.id = h.tarea_id
      LEFT JOIN tareas_categorias tc ON tc.id = t.categoria_id
      ${whereClause}
      ORDER BY h.fecha DESC, h.hora DESC
      LIMIT 500
    `, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// DELETE historial completo
app.delete('/api/tareas/historial', async (req, res) => {
  try {
    await pool.query('DELETE FROM tareas_historial');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Tareas atrasadas count
app.get('/api/tareas/atrasadas/count', async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0,10);
    // diarias: sin historial hoy
    const diarias = await pool.query(`
      SELECT COUNT(*) FROM tareas t
      WHERE t.tipo='diaria'
        AND (t.fecha_inicio IS NULL OR t.fecha_inicio <= $1)
        AND NOT EXISTS (
          SELECT 1 FROM tareas_historial h WHERE h.tarea_id=t.id AND h.fecha=$1
        )
    `, [hoy]);
    // mensuales/semanales/unicas: proxima_fecha vencida o unica sin completar y vencida
    const otras = await pool.query(`
      SELECT COUNT(*) FROM tareas WHERE
        (tipo='mensual' AND proxima_fecha < $1) OR
        (tipo='semanal' AND proxima_fecha < $1) OR
        (tipo='unica' AND proxima_fecha < $1 AND (completada IS NULL OR completada=false))
    `, [hoy]);
    const count = parseInt(diarias.rows[0].count) + parseInt(otras.rows[0].count);
    res.json({ count });
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// GET todas las tareas
app.get('/api/tareas', async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0,10);
    const tareas = await pool.query(`
      SELECT t.*,
        tc.nombre AS categoria_nombre,
        tc.color AS categoria_color,
        ult.fecha AS ultimo_fecha,
        ult.persona AS ultimo_persona,
        ult.hora AS ultimo_hora
      FROM tareas t
      LEFT JOIN tareas_categorias tc ON tc.id = t.categoria_id
      LEFT JOIN LATERAL (
        SELECT fecha, persona, hora FROM tareas_historial
        WHERE tarea_id = t.id
        ORDER BY fecha DESC, hora DESC
        LIMIT 1
      ) ult ON true
      ORDER BY
        CASE t.prioridad WHEN 'Alta' THEN 1 WHEN 'Media' THEN 2 ELSE 3 END,
        t.nombre ASC
    `);

    const subtareas = await pool.query(`
      SELECT s.*, COALESCE(e.completada, false) AS completada_hoy
      FROM tareas_subtareas s
      LEFT JOIN tareas_subtareas_estado e ON e.subtarea_id=s.id AND e.fecha=$1
      ORDER BY s.tarea_id, s.orden, s.id
    `, [hoy]);

    const subMap = {};
    subtareas.rows.forEach(s => {
      if (!subMap[s.tarea_id]) subMap[s.tarea_id] = [];
      subMap[s.tarea_id].push(s);
    });

    const result = tareas.rows.map(t => ({
      ...t,
      subtareas: subMap[t.id] || []
    }));

    res.json(result);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// POST crear tarea
app.post('/api/tareas', async (req, res) => {
  const { nombre, prioridad, tipo, fecha_inicio, dia_del_mes, dia_semana, proxima_fecha, responsable, categoria_id, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  try {
    const r = await pool.query(`
      INSERT INTO tareas (nombre, prioridad, tipo, fecha_inicio, dia_del_mes, dia_semana, proxima_fecha, responsable, categoria_id, descripcion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [nombre, prioridad||'Media', tipo||'diaria', fecha_inicio||null, dia_del_mes||null, dia_semana||null, proxima_fecha||null, responsable||'cualquiera', categoria_id||null, descripcion||null]);
    res.json(r.rows[0]);
  } catch(e) { console.error('POST /api/tareas error:', e.message); res.status(500).json({ error: e.message }); }
});

// PUT actualizar tarea
app.put('/api/tareas/:id', async (req, res) => {
  const { nombre, prioridad, tipo, fecha_inicio, dia_del_mes, dia_semana, proxima_fecha, responsable, categoria_id, descripcion } = req.body;
  const { id } = req.params;
  try {
    const r = await pool.query(`
      UPDATE tareas SET nombre=$1, prioridad=$2, tipo=$3, fecha_inicio=$4, dia_del_mes=$5, dia_semana=$6, proxima_fecha=$7, responsable=$8, categoria_id=$9, descripcion=$10, completada=false
      WHERE id=$10 RETURNING *
    `, [nombre, prioridad||'Media', tipo||'diaria', fecha_inicio||null, dia_del_mes||null, dia_semana||null, proxima_fecha||null, responsable||'cualquiera', categoria_id||null, descripcion||null, id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch(e) { console.error('PUT /api/tareas error:', e.message); res.status(500).json({ error: e.message }); }
});

// DELETE tarea
app.delete('/api/tareas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tareas WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// POST completar tarea
app.post('/api/tareas/:id/completar', async (req, res) => {
  const { persona, hoy } = req.body;
  const { id } = req.params;
  if (!persona || !hoy) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const tr = await pool.query('SELECT * FROM tareas WHERE id=$1', [id]);
    if (!tr.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const tarea = tr.rows[0];
    const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // Calcular a_tiempo y dias_atraso
    let a_tiempo = true;
    let dias_atraso = 0;
    if (tarea.tipo === 'diaria') {
      const inicio = tarea.fecha_inicio;
      if (inicio && hoy > inicio) {
        // Verificar si ya se hizo ayer (último registro)
        const ult = await pool.query('SELECT fecha FROM tareas_historial WHERE tarea_id=$1 ORDER BY fecha DESC, hora DESC LIMIT 1', [id]);
        if (ult.rows.length) {
          const ultFecha = ult.rows[0].fecha;
          const diff = Math.floor((new Date(hoy) - new Date(ultFecha)) / 86400000);
          if (diff > 1) { a_tiempo = false; dias_atraso = diff - 1; }
        }
      }
    } else if (tarea.tipo === 'mensual') {
      if (tarea.proxima_fecha && hoy > tarea.proxima_fecha) {
        a_tiempo = false;
        dias_atraso = Math.floor((new Date(hoy) - new Date(tarea.proxima_fecha)) / 86400000);
      }
    }

    // Registrar en historial
    await pool.query(`
      INSERT INTO tareas_historial (tarea_id, nombre_tarea, fecha, hora, persona, tipo, responsable_tarea, a_tiempo, dias_atraso)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [id, tarea.nombre, hoy, hora, persona, tarea.tipo, tarea.responsable, a_tiempo, dias_atraso]);

    // Avanzar proxima_fecha según tipo
    if (tarea.tipo === 'mensual' && tarea.dia_del_mes) {
      const base = new Date(hoy);
      let nextYear = base.getFullYear();
      let nextMonth = base.getMonth() + 2;
      if (nextMonth > 12) { nextMonth = 1; nextYear++; }
      const lastDay = new Date(nextYear, nextMonth, 0).getDate();
      const day = Math.min(tarea.dia_del_mes, lastDay);
      const nextFecha = `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      await pool.query('UPDATE tareas SET proxima_fecha=$1 WHERE id=$2', [nextFecha, id]);
    } else if (tarea.tipo === 'semanal') {
      const base = new Date(hoy + 'T12:00:00');
      base.setDate(base.getDate() + 7);
      const nextFecha = base.toISOString().slice(0, 10);
      await pool.query('UPDATE tareas SET proxima_fecha=$1 WHERE id=$2', [nextFecha, id]);
    } else if (tarea.tipo === 'unica') {
      await pool.query('UPDATE tareas SET completada=true WHERE id=$1', [id]);
    }

    // Resetear estados de subtareas (eliminar estado del ciclo actual)
    const subs = await pool.query('SELECT id FROM tareas_subtareas WHERE tarea_id=$1', [id]);
    for (const s of subs.rows) {
      await pool.query('DELETE FROM tareas_subtareas_estado WHERE subtarea_id=$1 AND fecha=$2', [s.id, hoy]);
    }

    res.json({ ok: true, a_tiempo, dias_atraso });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// PUT estado subtarea
app.put('/api/tareas/subtareas/:subtarea_id/estado', async (req, res) => {
  const { fecha, completada } = req.body;
  const { subtarea_id } = req.params;
  if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
  try {
    await pool.query(`
      INSERT INTO tareas_subtareas_estado (subtarea_id, fecha, completada) VALUES ($1,$2,$3)
      ON CONFLICT (subtarea_id, fecha) DO UPDATE SET completada=$3
    `, [subtarea_id, fecha, completada !== false]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// ── CUENTAS POR PAGAR ──
app.post('/api/cuentas-pagar/sync', async (req, res) => {
  const { filas, archivo, subido_por } = req.body;
  if (!filas || !Array.isArray(filas) || filas.length === 0) return res.status(400).json({ error: 'Sin datos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cuentas_pagar');
    for (const f of filas) {
      await client.query(
        `INSERT INTO cuentas_pagar (acreencia,razon_social,comprobante,fecha,cuotas,vence,total,pagado,saldo,vencido)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [f.acreencia||null, f.razonSocial, f.comprobante, f.fecha||null, f.cuotas||null, f.vence||null,
         f.total||0, f.pagado||0, f.saldo||0, f.vencido||false]
      );
    }
    await client.query(
      'INSERT INTO cuentas_pagar_sync (archivo, filas, subido_por) VALUES ($1,$2,$3)',
      [archivo||'desconocido', filas.length, subido_por||'sistema']
    );
    await client.query('COMMIT');
    res.json({ ok: true, filas: filas.length });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.get('/api/cuentas-pagar', async (req, res) => {
  try {
    const [datos, sync] = await Promise.all([
      pool.query('SELECT * FROM cuentas_pagar ORDER BY razon_social, fecha'),
      pool.query('SELECT * FROM cuentas_pagar_sync ORDER BY created_at DESC LIMIT 1')
    ]);
    res.json({ filas: datos.rows, ultimaSync: sync.rows[0] || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Servir páginas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'panel.html')));
app.get('/facturacion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'facturacion.html')));
app.get('/calculo-facturas', (req, res) => res.sendFile(path.join(__dirname, 'public', 'calculo-facturas.html')));
app.get('/cuentas-corrientes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cuentas-corrientes.html')));
app.get('/conciliacion-bancaria', (req, res) => res.sendFile(path.join(__dirname, 'public', 'conciliacion-bancaria.html')));
app.get('/actividad', (req, res) => res.sendFile(path.join(__dirname, 'public', 'actividad.html')));
app.get('/pendientes-acreditacion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pendientes-acreditacion.html')));
app.get('/tickets', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tickets.html')));
app.get('/administracion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'administracion.html')));
app.get('/tareas', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tareas.html')));
app.get('/cuentas-pagar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cuentas-pagar.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  try {
    await initDB();
  } catch (err) {
    console.error('Error al inicializar DB:', err.message);
  }
});
