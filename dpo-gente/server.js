const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

      CREATE TABLE IF NOT EXISTS dpo_candidatos (
        id SERIAL PRIMARY KEY,
        apellido VARCHAR(100) DEFAULT '',
        nombre VARCHAR(100) DEFAULT '',
        localidad VARCHAR(200) DEFAULT '',
        licencia VARCHAR(10) DEFAULT '',
        tipo_licencia VARCHAR(20) DEFAULT '',
        celular VARCHAR(50) DEFAULT '',
        email VARCHAR(200) DEFAULT '',
        area VARCHAR(100) DEFAULT '',
        formacion TEXT DEFAULT '',
        observaciones TEXT DEFAULT '',
        estado VARCHAR(50) DEFAULT 'Sin entrevista',
        cv_nombre VARCHAR(300),
        cv_mime VARCHAR(100),
        cv_base64 TEXT,
        sexo VARCHAR(20) DEFAULT '',
        medio_reclutamiento VARCHAR(100) DEFAULT '',
        fecha_alta DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE dpo_candidatos ADD COLUMN IF NOT EXISTS sexo VARCHAR(20) DEFAULT '';
      ALTER TABLE dpo_candidatos ADD COLUMN IF NOT EXISTS medio_reclutamiento VARCHAR(100) DEFAULT '';

      CREATE TABLE IF NOT EXISTS dpo_plan_demanda (
        id SERIAL PRIMARY KEY,
        sucursal VARCHAR(20) NOT NULL,
        grupo VARCHAR(150) NOT NULL,
        mes INTEGER NOT NULL,
        anio INTEGER NOT NULL,
        presupuestado INTEGER DEFAULT 0,
        real INTEGER DEFAULT 0,
        UNIQUE(sucursal, grupo, mes, anio)
      );

      CREATE TABLE IF NOT EXISTS dpo_nomina (
        id SERIAL PRIMARY KEY,
        sucursal VARCHAR(20) NOT NULL,
        anio INTEGER NOT NULL,
        rol VARCHAR(50) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        nombre VARCHAR(200) NOT NULL DEFAULT '',
        meses JSONB NOT NULL DEFAULT '{}',
        orden INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_dias_habiles (
        sucursal VARCHAR(20) NOT NULL,
        anio INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        dias INTEGER DEFAULT 0,
        PRIMARY KEY(sucursal, anio, mes)
      );

      CREATE TABLE IF NOT EXISTS dpo_plan_comentarios (
        sucursal VARCHAR(20) NOT NULL,
        anio INTEGER NOT NULL,
        grupo VARCHAR(150) NOT NULL,
        mes INTEGER NOT NULL,
        comentario TEXT DEFAULT '',
        estado VARCHAR(30) DEFAULT 'sin_justificar',
        PRIMARY KEY(sucursal, anio, grupo, mes)
      );
      ALTER TABLE dpo_plan_comentarios ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'sin_justificar';

      CREATE TABLE IF NOT EXISTS dpo_vacaciones (
        sucursal VARCHAR(20) NOT NULL,
        anio INTEGER NOT NULL,
        rol VARCHAR(50) NOT NULL,
        mes INTEGER NOT NULL,
        quien_planea TEXT DEFAULT '',
        dias_planeados INTEGER DEFAULT 0,
        quien_real TEXT DEFAULT '',
        dias_real INTEGER DEFAULT 0,
        PRIMARY KEY(sucursal, anio, rol, mes)
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

const TIPOS_BLOQUE = ['texto', 'imagen', 'embed', 'columnas'];

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

app.post('/api/paginas/:id/mover', async (req, res) => {
  const { direccion } = req.body;
  try {
    const r = await pool.query('SELECT id, parent_id, orden FROM dpo_paginas WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    const { parent_id, orden } = r.rows[0];
    const op = direccion === 'arriba' ? '<' : '>';
    const ord2 = direccion === 'arriba' ? 'DESC' : 'ASC';
    const q = parent_id == null
      ? `SELECT id, orden FROM dpo_paginas WHERE parent_id IS NULL AND orden ${op} $1 ORDER BY orden ${ord2} LIMIT 1`
      : `SELECT id, orden FROM dpo_paginas WHERE parent_id=$2 AND orden ${op} $1 ORDER BY orden ${ord2} LIMIT 1`;
    const args = parent_id == null ? [orden] : [orden, parent_id];
    const r2 = await pool.query(q, args);
    if (!r2.rows[0]) return res.json({ ok: true });
    const { id: id2, orden: orden2 } = r2.rows[0];
    await pool.query('UPDATE dpo_paginas SET orden=$1 WHERE id=$2', [orden2, req.params.id]);
    await pool.query('UPDATE dpo_paginas SET orden=$1 WHERE id=$2', [orden, id2]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al mover' }); }
});

// ── EXTRACCIÓN HEURÍSTICA DE CV ──
function heuristicExtract(text) {
  const campos = { apellido:'', nombre:'', localidad:'', licencia:'', tipo_licencia:'', celular:'', email:'', area:'', formacion:'', observaciones:'' };

  // Email
  const emailM = text.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
  if (emailM) campos.email = emailM[0].toLowerCase();

  // Celular - formatos argentinos
  const celM = text.match(/(?:cel(?:ular)?|tel(?:éfono|efono)?|móvil|movil|whatsapp)[:\s]*([+\d\s().-]{7,20})/i)
    || text.match(/(?:\+54|0054)?[\s-]?(?:9[\s-]?)?(?:11|2\d{2,3}|3\d{2,3})[\s-]?\d{4}[\s-]?\d{4}/);
  if (celM) campos.celular = (celM[1] || celM[0]).replace(/\s+/g,' ').trim();

  // Licencia de conducir
  if (/licencia\s+de\s+conducir|registro\s+de\s+conducir|carnet\s+de\s+manejo/i.test(text)) {
    campos.licencia = 'Sí';
    const tipoM = text.match(/(?:licencia|registro|categor[ií]a)[^A-Z\n]{0,20}([ABCDEF](?:\+E)?)/i);
    if (tipoM) campos.tipo_licencia = tipoM[1].toUpperCase();
  }

  // Formación académica
  const formM = text.match(/(?:secundario\s+(?:completo|incompleto)?|bachiller(?:ato)?|t[eé]cnico\s+en\s+\w[\w\s]{0,40}|tecnicatura\s+en\s+\w[\w\s]{0,40}|licenciado\/a?\s+en\s+\w[\w\s]{0,40}|licenciatura\s+en\s+\w[\w\s]{0,40}|ingeniero\/a?\s+en\s+\w[\w\s]{0,40}|ingenier[ií]a\s+en\s+\w[\w\s]{0,40}|contador\/a?|administraci[oó]n\s+de\s+empresas|maestr[ií]a|doctorado|profesorado)/i);
  if (formM) campos.formacion = formM[0].trim().replace(/\s+/g,' ');

  // Área según experiencia y keywords
  const areaRules = [
    ['Ventas',        /\bventa[s]?\b|vendedor|asesor\s+comercial|ejecutivo\s+de\s+cuenta|promotor/i],
    ['Logística',     /logístic|logistic|depósito|deposito|almacén|almacen|distribuc|repartidor|chofer|camionero|cadete|flete|transporte/i],
    ['Administración',/administrac|contabilidad|contador|facturac|tesorero|recursos\s+humanos|rrhh|liquidac/i],
    ['Operaciones',   /operaciones|producción|produccion|calidad|mantenimiento|operario/i],
  ];
  for (const [area, re] of areaRules) {
    if (re.test(text)) { campos.area = area; break; }
  }

  // Nombre y Apellido — primeras 15 líneas no vacías
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 15)) {
    if (/curriculum|vitae|@|http|linkedin|tel:|cel:|fecha|nac|email:|perfil|objetivo|resumen|\d{4}/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    const allCap = words.every(w => /^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ'-]+$/.test(w));
    if (allCap) {
      campos.nombre = words[0];
      campos.apellido = words.slice(1).join(' ');
      break;
    }
  }

  // Localidad — busca patrones comunes
  const locM = text.match(/(?:resido\s+en|vivo\s+en|localidad[:\s]+|ciudad[:\s]+|domicilio[:\s]+|direcci[oó]n[:\s]+)([^\n,]{3,50})/i)
    || text.match(/(?:Buenos Aires|C[oó]rdoba|Rosario|Mar del Plata|Mar de Aj[oó]|La Plata|Quilmes|Berazategui|Florencio Varela|San Clemente|Pinamar|Villa Gesell|Dolores|Chascom[uú]s|General Lavalle|Castelli|Tordillo)[^,\n]*/i);
  if (locM) campos.localidad = (locM[1] || locM[0]).trim();

  return campos;
}

// ── CANDIDATOS ──
app.get('/api/candidatos', async (req, res) => {
  try {
    const r = await pool.query('SELECT id,apellido,nombre,sexo,localidad,licencia,tipo_licencia,celular,email,area,formacion,observaciones,estado,medio_reclutamiento,cv_nombre,fecha_alta FROM dpo_candidatos ORDER BY apellido,nombre');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Error al leer' }); }
});

app.post('/api/candidatos', async (req, res) => {
  const { apellido,nombre,sexo,localidad,licencia,tipo_licencia,celular,email,area,formacion,observaciones,estado,medio_reclutamiento,fecha_alta } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO dpo_candidatos (apellido,nombre,sexo,localidad,licencia,tipo_licencia,celular,email,area,formacion,observaciones,estado,medio_reclutamiento,fecha_alta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [apellido||'',nombre||'',sexo||'',localidad||'',licencia||'',tipo_licencia||'',celular||'',email||'',area||'',formacion||'',observaciones||'',estado||'Sin entrevista',medio_reclutamiento||'',fecha_alta||null]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: 'Error al crear' }); }
});

app.put('/api/candidatos/:id', async (req, res) => {
  const { apellido,nombre,sexo,localidad,licencia,tipo_licencia,celular,email,area,formacion,observaciones,estado,medio_reclutamiento,fecha_alta } = req.body;
  try {
    await pool.query(
      `UPDATE dpo_candidatos SET apellido=$1,nombre=$2,sexo=$3,localidad=$4,licencia=$5,tipo_licencia=$6,celular=$7,email=$8,area=$9,formacion=$10,observaciones=$11,estado=$12,medio_reclutamiento=$13,fecha_alta=$14 WHERE id=$15`,
      [apellido||'',nombre||'',sexo||'',localidad||'',licencia||'',tipo_licencia||'',celular||'',email||'',area||'',formacion||'',observaciones||'',estado||'Sin entrevista',medio_reclutamiento||'',fecha_alta||null,req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al actualizar' }); }
});

app.delete('/api/candidatos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_candidatos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error al borrar' }); }
});

app.post('/api/candidatos/:id/cv', upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const b64 = req.file.buffer.toString('base64');
    await pool.query(
      'UPDATE dpo_candidatos SET cv_nombre=$1, cv_mime=$2, cv_base64=$3 WHERE id=$4',
      [req.file.originalname, req.file.mimetype, b64, req.params.id]
    );
    res.json({ ok: true, nombre: req.file.originalname });
  } catch(e) { res.status(500).json({ error: 'Error al guardar CV' }); }
});

app.get('/api/candidatos/:id/cv', async (req, res) => {
  try {
    const r = await pool.query('SELECT cv_nombre,cv_mime,cv_base64 FROM dpo_candidatos WHERE id=$1', [req.params.id]);
    if (!r.rows[0] || !r.rows[0].cv_base64) return res.status(404).send('Sin CV');
    const { cv_nombre, cv_mime, cv_base64 } = r.rows[0];
    res.set('Content-Type', cv_mime || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${cv_nombre || 'cv'}"`);
    res.send(Buffer.from(cv_base64, 'base64'));
  } catch(e) { res.status(500).send('Error'); }
});

app.post('/api/cv-extract', upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  let texto = '';
  try {
    const mime = req.file.mimetype;
    const buf = req.file.buffer;
    if (mime === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf')) {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buf);
      texto = data.text;
    } else if (mime.includes('word') || req.file.originalname.toLowerCase().match(/\.docx?$/)) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      texto = result.value;
    } else {
      texto = buf.toString('utf8');
    }
  } catch(e) {
    return res.json({ texto: '', campos: null, error: 'No se pudo leer el archivo: ' + e.message });
  }

  let campos = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && texto.trim().length > 30) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const prompt = `Sos un asistente de RRHH. A partir del texto de un CV, devolvé ÚNICAMENTE un objeto JSON válido sin texto adicional ni markdown con estos campos exactos:
{"apellido":"","nombre":"","localidad":"","licencia":"","tipo_licencia":"","celular":"","email":"","area":"","formacion":"","observaciones":""}
Reglas:
- "licencia": "Sí" o "No" solo si se menciona, si no dejar vacío.
- "tipo_licencia": categoría A, B, B+E, C, D, E o F si se menciona, si no vacío.
- "area": elegí la más adecuada entre Administración, Logística, Ventas, Operaciones, Otro.
- "formacion": título o nivel educativo más relevante.
- "observaciones": 2-3 líneas resumiendo el perfil y experiencia principal.
- Si un dato no aparece, dejalo como cadena vacía. No inventes información.
Texto del CV:
"""${texto.slice(0, 6000)}"""`;
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      });
      let raw = msg.content[0].text.trim().replace(/^```json/i,'').replace(/^```/,'').replace(/```$/,'').trim();
      const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
      if (s >= 0 && e > s) raw = raw.slice(s, e+1);
      campos = JSON.parse(raw);
    } catch(e) {
      console.error('Claude extract error:', e.message);
      campos = heuristicExtract(texto);
    }
  } else if (texto.trim().length > 30) {
    campos = heuristicExtract(texto);
  }

  res.json({ texto: texto.slice(0, 500), campos });
});

// ── PROXY DE IMÁGENES DE DRIVE ──
// Google Drive manda Cross-Origin-Resource-Policy: same-site en /uc?export=view,
// lo que bloquea usarlo como <img src> desde otro dominio. Lo traemos server-side.
app.get('/api/img-proxy/:id', async (req, res) => {
  try {
    const upstream = await fetch('https://drive.google.com/uc?export=view&id=' + encodeURIComponent(req.params.id));
    if (!upstream.ok) return res.status(502).send('No se pudo obtener la imagen');
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) return res.status(415).send('El archivo no es una imagen o no es público');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch(e) { res.status(502).send('No se pudo obtener la imagen'); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pilar-gente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pilar-gente.html')));
app.get('/base-candidatos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'base-candidatos.html')));
app.get('/plan-demanda', (req, res) => res.sendFile(path.join(__dirname, 'public', 'plan-demanda.html')));
app.get('/visor-doc', (req, res) => res.sendFile(path.join(__dirname, 'public', 'visor-doc.html')));

// ── COMENTARIOS PLAN DE DEMANDA ──
app.get('/api/plan-comentarios/:sucursal/:anio', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT grupo, mes, comentario, estado FROM dpo_plan_comentarios WHERE sucursal=$1 AND anio=$2',
      [req.params.sucursal, req.params.anio]
    );
    const data = {};
    r.rows.forEach(row => {
      if(!data[row.grupo]) data[row.grupo]={};
      data[row.grupo][row.mes] = { comentario: row.comentario, estado: row.estado||'sin_justificar' };
    });
    res.json(data);
  } catch(e) { res.json({}); }
});

app.put('/api/plan-comentarios/:sucursal/:anio', async (req, res) => {
  const { sucursal, anio } = req.params;
  const { comments } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dpo_plan_comentarios WHERE sucursal=$1 AND anio=$2', [sucursal, anio]);
    for (const grupo of Object.keys(comments)) {
      for (const mes of Object.keys(comments[grupo])) {
        const { comentario, estado } = comments[grupo][mes];
        if (!comentario && estado === 'sin_justificar') continue;
        await client.query(
          'INSERT INTO dpo_plan_comentarios (sucursal,anio,grupo,mes,comentario,estado) VALUES ($1,$2,$3,$4,$5,$6)',
          [sucursal, parseInt(anio), grupo, parseInt(mes), comentario||'', estado||'sin_justificar']
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── NÓMINA MENSUAL ──
app.get('/api/nomina/:sucursal/:anio', async (req, res) => {
  const r = await pool.query(
    'SELECT id,rol,tipo,nombre,meses,orden FROM dpo_nomina WHERE sucursal=$1 AND anio=$2 ORDER BY rol,tipo,orden,id',
    [req.params.sucursal, req.params.anio]
  );
  res.json(r.rows);
});

app.put('/api/nomina/:sucursal/:anio', async (req, res) => {
  const { sucursal, anio } = req.params;
  const { personas } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dpo_nomina WHERE sucursal=$1 AND anio=$2', [sucursal, anio]);
    for (let i = 0; i < personas.length; i++) {
      const { rol, tipo, nombre, meses } = personas[i];
      await client.query(
        'INSERT INTO dpo_nomina (sucursal,anio,rol,tipo,nombre,meses,orden) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [sucursal, anio, rol, tipo, nombre||'', JSON.stringify(meses||{}), i]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── DÍAS HÁBILES ──
app.get('/api/dias-habiles/:sucursal/:anio', async (req, res) => {
  const r = await pool.query(
    'SELECT mes,dias FROM dpo_dias_habiles WHERE sucursal=$1 AND anio=$2',
    [req.params.sucursal, req.params.anio]
  );
  const data = {};
  for(let m=1;m<=12;m++) data[m]=0;
  r.rows.forEach(row => { data[row.mes]=row.dias; });
  res.json(data);
});

app.put('/api/dias-habiles/:sucursal/:anio', async (req, res) => {
  const { sucursal, anio } = req.params;
  const { dias } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const mes of Object.keys(dias)) {
      await client.query(
        `INSERT INTO dpo_dias_habiles (sucursal,anio,mes,dias) VALUES ($1,$2,$3,$4)
         ON CONFLICT (sucursal,anio,mes) DO UPDATE SET dias=$4`,
        [sucursal, parseInt(anio), parseInt(mes), parseInt(dias[mes])||0]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── VACACIONES ──
app.get('/api/vacaciones/:sucursal/:anio', async (req, res) => {
  const r = await pool.query(
    'SELECT rol,mes,quien_planea,dias_planeados,quien_real,dias_real FROM dpo_vacaciones WHERE sucursal=$1 AND anio=$2',
    [req.params.sucursal, req.params.anio]
  );
  const data = {};
  r.rows.forEach(row => {
    if(!data[row.rol]) data[row.rol]={};
    data[row.rol][row.mes]={ quien_planea:row.quien_planea, dias_planeados:row.dias_planeados, quien_real:row.quien_real, dias_real:row.dias_real };
  });
  res.json(data);
});

app.put('/api/vacaciones/:sucursal/:anio', async (req, res) => {
  const { sucursal, anio } = req.params;
  const { data } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const rol of Object.keys(data)) {
      for (const mes of Object.keys(data[rol])) {
        const { quien_planea, dias_planeados, quien_real, dias_real } = data[rol][mes];
        await client.query(
          `INSERT INTO dpo_vacaciones (sucursal,anio,rol,mes,quien_planea,dias_planeados,quien_real,dias_real)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (sucursal,anio,rol,mes) DO UPDATE SET quien_planea=$5,dias_planeados=$6,quien_real=$7,dias_real=$8`,
          [sucursal, parseInt(anio), rol, parseInt(mes), quien_planea||'', parseInt(dias_planeados)||0, quien_real||'', parseInt(dias_real)||0]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── PLAN DE DEMANDA ──
const GRUPOS_DEMANDA = [
  'Distribucion - Chofer - Fijo',
  'Distribucion - Chofer - Temporada',
  'Distribucion - Ayudante - Fijo',
  'Distribucion - Ayudante - Temporada',
  'Deposito - Operario - Fijo',
  'Deposito - Operario - Temporada',
  'Administrativos - Administrativo - Fijo'
];

app.get('/api/plan-demanda/:sucursal/:anio', async (req, res) => {
  const { sucursal, anio } = req.params;
  const [rPlan, rNomina] = await Promise.all([
    pool.query('SELECT grupo,mes,presupuestado FROM dpo_plan_demanda WHERE sucursal=$1 AND anio=$2', [sucursal, anio]),
    pool.query('SELECT rol,tipo,meses FROM dpo_nomina WHERE sucursal=$1 AND anio=$2', [sucursal, anio])
  ]);
  const ROL_MAP = {
    'Chofer|Fijo':'Distribucion - Chofer - Fijo','Chofer|Temporada':'Distribucion - Chofer - Temporada',
    'Ayudante|Fijo':'Distribucion - Ayudante - Fijo','Ayudante|Temporada':'Distribucion - Ayudante - Temporada',
    'Operario|Fijo':'Deposito - Operario - Fijo','Operario|Temporada':'Deposito - Operario - Temporada',
    'Administrativo|Fijo':'Administrativos - Administrativo - Fijo'
  };
  const real = {};
  GRUPOS_DEMANDA.forEach(g => { real[g]={}; for(let m=1;m<=12;m++) real[g][m]=0; });
  rNomina.rows.forEach(p => {
    const grupo = ROL_MAP[`${p.rol}|${p.tipo}`];
    if(!grupo) return;
    const meses = p.meses || {};
    for(let m=1;m<=12;m++) { if((meses[m]||'').toUpperCase()==='X') real[grupo][m]++; }
  });
  const data = {};
  GRUPOS_DEMANDA.forEach(g => { data[g]={}; for(let m=1;m<=12;m++) data[g][m]={presupuestado:0,real:real[g][m]}; });
  rPlan.rows.forEach(row => { if(data[row.grupo]) data[row.grupo][row.mes].presupuestado=row.presupuestado; });
  res.json(data);
});

app.put('/api/plan-demanda/:sucursal/:anio', async (req, res) => {
  const { sucursal, anio } = req.params;
  const { data } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const grupo of Object.keys(data)) {
      for (const mes of Object.keys(data[grupo])) {
        const { presupuestado, real } = data[grupo][mes];
        await client.query(
          `INSERT INTO dpo_plan_demanda (sucursal,grupo,mes,anio,presupuestado,real) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (sucursal,grupo,mes,anio) DO UPDATE SET presupuestado=$5, real=$6`,
          [sucursal, grupo, parseInt(mes), parseInt(anio), presupuestado||0, real||0]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/api/docs/:file/html', async (req, res) => {
  try {
    const mammoth = require('mammoth');
    const filePath = path.join(__dirname, 'public', 'docs', req.params.file);
    const result = await mammoth.convertToHtml({ path: filePath });
    res.json({ html: result.value });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`DPO Gente corriendo en puerto ${PORT}`);
  try {
    await initDB();
  } catch (err) {
    console.error('Error al inicializar DB:', err.message);
  }
});
