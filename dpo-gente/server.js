const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined,
  } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pilar_gente_items (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(200) NOT NULL,
        descripcion TEXT,
        link_drive TEXT,
        fecha_limite DATE,
        estado VARCHAR(20) DEFAULT 'pendiente',
        cargado_por VARCHAR(50) NOT NULL,
        cargado_por_nombre VARCHAR(100),
        cargado_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pilar_gente_notas (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES pilar_gente_items(id) ON DELETE CASCADE,
        texto TEXT NOT NULL,
        link TEXT,
        username VARCHAR(50) NOT NULL,
        nombre VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pilar_gente_categorias (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(200) NOT NULL,
        intro TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pilar_gente_principios (
        id SERIAL PRIMARY KEY,
        categoria_id INTEGER NOT NULL REFERENCES pilar_gente_categorias(id) ON DELETE CASCADE,
        emoji VARCHAR(10),
        etiqueta VARCHAR(200) NOT NULL,
        orden INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pilar_gente_secciones (
        id SERIAL PRIMARY KEY,
        categoria_id INTEGER NOT NULL REFERENCES pilar_gente_categorias(id) ON DELETE CASCADE,
        subtitulo VARCHAR(200) NOT NULL,
        texto TEXT,
        orden INTEGER DEFAULT 0
      );
    `);
    console.log('Base de datos inicializada (DPO Gente).');
  } finally {
    client.release();
  }
}

// ── AUTH (contraseña única, sin usuarios individuales) ──
app.post('/api/login', (req, res) => {
  const { password, nombre } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Ingresá tu nombre' });
  const expected = process.env.PILAR_GENTE_PASSWORD || 'dpogente2024';
  if (password !== expected) return res.status(401).json({ error: 'Contraseña incorrecta' });
  res.json({ ok: true });
});

// ── ITEMS / SEGUIMIENTOS ──
app.get('/api/pilar-gente', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM pilar_gente_items ORDER BY estado ASC, cargado_at DESC');
    const notas = await pool.query('SELECT * FROM pilar_gente_notas ORDER BY created_at ASC');
    const notasMap = {};
    notas.rows.forEach(n => { if(!notasMap[n.item_id]) notasMap[n.item_id]=[]; notasMap[n.item_id].push(n); });
    res.json(r.rows.map(row => ({ ...row, notas: notasMap[row.id] || [] })));
  } catch(e) { res.status(500).json({ error: 'Error al leer' }); }
});

app.post('/api/pilar-gente', async (req, res) => {
  const { titulo, descripcion, link_drive, fecha_limite, username, nombre } = req.body;
  if (!titulo || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'INSERT INTO pilar_gente_items (titulo, descripcion, link_drive, fecha_limite, cargado_por, cargado_por_nombre) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [titulo, descripcion||null, link_drive||null, fecha_limite||null, username, nombre||username]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al guardar' }); }
});

app.put('/api/pilar-gente/:id/estado', async (req, res) => {
  const { estado } = req.body;
  const { id } = req.params;
  if (!['pendiente','en_proceso','hecho'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  try {
    const r = await pool.query('UPDATE pilar_gente_items SET estado=$1 WHERE id=$2 RETURNING *', [estado, id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al actualizar' }); }
});

app.post('/api/pilar-gente/:id/notas', async (req, res) => {
  const { texto, link, username, nombre } = req.body;
  const { id } = req.params;
  if (!texto || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query(
      'INSERT INTO pilar_gente_notas (item_id, texto, link, username, nombre) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, texto, link||null, username, nombre||username]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al guardar nota' }); }
});

app.delete('/api/pilar-gente/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pilar_gente_items WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al borrar' }); }
});

// ── CATEGORÍAS / CONTENIDO ──
app.get('/api/pilar-gente/categorias', async (req, res) => {
  try {
    const cats = await pool.query('SELECT * FROM pilar_gente_categorias ORDER BY id ASC');
    const prin = await pool.query('SELECT * FROM pilar_gente_principios ORDER BY orden ASC, id ASC');
    const sec = await pool.query('SELECT * FROM pilar_gente_secciones ORDER BY orden ASC, id ASC');
    const pMap = {}, sMap = {};
    prin.rows.forEach(p => { (pMap[p.categoria_id] = pMap[p.categoria_id] || []).push(p); });
    sec.rows.forEach(s => { (sMap[s.categoria_id] = sMap[s.categoria_id] || []).push(s); });
    res.json(cats.rows.map(c => ({ ...c, principios: pMap[c.id] || [], secciones: sMap[c.id] || [] })));
  } catch(e) { res.status(500).json({ error: 'Error al leer' }); }
});

app.post('/api/pilar-gente/categorias', async (req, res) => {
  const { titulo, username } = req.body;
  if (!titulo || !username) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const r = await pool.query('INSERT INTO pilar_gente_categorias (titulo) VALUES ($1) RETURNING *', [titulo]);
    res.json({ ...r.rows[0], principios: [], secciones: [] });
  } catch(e) { res.status(500).json({ error: 'Error al crear' }); }
});

app.put('/api/pilar-gente/categorias/:id', async (req, res) => {
  const { titulo, intro, principios, secciones } = req.body;
  const { id } = req.params;
  if (!titulo) return res.status(400).json({ error: 'Faltan datos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE pilar_gente_categorias SET titulo=$1, intro=$2 WHERE id=$3', [titulo, intro||null, id]);
    await client.query('DELETE FROM pilar_gente_principios WHERE categoria_id=$1', [id]);
    await client.query('DELETE FROM pilar_gente_secciones WHERE categoria_id=$1', [id]);
    const princ = Array.isArray(principios) ? principios : [];
    for (let i = 0; i < princ.length; i++) {
      if (!princ[i].etiqueta) continue;
      await client.query('INSERT INTO pilar_gente_principios (categoria_id, emoji, etiqueta, orden) VALUES ($1,$2,$3,$4)',
        [id, princ[i].emoji||null, princ[i].etiqueta, i]);
    }
    const secs = Array.isArray(secciones) ? secciones : [];
    for (let i = 0; i < secs.length; i++) {
      if (!secs[i].subtitulo) continue;
      await client.query('INSERT INTO pilar_gente_secciones (categoria_id, subtitulo, texto, orden) VALUES ($1,$2,$3,$4)',
        [id, secs[i].subtitulo, secs[i].texto||null, i]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Error al guardar' }); }
  finally { client.release(); }
});

app.delete('/api/pilar-gente/categorias/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM pilar_gente_categorias WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al borrar' }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pilar-gente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pilar-gente.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`DPO Gente corriendo en puerto ${PORT}`);
  try {
    await initDB();
  } catch (err) {
    console.error('Error al inicializar DB:', err.message);
  }
});
