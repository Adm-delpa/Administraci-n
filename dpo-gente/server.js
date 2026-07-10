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

async function seedDefaults(client) {
  const cfgRes = await client.query('SELECT id FROM dpo_config WHERE id=1');
  if (cfgRes.rows.length === 0) {
    await client.query(
      `INSERT INTO dpo_config (id, nombre_empresa, intro_titulo, intro_parrafo1, intro_parrafo2, frase_destacada, footer_texto)
       VALUES (1,$1,$2,$3,$4,$5,$6)`,
      [
        'del Palacio S.A',
        'GENTE',
        'Este espacio fue creado para centralizar, organizar y dar visibilidad a todas las acciones, procesos y herramientas vinculadas al pilar Gente dentro del modelo DPO 2026, promoviendo una cultura de desarrollo, participación y mejora continua.',
        'Nuestro objetivo es seguir construyendo un entorno de trabajo más organizado, colaborativo y enfocado en el crecimiento de cada persona que forma parte de la compañía.',
        'Nuestro sueño es "Ser la distribuidora elegida, reconocida por la excelencia en el servicio, eficiencia operativa y compromiso con nuestra gente, clientes, seguridad y el medio ambiente."',
        'EQUIPO DE GENTE - DEL PALACIO SA'
      ]
    );
  }

  const pagRes = await client.query('SELECT COUNT(*)::int AS c FROM dpo_paginas');
  if (pagRes.rows[0].c === 0) {
    async function crear(titulo, parentId, orden) {
      const r = await client.query(
        'INSERT INTO dpo_paginas (titulo, parent_id, orden) VALUES ($1,$2,$3) RETURNING id',
        [titulo, parentId, orden]
      );
      return r.rows[0].id;
    }
    await crear('1. Cultura', null, 1);
    await crear('2. Reclutamiento y Selección', null, 2);
    await crear('3. Recompensas y Reconocimientos', null, 3);

    const s4 = await crear('4. Aprendizaje y Desarrollo', null, 4);
    await crear('PAC', s4, 1);
    await crear('Inducciones', s4, 2);
    await crear('SKAP', s4, 3);

    const s5 = await crear('5. Ambiente de Trabajo y Compromiso', null, 5);
    await crear('Ausentismo', s5, 1);
    const engagement = await crear('Engagement', s5, 2);
    const clima = await crear('Encuesta de Clima', engagement, 1);
    await crear('Clima H2 2025', clima, 1);
    await crear('Clima H1 2025', clima, 2);
    await crear('Clima H2 2024', clima, 3);
    await crear('Clima H1 2024', clima, 4);
    await crear('Plan de Comunicaciones', s5, 3);
    await crear('Entorno Laboral', s5, 4);
    await crear('Negociación Sindical', s5, 5);

    const s6 = await crear('6. Talento y Crecimiento', null, 6);
    await crear('Evaluación del Distribuidor', s6, 1);
    await crear('OPR', s6, 2);
    await crear('Evaluación de Desempeño', s6, 3);
    await crear('KPI Turnover', s6, 4);

    await crear('7. Comité de Gente', null, 7);
  }
}

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS dpo_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        nombre_empresa VARCHAR(200) DEFAULT 'del Palacio S.A',
        intro_titulo VARCHAR(200) DEFAULT 'GENTE',
        intro_parrafo1 TEXT,
        intro_parrafo2 TEXT,
        frase_destacada TEXT,
        footer_texto VARCHAR(200) DEFAULT 'EQUIPO DE GENTE - DEL PALACIO SA',
        CHECK (id = 1)
      );

      CREATE TABLE IF NOT EXISTS dpo_paginas (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER REFERENCES dpo_paginas(id) ON DELETE CASCADE,
        titulo VARCHAR(300) NOT NULL,
        texto TEXT,
        orden INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_bloques (
        id SERIAL PRIMARY KEY,
        pagina_id INTEGER NOT NULL REFERENCES dpo_paginas(id) ON DELETE CASCADE,
        tipo VARCHAR(20) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        orden INTEGER DEFAULT 0
      );
    `);
    await seedDefaults(client);
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

// ── CONFIG (encabezado / inicio / footer) ──
app.get('/api/config', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_config WHERE id=1');
    res.json(r.rows[0] || {});
  } catch(e) { res.status(500).json({ error: 'Error al leer' }); }
});

app.put('/api/config', async (req, res) => {
  const { nombre_empresa, intro_titulo, intro_parrafo1, intro_parrafo2, frase_destacada, footer_texto } = req.body;
  try {
    const r = await pool.query(
      `UPDATE dpo_config SET nombre_empresa=$1, intro_titulo=$2, intro_parrafo1=$3, intro_parrafo2=$4, frase_destacada=$5, footer_texto=$6
       WHERE id=1 RETURNING *`,
      [nombre_empresa||null, intro_titulo||null, intro_parrafo1||null, intro_parrafo2||null, frase_destacada||null, footer_texto||null]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Error al guardar' }); }
});

// ── PÁGINAS (árbol de secciones / subsecciones) ──
app.get('/api/paginas', async (req, res) => {
  try {
    const pags = await pool.query('SELECT * FROM dpo_paginas ORDER BY parent_id NULLS FIRST, orden ASC, id ASC');
    const bloques = await pool.query('SELECT * FROM dpo_bloques ORDER BY orden ASC, id ASC');
    const bMap = {};
    bloques.rows.forEach(b => { (bMap[b.pagina_id] = bMap[b.pagina_id] || []).push(b); });
    res.json(pags.rows.map(p => ({ ...p, bloques: bMap[p.id] || [] })));
  } catch(e) { res.status(500).json({ error: 'Error al leer' }); }
});

app.post('/api/paginas', async (req, res) => {
  const { titulo, parent_id } = req.body;
  if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const ordenRes = await pool.query(
      'SELECT COALESCE(MAX(orden),0)+1 AS orden FROM dpo_paginas WHERE parent_id IS NOT DISTINCT FROM $1',
      [parent_id || null]
    );
    const r = await pool.query(
      'INSERT INTO dpo_paginas (titulo, parent_id, orden) VALUES ($1,$2,$3) RETURNING *',
      [titulo.trim(), parent_id || null, ordenRes.rows[0].orden]
    );
    res.json({ ...r.rows[0], bloques: [] });
  } catch(e) { res.status(500).json({ error: 'Error al crear' }); }
});

const TIPOS_BLOQUE = ['texto', 'imagen', 'embed'];

app.put('/api/paginas/:id', async (req, res) => {
  const { titulo, bloques } = req.body;
  const { id } = req.params;
  if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'Faltan datos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE dpo_paginas SET titulo=$1 WHERE id=$2', [titulo.trim(), id]);
    await client.query('DELETE FROM dpo_bloques WHERE pagina_id=$1', [id]);
    const list = Array.isArray(bloques) ? bloques : [];
    for (let i = 0; i < list.length; i++) {
      if (!TIPOS_BLOQUE.includes(list[i].tipo)) continue;
      await client.query(
        'INSERT INTO dpo_bloques (pagina_id, tipo, data, orden) VALUES ($1,$2,$3,$4)',
        [id, list[i].tipo, JSON.stringify(list[i].data||{}), i]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Error al guardar' }); }
  finally { client.release(); }
});

app.delete('/api/paginas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_paginas WHERE id=$1', [req.params.id]);
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
