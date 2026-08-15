const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');
const zlib = require('zlib');
const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });

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
      ALTER TABLE pendientes_acreditacion ADD COLUMN IF NOT EXISTS comprobante_nombre VARCHAR(200);
      ALTER TABLE pendientes_acreditacion ADD COLUMN IF NOT EXISTS comprobante_data TEXT;

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

      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS alta_fantasia VARCHAR(500);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_motivo VARCHAR(500);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_banco VARCHAR(500);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_suc VARCHAR(500);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chq_numero VARCHAR(500);
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

      CREATE TABLE IF NOT EXISTS asistencia_empleados (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        legajo VARCHAR(50),
        sucursal VARCHAR(100),
        area VARCHAR(100),
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS asistencia_no_laborables (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL UNIQUE,
        motivo VARCHAR(200) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asistencia_registros (
        id SERIAL PRIMARY KEY,
        empleado_id INTEGER REFERENCES asistencia_empleados(id) ON DELETE CASCADE,
        fecha DATE NOT NULL,
        tipo VARCHAR(30) NOT NULL DEFAULT 'presente',
        hora_entrada TIME,
        hora_salida TIME,
        hs_trabajadas NUMERIC(5,1),
        observaciones TEXT,
        UNIQUE(empleado_id, fecha)
      );

    `);

    // Ampliar campos de texto de tickets a VARCHAR(500)
    const ticketCols = ['tipo','titulo','num_cliente','nombre_cliente','alta_nombre','alta_telefono',
      'alta_fantasia','alta_direccion','alta_localidad','alta_rubro','chq_motivo','chq_banco',
      'chq_suc','chq_numero','asignado_a_nombre','cargado_por_nombre','cerrado_por_nombre'];
    for (const col of ticketCols) {
      try { await client.query(`ALTER TABLE tickets ALTER COLUMN ${col} TYPE VARCHAR(500)`); }
      catch(e) { /* columna ya es suficientemente grande o no existe aún */ }
    }

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

// Eliminar resultados específicos por fingerprint de todos los períodos
app.post('/api/datos/:modulo/eliminar-registros', async (req, res) => {
  const { modulo } = req.params;
  const { fingerprints } = req.body; // array de strings "fecha|importe|desc60"
  if (!fingerprints || !fingerprints.length) return res.status(400).json({ error: 'Faltan fingerprints' });
  try {
    const result = await pool.query('SELECT periodo, datos FROM datos_modulos WHERE modulo=$1', [modulo]);
    let totalEliminados = 0;
    for (const row of result.rows) {
      const datos = row.datos;
      if (!datos.resultados) continue;
      const antes = datos.resultados.length;
      datos.resultados = datos.resultados.filter(r => {
        const fp = (r.fecha||'')+'|'+r.importe+'|'+(r.desc||'').slice(0,60);
        return !fingerprints.includes(fp);
      });
      if (datos.resultados.length < antes) {
        totalEliminados += antes - datos.resultados.length;
        await pool.query('UPDATE datos_modulos SET datos=$1, updated_at=NOW() WHERE modulo=$2 AND periodo=$3',
          [JSON.stringify(datos), modulo, row.periodo]);
      }
    }
    res.json({ ok: true, eliminados: totalEliminados });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  const { username, nombre, importe_real, comprobante_nombre, comprobante_data } = req.body;
  const { id } = req.params;
  if (!username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'UPDATE pendientes_acreditacion SET estado=$1, confirmado_por=$2, confirmado_por_nombre=$3, confirmado_at=CURRENT_DATE, importe_real=$5, comprobante_nombre=$6, comprobante_data=$7 WHERE id=$4 RETURNING id,concepto,importe,detalle,estado,cargado_por,cargado_por_nombre,cargado_at,confirmado_por,confirmado_por_nombre,confirmado_at,importe_real,comprobante_nombre',
      ['confirmado', username, nombre||username, id, importe_real||null, comprobante_nombre||null, comprobante_data||null]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al confirmar' }); }
});

app.get('/api/pendientes-acreditacion/:id/comprobante', async (req, res) => {
  try {
    const r = await pool.query('SELECT comprobante_nombre, comprobante_data FROM pendientes_acreditacion WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].comprobante_data) return res.status(404).json({ error: 'Sin comprobante' });
    const { comprobante_nombre, comprobante_data } = r.rows[0];
    const matches = comprobante_data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Formato inválido' });
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${comprobante_nombre || 'comprobante'}"`);
    res.send(buffer);
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

app.delete('/api/pendientes-acreditacion/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM pendientes_acreditacion WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al eliminar' }); }
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
    if (estado === 'activos') { where.push(`t.estado != 'finalizado'`); }
    else if (estado) { params.push(estado); where.push(`t.estado=$${params.length}`); }
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

app.patch('/api/tickets/:id/reasignar', async (req, res) => {
  const { asignado_a, asignado_a_nombre, reasignado_por_nombre } = req.body;
  if (!asignado_a) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const t = await pool.query(
      'UPDATE tickets SET asignado_a=$1, asignado_a_nombre=$2 WHERE id=$3 RETURNING *',
      [asignado_a, asignado_a_nombre, req.params.id]
    );
    if (!t.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const anterior = t.rows[0].asignado_a_nombre || 'Sin asignar';
    await pool.query(
      'INSERT INTO ticket_notas (ticket_id, autor, autor_nombre, texto) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'sistema', 'Sistema',
       `Reasignado a ${asignado_a_nombre} (antes: ${anterior}) por ${reasignado_por_nombre}`]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al reasignar' }); }
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
  const binary = options.binary;
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        const finish = (buf) => resolve({ status: res.statusCode, headers: res.headers, body: binary ? buf : buf.toString('utf8') });
        if (encoding === 'gzip') zlib.gunzip(raw, (err, buf) => err ? finish(raw) : finish(buf));
        else if (encoding === 'deflate') zlib.inflate(raw, (err, buf) => err ? finish(raw) : finish(buf));
        else finish(raw);
      });
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
      path: '/AR459/web/api/saldoTotalDeudores/exportarExcel?pcEmp=0&pcSucur=1,%202&piLineaCredito=1&pdFecsal=null&pcDocs=-1&plactual=true&plDet=true&plApertura=false',
      method: 'GET',
      headers: { 'Cookie': cookies, 'Referer': 'https://delpalacio.chesserp.com/AR459/', 'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*' },
      binary: true
    });

    // Chess devuelve JSON con la ruta del archivo generado
    let filePath;
    try {
      const meta = JSON.parse(dataRes.body.toString('utf8'));
      if (!meta.pcfile) throw new Error('sin pcfile');
      filePath = meta.pcfile; // ej: /static/downloads/saldototalXXX.xlsx
    } catch(e) {
      return res.status(502).json({ error: `Chess respondió formato inesperado: ${dataRes.body.toString('utf8').slice(0,200)}` });
    }

    // Segunda request: descargar el Excel generado
    const fileRes = await httpsRequest({
      hostname: 'delpalacio.chesserp.com',
      path: '/AR459' + filePath,
      method: 'GET',
      headers: { 'Cookie': cookies, 'Referer': 'https://delpalacio.chesserp.com/AR459/' },
      binary: true
    });

    const fileLen = fileRes.body ? fileRes.body.length : 0;
    if (fileLen < 100) return res.status(502).json({ error: `No se pudo descargar el Excel generado (${fileLen} bytes)` });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(fileRes.body);
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


// ── ASISTENCIA ──
app.get('/api/asistencia/empleados', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM asistencia_empleados WHERE activo=true ORDER BY nombre');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asistencia/empleados', async (req, res) => {
  const { nombre, legajo, sucursal, area } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const r = await pool.query(
      'INSERT INTO asistencia_empleados (nombre, legajo, sucursal, area) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre, legajo||null, sucursal||null, area||null]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/asistencia/empleados/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM asistencia_empleados WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/asistencia/no-laborables', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, fecha::text, motivo FROM asistencia_no_laborables ORDER BY fecha');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asistencia/no-laborables', async (req, res) => {
  const { fecha, motivo } = req.body;
  if (!fecha || !motivo) return res.status(400).json({ error: 'Fecha y motivo requeridos' });
  try {
    const r = await pool.query(
      'INSERT INTO asistencia_no_laborables (fecha, motivo) VALUES ($1,$2) ON CONFLICT (fecha) DO UPDATE SET motivo=$2 RETURNING id, fecha::text, motivo',
      [fecha, motivo]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/asistencia/no-laborables/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM asistencia_no_laborables WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/asistencia/registros', async (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).json({ error: 'Mes requerido (YYYY-MM)' });
  try {
    const r = await pool.query(
      `SELECT id, empleado_id, fecha::text, tipo, hora_entrada::text, hora_salida::text, hs_trabajadas, observaciones
       FROM asistencia_registros
       WHERE to_char(fecha,'YYYY-MM') = $1
       ORDER BY fecha`, [mes]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asistencia/registros', async (req, res) => {
  const { empleado_id, fecha, tipo, hora_entrada, hora_salida, hs_trabajadas, observaciones } = req.body;
  if (!empleado_id || !fecha || !tipo) return res.status(400).json({ error: 'Datos incompletos' });
  try {
    const r = await pool.query(
      `INSERT INTO asistencia_registros (empleado_id, fecha, tipo, hora_entrada, hora_salida, hs_trabajadas, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo=$3, hora_entrada=$4, hora_salida=$5, hs_trabajadas=$6, observaciones=$7
       RETURNING *`,
      [empleado_id, fecha, tipo, hora_entrada||null, hora_salida||null, hs_trabajadas||null, observaciones||null]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asistencia/importar', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'Archivo vacío' });

    const colMap = detectarColumnas(rows[0]);
    if (!colMap.nombre) return res.status(400).json({ error: 'No se pudo detectar la columna de nombre/empleado' });
    if (!colMap.fecha) return res.status(400).json({ error: 'No se pudo detectar la columna de fecha' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let regCount = 0, empNuevos = 0;

      const empCache = {};
      const existing = await client.query('SELECT id, nombre, legajo FROM asistencia_empleados WHERE activo=true');
      existing.rows.forEach(e => {
        empCache[e.nombre.toLowerCase().trim()] = e.id;
        if (e.legajo) empCache['leg_'+e.legajo.trim()] = e.id;
      });

      for (const row of rows) {
        const nombre = String(row[colMap.nombre] || '').trim();
        if (!nombre) continue;

        let empId = empCache[nombre.toLowerCase()];
        const legajo = colMap.legajo ? String(row[colMap.legajo] || '').trim() : '';
        if (!empId && legajo) empId = empCache['leg_'+legajo];

        if (!empId) {
          const sucursal = colMap.sucursal ? String(row[colMap.sucursal] || '').trim() : null;
          const area = colMap.area ? String(row[colMap.area] || '').trim() : null;
          const ins = await client.query(
            'INSERT INTO asistencia_empleados (nombre, legajo, sucursal, area) VALUES ($1,$2,$3,$4) RETURNING id',
            [nombre, legajo||null, sucursal, area]
          );
          empId = ins.rows[0].id;
          empCache[nombre.toLowerCase()] = empId;
          if (legajo) empCache['leg_'+legajo] = empId;
          empNuevos++;
        }

        let fecha = row[colMap.fecha];
        if (fecha instanceof Date) {
          fecha = fecha.toISOString().slice(0,10);
        } else {
          fecha = String(fecha).trim();
          const parts = fecha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          if (parts) {
            const y = parts[3].length === 2 ? '20'+parts[3] : parts[3];
            fecha = `${y}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
          }
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;

        let horaEnt = colMap.entrada ? parseHora(row[colMap.entrada]) : null;
        let horaSal = colMap.salida ? parseHora(row[colMap.salida]) : null;
        let hsTrab = null;
        if (horaEnt && horaSal) {
          const [h1,m1] = horaEnt.split(':').map(Number);
          const [h2,m2] = horaSal.split(':').map(Number);
          let mins = (h2*60+m2)-(h1*60+m1);
          if (mins < 0) mins += 24*60;
          hsTrab = +(mins/60).toFixed(1);
        }
        if (colMap.horas && !hsTrab) {
          const v = parseFloat(row[colMap.horas]);
          if (!isNaN(v)) hsTrab = v;
        }

        let tipo = 'presente';
        if (colMap.novedad) {
          const nov = String(row[colMap.novedad] || '').toLowerCase().trim();
          if (nov.includes('vacaci')) tipo = 'vacaciones';
          else if (nov.includes('justificad') && !nov.includes('injustificad') && !nov.includes('no justificad')) tipo = 'falta_justificada';
          else if (nov.includes('injustificad') || nov.includes('no justificad')) tipo = 'falta_injustificada';
          else if (nov.includes('feriado')) tipo = 'feriado';
          else if (nov.includes('ausente') || nov.includes('falta') || nov.includes('inasist')) tipo = 'falta_injustificada';
        }
        if (tipo === 'presente' && !horaEnt && !horaSal && !hsTrab && colMap.novedad) {
          const nov = String(row[colMap.novedad] || '').toLowerCase().trim();
          if (nov === '' || nov === 'presente' || nov === 'normal') tipo = 'presente';
        }

        await client.query(
          `INSERT INTO asistencia_registros (empleado_id, fecha, tipo, hora_entrada, hora_salida, hs_trabajadas)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo=$3, hora_entrada=$4, hora_salida=$5, hs_trabajadas=$6`,
          [empId, fecha, tipo, horaEnt, horaSal, hsTrab]
        );
        regCount++;
      }

      await client.query('COMMIT');
      res.json({ registros: regCount, empleados_nuevos: empNuevos });
    } catch(e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function detectarColumnas(sample) {
  const map = {};
  const keys = Object.keys(sample);
  for (const k of keys) {
    const kl = k.toLowerCase().trim();
    if (!map.nombre && (kl.includes('nombre') || kl.includes('empleado') || kl.includes('apellido') || kl === 'name')) map.nombre = k;
    if (!map.fecha && (kl.includes('fecha') || kl === 'date' || kl === 'dia')) map.fecha = k;
    if (!map.entrada && (kl.includes('entrada') || kl.includes('ingreso') || kl.includes('checkin') || kl.includes('check in') || kl.includes('hora_entrada'))) map.entrada = k;
    if (!map.salida && (kl.includes('salida') || kl.includes('egreso') || kl.includes('checkout') || kl.includes('check out') || kl.includes('hora_salida'))) map.salida = k;
    if (!map.legajo && (kl.includes('legajo') || kl === 'leg' || kl === 'id' || kl.includes('nro'))) map.legajo = k;
    if (!map.sucursal && (kl.includes('sucursal') || kl.includes('sede') || kl.includes('local'))) map.sucursal = k;
    if (!map.area && (kl.includes('area') || kl.includes('área') || kl.includes('sector') || kl.includes('depto') || kl.includes('departamento'))) map.area = k;
    if (!map.novedad && (kl.includes('novedad') || kl.includes('tipo') || kl.includes('estado') || kl.includes('motivo') || kl.includes('concepto'))) map.novedad = k;
    if (!map.horas && (kl.includes('horas') || kl.includes('hs') || kl.includes('hours'))) map.horas = k;
  }
  return map;
}

function parseHora(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toTimeString().slice(0,5);
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return m[1].padStart(2,'0') + ':' + m[2];
  const num = parseFloat(s);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMins = Math.round(num * 24 * 60);
    return String(Math.floor(totalMins/60)).padStart(2,'0') + ':' + String(totalMins%60).padStart(2,'0');
  }
  return null;
}

// ── SYNC FICHA YA ──
const FICHAYA_URL = process.env.FICHAYA_URL || 'https://control-asistencia.up.railway.app';
const FICHAYA_USER = process.env.FICHAYA_USER || 'reportes';
const FICHAYA_PASS = process.env.FICHAYA_PASS || 'reporte123';

function extractCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const map = {};
  raw.forEach(c => { const pair = c.split(';')[0].trim(); const eq = pair.indexOf('='); if (eq > 0) map[pair.substring(0,eq)] = pair; });
  return map;
}

function mergeCookies(...maps) {
  const merged = {};
  maps.forEach(m => Object.assign(merged, m));
  return Object.values(merged).join('; ');
}

async function fichaYaLogin() {
  console.log('[FichaYa] Iniciando login...');
  const loginPageRes = await fetch(FICHAYA_URL + '/login');
  const loginHtml = await loginPageRes.text();
  const csrfMatch = loginHtml.match(/name="csrf_token"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error('No se pudo obtener CSRF token de Ficha Ya');
  const cookies1 = extractCookies(loginPageRes);
  console.log('[FichaYa] GET /login cookies:', Object.keys(cookies1));

  const body = new URLSearchParams({ csrf_token: csrfMatch[1], username: FICHAYA_USER, password: FICHAYA_PASS });
  const loginRes = await fetch(FICHAYA_URL + '/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': mergeCookies(cookies1),
      'Referer': FICHAYA_URL + '/login',
      'Origin': FICHAYA_URL
    },
    body: body.toString(),
    redirect: 'manual'
  });
  const cookies2 = extractCookies(loginRes);
  console.log('[FichaYa] POST /login status:', loginRes.status, 'location:', loginRes.headers.get('location'), 'cookies:', Object.keys(cookies2));

  const location = loginRes.headers.get('location');
  let cookies3 = {};
  if (location) {
    const redirectUrl = location.startsWith('http') ? location : FICHAYA_URL + location;
    console.log('[FichaYa] Siguiendo redirect a:', redirectUrl);
    const redirectRes = await fetch(redirectUrl, {
      headers: { 'Cookie': mergeCookies(cookies1, cookies2) },
      redirect: 'manual'
    });
    cookies3 = extractCookies(redirectRes);
    console.log('[FichaYa] Redirect status:', redirectRes.status, 'cookies:', Object.keys(cookies3));
  }

  const finalCookies = mergeCookies(cookies1, cookies2, cookies3);
  console.log('[FichaYa] Cookies finales:', finalCookies.substring(0, 80) + '...');
  return finalCookies;
}

async function fichaYaDownload(sessionCookie, desde, hasta) {
  const xlsxUrl = `${FICHAYA_URL}/asistencias/?export=xlsx&fecha_desde=${desde}&fecha_hasta=${hasta}`;
  console.log('[FichaYa] Descargando:', xlsxUrl);
  const xlsxRes = await fetch(xlsxUrl, { headers: { 'Cookie': sessionCookie }, redirect: 'follow' });
  const contentType = xlsxRes.headers.get('content-type') || '';
  if (!xlsxRes.ok) throw new Error('Error al descargar Excel de Ficha Ya: ' + xlsxRes.status);
  const buf = Buffer.from(await xlsxRes.arrayBuffer());
  if (contentType.includes('text/html')) {
    const html = buf.toString('utf-8').substring(0, 300);
    if (html.includes('login') || html.includes('Login')) throw new Error('Sesión de Ficha Ya expirada o credenciales incorrectas');
    throw new Error('Ficha Ya devolvió HTML en vez de Excel');
  }
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  let rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const firstKeys = Object.keys(rows[0] || {});
  if (firstKeys.some(k => k.startsWith('__EMPTY'))) {
    const headerRow = rows[0];
    const realHeaders = {};
    firstKeys.forEach(k => { if (String(headerRow[k]).trim()) realHeaders[k] = String(headerRow[k]).trim(); });
    rows = rows.slice(1).map(r => {
      const mapped = {};
      firstKeys.forEach(k => { if (realHeaders[k]) mapped[realHeaders[k]] = r[k]; });
      return mapped;
    });
  }
  return rows;
}

function fichaYaNombre(row) {
  const apellido = String(row['Apellido'] || '').trim();
  const nombreRaw = String(row['Nombre'] || '').trim();
  return (apellido && nombreRaw) ? `${apellido}, ${nombreRaw}` : (nombreRaw || apellido || String(row['Empleado'] || '').trim());
}

app.post('/api/asistencia/sync-fichaya', async (req, res) => {
  const { mes } = req.body;
  if (!mes) return res.status(400).json({ error: 'Mes requerido (YYYY-MM)' });
  try {
    const [y, m] = mes.split('-').map(Number);
    const desde = `${y}-${String(m).padStart(2,'0')}-01`;
    const hasta = `${y}-${String(m).padStart(2,'0')}-${new Date(y, m, 0).getDate()}`;

    const sessionCookie = await fichaYaLogin();

    // 1) Download wide range (last 6 months) to discover all active employees
    const prevMonth = new Date(y, m - 2, 1);
    const empDesde = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth()+1).padStart(2,'0')}-01`;
    console.log('[FichaYa] Descargando empleados desde', empDesde, 'hasta', hasta);
    const allRows = await fichaYaDownload(sessionCookie, empDesde, hasta);

    // 2) Download month-specific records
    const mesRows = await fichaYaDownload(sessionCookie, desde, hasta);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let regCount = 0, empNuevos = 0;

      const empCache = {};
      const existing = await client.query('SELECT id, nombre, legajo FROM asistencia_empleados');
      existing.rows.forEach(e => { empCache[e.nombre.toLowerCase().trim()] = e.id; });

      // Register employees found in the discovery range, mark as active
      const seen = new Set();
      for (const row of allRows) {
        const nombre = fichaYaNombre(row);
        if (!nombre || seen.has(nombre.toLowerCase())) continue;
        seen.add(nombre.toLowerCase());
        const sucursal = String(row['Sucursal Nombre'] || row['Sucursal'] || '').trim() || null;
        const area = String(row['Sector Nombre'] || row['Sector'] || '').trim() || null;
        if (!empCache[nombre.toLowerCase()]) {
          const ins = await client.query(
            'INSERT INTO asistencia_empleados (nombre, sucursal, area, activo) VALUES ($1,$2,$3,true) RETURNING id',
            [nombre, sucursal, area]
          );
          empCache[nombre.toLowerCase()] = ins.rows[0].id;
          empNuevos++;
        } else {
          await client.query('UPDATE asistencia_empleados SET sucursal=COALESCE($2,sucursal), area=COALESCE($3,area), activo=true WHERE id=$1', [empCache[nombre.toLowerCase()], sucursal, area]);
        }
      }

      // Mark employees NOT found in the discovery range as inactive
      const activeIds = [...seen].map(n => empCache[n]).filter(Boolean);
      if (activeIds.length) {
        await client.query('UPDATE asistencia_empleados SET activo=false WHERE id != ALL($1::int[]) AND activo=true', [activeIds]);
      }

      // Group month records by employee+date to consolidate split shifts
      const dayMap = {};
      for (const row of mesRows) {
        const nombre = fichaYaNombre(row);
        if (!nombre) continue;
        const sucursal = String(row['Sucursal Nombre'] || row['Sucursal'] || '').trim() || null;
        const area = String(row['Sector Nombre'] || row['Sector'] || '').trim() || null;

        let empId = empCache[nombre.toLowerCase()];
        if (!empId) {
          const ins = await client.query(
            'INSERT INTO asistencia_empleados (nombre, sucursal, area) VALUES ($1,$2,$3) RETURNING id',
            [nombre, sucursal, area]
          );
          empId = ins.rows[0].id;
          empCache[nombre.toLowerCase()] = empId;
          empNuevos++;
        }

        let fecha = row['Fecha'];
        if (fecha instanceof Date) {
          fecha = fecha.toISOString().slice(0, 10);
        } else {
          fecha = String(fecha).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            const parts = fecha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
            if (parts) {
              const yr = parts[3].length === 2 ? '20' + parts[3] : parts[3];
              fecha = `${yr}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            } else continue;
          }
        }

        const horaEnt = parseHora(row['Hora Entrada'] || row['Entrada']);
        const horaSal = parseHora(row['Hora Salida'] || row['Salida']);
        const estado = String(row['Estado'] || '').toLowerCase().trim();

        const key = empId + '_' + fecha;
        if (!dayMap[key]) dayMap[key] = { empId, fecha, turnos: [], estado: 'presente' };
        dayMap[key].turnos.push({ entrada: horaEnt, salida: horaSal });
        if (estado === 'ausente') dayMap[key].estado = 'falta_injustificada';
        else if (estado.includes('vacaci')) dayMap[key].estado = 'vacaciones';
        else if (estado.includes('justificad')) dayMap[key].estado = 'falta_justificada';
      }

      for (const rec of Object.values(dayMap)) {
        const turnos = rec.turnos.sort((a, b) => (a.entrada || '').localeCompare(b.entrada || ''));
        const primeraEnt = turnos.find(t => t.entrada)?.entrada || null;
        const ultimaSal = [...turnos].reverse().find(t => t.salida)?.salida || null;

        let hsTrab = 0;
        const detalle = [];
        for (const t of turnos) {
          detalle.push(`${t.entrada || '?'}-${t.salida || '?'}`);
          if (t.entrada && t.salida) {
            const [h1, m1] = t.entrada.split(':').map(Number);
            const [h2, m2] = t.salida.split(':').map(Number);
            let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (mins < 0) mins += 24 * 60;
            hsTrab += mins / 60;
          }
        }
        hsTrab = hsTrab ? +hsTrab.toFixed(1) : null;

        let tipo = rec.estado;
        if (tipo === 'presente' && (rec.estado === 'ok' || rec.estado === 'tarde')) tipo = 'presente';

        const obs = turnos.length > 1 ? detalle.join(' / ') : null;

        await client.query(
          `INSERT INTO asistencia_registros (empleado_id, fecha, tipo, hora_entrada, hora_salida, hs_trabajadas, observaciones)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo=$3, hora_entrada=$4, hora_salida=$5, hs_trabajadas=$6, observaciones=COALESCE($7, asistencia_registros.observaciones)`,
          [rec.empId, rec.fecha, tipo, primeraEnt, ultimaSal, hsTrab, obs]
        );
        regCount++;
      }

      await client.query('COMMIT');
      res.json({ registros: regCount, empleados_nuevos: empNuevos });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
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
app.get('/transporte', (req, res) => res.sendFile(path.join(__dirname, 'public', 'transporte.html')));
app.get('/presupuesto', (req, res) => res.sendFile(path.join(__dirname, 'public', 'presupuesto.html')));
app.get('/asistencia', (req, res) => res.sendFile(path.join(__dirname, 'public', 'asistencia.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  try {
    await initDB();
  } catch (err) {
    console.error('Error al inicializar DB:', err.message);
  }
});
