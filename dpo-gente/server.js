console.log('SERVER.JS LOADING - v' + Date.now());
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Almacenamiento en disco para archivos adjuntos (no satura Postgres)
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/tmp/uploads';
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).substr(2,9) + ext);
  }
});
const uploadDisk = multer({ storage: diskStorage, limits: { fileSize: 50 * 1024 * 1024 } });

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
        password_acceso VARCHAR(200),
        CHECK (id = 1)
      );

      ALTER TABLE dpo_config ADD COLUMN IF NOT EXISTS password_acceso VARCHAR(200);

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
      CREATE TABLE IF NOT EXISTS dpo_tendencias_snapshot (
        id SERIAL PRIMARY KEY,
        mes INTEGER NOT NULL,
        anio INTEGER NOT NULL,
        rows JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(mes, anio)
      );
      CREATE TABLE IF NOT EXISTS dpo_vacantes (
        id SERIAL PRIMARY KEY,
        sede VARCHAR(50) NOT NULL DEFAULT 'Dolores',
        mes VARCHAR(20),
        anio INTEGER,
        posicion VARCHAR(200),
        sector VARCHAR(100),
        tipo_contratacion VARCHAR(100),
        apertura DATE,
        fecha_inicio DATE,
        fecha_finalizacion DATE,
        status VARCHAR(50) DEFAULT 'En curso',
        nuevo_ingreso BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE dpo_vacantes ADD COLUMN IF NOT EXISTS fecha_finalizacion DATE;
      CREATE TABLE IF NOT EXISTS dpo_vacantes_preguntas (
        id SERIAL PRIMARY KEY,
        vacante_id INTEGER REFERENCES dpo_vacantes(id) ON DELETE CASCADE,
        pregunta TEXT NOT NULL,
        orden INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS dpo_vacantes_respuestas (
        id SERIAL PRIMARY KEY,
        candidato_id INTEGER REFERENCES dpo_vacantes_candidatos(id) ON DELETE CASCADE,
        pregunta_id INTEGER REFERENCES dpo_vacantes_preguntas(id) ON DELETE CASCADE,
        respuesta TEXT DEFAULT '',
        UNIQUE(candidato_id, pregunta_id)
      );
      CREATE TABLE IF NOT EXISTS dpo_movimientos (
        id SERIAL PRIMARY KEY,
        fecha DATE,
        mes VARCHAR(20),
        anio INTEGER,
        apellido_nombre VARCHAR(200),
        posicion_anterior VARCHAR(200),
        posicion_nueva VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_vacantes_candidatos (
        id SERIAL PRIMARY KEY,
        vacante_id INTEGER REFERENCES dpo_vacantes(id) ON DELETE CASCADE,
        nombre VARCHAR(100),
        apellido VARCHAR(100),
        celular VARCHAR(50),
        mail VARCHAR(200),
        fuente VARCHAR(100),
        fecha_entrevista_lider DATE,
        fecha_entrevista_rrhh DATE,
        fecha_entrevista_dueno DATE,
        comentarios TEXT,
        accion VARCHAR(50),
        feedback TEXT,
        pool_posicion VARCHAR(200),
        fecha_cierre DATE,
        fecha_ingreso DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_pac_capacitaciones (
        id SERIAL PRIMARY KEY,
        pilar VARCHAR(200) NOT NULL,
        nombre VARCHAR(300) NOT NULL,
        responsable VARCHAR(200),
        fecha_programada DATE,
        fecha_ejecucion DATE,
        material_link TEXT,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_pac_nomina (
        id SERIAL PRIMARY KEY,
        apellido VARCHAR(100) NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        sector VARCHAR(100) DEFAULT '',
        posicion VARCHAR(100) DEFAULT '',
        activo BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS dpo_pac_asistentes (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER REFERENCES dpo_pac_capacitaciones(id) ON DELETE CASCADE,
        nomina_id INTEGER REFERENCES dpo_pac_nomina(id) ON DELETE CASCADE,
        aplica BOOLEAN DEFAULT true,
        asistio BOOLEAN DEFAULT false,
        aprobado BOOLEAN DEFAULT false,
        UNIQUE(capacitacion_id, nomina_id)
      );

      CREATE TABLE IF NOT EXISTS dpo_aus_empleados (
        legajo VARCHAR(20) PRIMARY KEY,
        dni VARCHAR(20) UNIQUE NOT NULL,
        apellido TEXT NOT NULL DEFAULT '',
        nombre TEXT NOT NULL DEFAULT '',
        sector_nombre TEXT DEFAULT '',
        sucursal_nombre TEXT DEFAULT '',
        estado TEXT DEFAULT 'activo'
      );
      ALTER TABLE dpo_aus_empleados ADD COLUMN IF NOT EXISTS sucursal_nombre TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS dpo_eng_encuestas (
        id SERIAL PRIMARY KEY,
        periodo VARCHAR(100) NOT NULL,
        descripcion TEXT,
        fecha_carga TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dpo_eng_adjuntos (
        id SERIAL PRIMARY KEY,
        encuesta_id INT REFERENCES dpo_eng_encuestas(id) ON DELETE CASCADE,
        nombre VARCHAR(300) NOT NULL,
        mime_type VARCHAR(100),
        tamanio INT,
        datos BYTEA NOT NULL,
        fecha_carga TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dpo_eng_resultados (
        id SERIAL PRIMARY KEY,
        encuesta_id INT REFERENCES dpo_eng_encuestas(id) ON DELETE CASCADE,
        nivel VARCHAR(20) NOT NULL, -- 'dimension' o 'pregunta'
        dimension VARCHAR(300) NOT NULL,
        pregunta TEXT,
        corte_tipo VARCHAR(50) NOT NULL, -- 'total','sector','posicion','genero','jefe'
        corte_valor VARCHAR(300) NOT NULL,
        puntaje INT
      );
      CREATE TABLE IF NOT EXISTS dpo_eng_textos (
        id SERIAL PRIMARY KEY,
        encuesta_id INT REFERENCES dpo_eng_encuestas(id) ON DELETE CASCADE,
        pregunta TEXT,
        respuesta TEXT,
        corte_tipo VARCHAR(50),
        corte_valor VARCHAR(300)
      );

      CREATE TABLE IF NOT EXISTS dpo_el_reportes (
        id SERIAL PRIMARY KEY,
        fecha DATE,
        sucursal VARCHAR(100),
        categoria VARCHAR(100),
        nombre VARCHAR(200),
        descripcion TEXT,
        estado VARCHAR(50) DEFAULT 'Pendiente',
        responsable VARCHAR(200),
        fecha_cierre DATE,
        foto_url TEXT,
        notas_cierre TEXT,
        origen VARCHAR(20) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dpo_el_revision (
        id INTEGER PRIMARY KEY DEFAULT 1,
        pendiente TEXT,
        resuelto TEXT,
        inversion TEXT,
        updated_at TIMESTAMP DEFAULT NOW(),
        CHECK (id = 1)
      );
      INSERT INTO dpo_el_revision (id) VALUES (1) ON CONFLICT DO NOTHING;

      -- migrations: rename sector->sucursal if needed
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dpo_el_reportes' AND column_name='sector') THEN
          ALTER TABLE dpo_el_reportes RENAME COLUMN sector TO sucursal;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dpo_el_reportes' AND column_name='sucursal') THEN
          ALTER TABLE dpo_el_reportes ADD COLUMN sucursal VARCHAR(100);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS dpo_cl_conflictos (
        id SERIAL PRIMARY KEY,
        fecha DATE,
        nombre VARCHAR(200),
        contacto VARCHAR(200),
        problema TEXT,
        estado VARCHAR(50) DEFAULT 'Pendiente',
        responsable VARCHAR(200),
        fecha_cierre DATE,
        notas_cierre TEXT,
        origen VARCHAR(20) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_el_evidencias (
        id SERIAL PRIMARY KEY,
        fecha DATE,
        descripcion VARCHAR(300),
        archivo_nombre VARCHAR(300),
        archivo_tipo VARCHAR(100),
        archivo_data TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_ns_reuniones (
        id SERIAL PRIMARY KEY,
        anio INTEGER NOT NULL,
        fecha DATE,
        tema VARCHAR(300),
        representantes TEXT,
        tipo VARCHAR(50) DEFAULT 'ordinaria',
        estado VARCHAR(30) DEFAULT 'pendiente_minuta',
        resumen TEXT,
        archivo_nombre VARCHAR(300),
        archivo_tipo VARCHAR(100),
        archivo_data TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_ns_negociaciones (
        id SERIAL PRIMARY KEY,
        anio INTEGER NOT NULL,
        fecha DATE,
        tipo VARCHAR(100),
        sindicato VARCHAR(50) DEFAULT 'Camioneros',
        descripcion TEXT,
        estado VARCHAR(30) DEFAULT 'en_curso',
        resultado TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE dpo_ns_negociaciones ADD COLUMN IF NOT EXISTS sindicato VARCHAR(50) DEFAULT 'Camioneros';

      CREATE TABLE IF NOT EXISTS dpo_ns_pdas (
        id SERIAL PRIMARY KEY,
        negociacion_id INTEGER REFERENCES dpo_ns_negociaciones(id) ON DELETE CASCADE,
        accion TEXT,
        responsable VARCHAR(200),
        fecha_limite DATE,
        estado VARCHAR(30) DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_pc_comunicaciones (
        id SERIAL PRIMARY KEY,
        anio INTEGER NOT NULL,
        tipo VARCHAR(100),
        contenido VARCHAR(300),
        emisor VARCHAR(200),
        frecuencia VARCHAR(50),
        medio VARCHAR(200),
        destinatarios VARCHAR(200),
        por_que TEXT,
        meses JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_ciclogente_pdf (
        id INTEGER PRIMARY KEY DEFAULT 1,
        nombre VARCHAR(300),
        tipo VARCHAR(100),
        contenido TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_pc_evidencias (
        id SERIAL PRIMARY KEY,
        comunicacion_id INTEGER NOT NULL REFERENCES dpo_pc_comunicaciones(id) ON DELETE CASCADE,
        mes INTEGER,
        nombre VARCHAR(300),
        tipo VARCHAR(100),
        imagen TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_pc_feedback (
        id SERIAL PRIMARY KEY,
        anio INTEGER NOT NULL,
        fecha DATE,
        aporte TEXT,
        autor VARCHAR(200),
        genero_ajuste BOOLEAN DEFAULT FALSE,
        ajuste_descripcion TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_ns_calendario (
        id SERIAL PRIMARY KEY,
        anio INTEGER NOT NULL,
        accion VARCHAR(300),
        responsable VARCHAR(200),
        fecha_inicio DATE,
        fecha_fin DATE,
        estado VARCHAR(30) DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_ns_documentos (
        id SERIAL PRIMARY KEY,
        anio INTEGER NOT NULL,
        fecha DATE,
        categoria VARCHAR(100),
        descripcion VARCHAR(300),
        archivo_nombre VARCHAR(300),
        archivo_tipo VARCHAR(100),
        archivo_data TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_opr_periodos (
        id SERIAL PRIMARY KEY,
        periodo VARCHAR(100) NOT NULL,
        descripcion TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dpo_opr_personas (
        id SERIAL PRIMARY KEY,
        periodo_id INT REFERENCES dpo_opr_periodos(id) ON DELETE CASCADE,
        sucursal VARCHAR(100),
        dni VARCHAR(20),
        nombre VARCHAR(200),
        genero VARCHAR(50),
        posicion VARCHAR(200),
        sector VARCHAR(100),
        antiguedad NUMERIC(5,1),
        tiempo_posicion NUMERIC(5,1),
        nota_ant2 VARCHAR(20),
        nota_ant1 VARCHAR(20),
        nota_prelim VARCHAR(20),
        nota_final VARCHAR(20),
        riesgo_salida VARCHAR(50),
        mapeo_talento VARCHAR(50),
        comentario_opr TEXT,
        comentario_humand TEXT,
        para_moverse VARCHAR(10),
        plazo_movimiento VARCHAR(100),
        area_movimiento VARCHAR(200),
        traslado VARCHAR(10),
        kpi1 TEXT,
        kpi2 TEXT,
        kpi3 TEXT,
        clima TEXT,
        clima_lider TEXT
      );

      CREATE TABLE IF NOT EXISTS dpo_aus_dias_no_lab (
        fecha DATE PRIMARY KEY,
        descripcion TEXT
      );
      ALTER TABLE dpo_aus_dias_no_lab ADD COLUMN IF NOT EXISTS sucursal_nombre TEXT NOT NULL DEFAULT 'TODAS';
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dpo_aus_dias_no_lab_pkey') THEN
          ALTER TABLE dpo_aus_dias_no_lab DROP CONSTRAINT dpo_aus_dias_no_lab_pkey;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dpo_aus_dias_no_lab_fecha_suc_key') THEN
          ALTER TABLE dpo_aus_dias_no_lab ADD CONSTRAINT dpo_aus_dias_no_lab_fecha_suc_key UNIQUE (fecha, sucursal_nombre);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS dpo_aus_jornadas (
        id SERIAL PRIMARY KEY,
        dni VARCHAR(20) NOT NULL,
        empleado_nombre TEXT NOT NULL,
        sector_nombre TEXT,
        sucursal_nombre TEXT,
        fecha DATE NOT NULL,
        horas_trabajadas NUMERIC(5,2),
        datos_completos BOOLEAN DEFAULT true,
        UNIQUE(dni, fecha)
      );
      ALTER TABLE dpo_aus_jornadas ADD COLUMN IF NOT EXISTS sucursal_nombre TEXT;
      ALTER TABLE dpo_aus_jornadas ADD COLUMN IF NOT EXISTS hora_ingreso TEXT;
      ALTER TABLE dpo_aus_jornadas ADD COLUMN IF NOT EXISTS hora_egreso TEXT;

      CREATE TABLE IF NOT EXISTS dpo_aus_ausencias (
        id SERIAL PRIMARY KEY,
        dni VARCHAR(20) NOT NULL,
        empleado_nombre TEXT NOT NULL,
        sector_nombre TEXT,
        sucursal_nombre TEXT,
        fecha DATE NOT NULL,
        categoria TEXT DEFAULT 'Faltas no programadas',
        enfermedad_afeccion TEXT,
        motivo_original TEXT,
        fuente TEXT,
        UNIQUE(dni, fecha)
      );
      ALTER TABLE dpo_aus_ausencias ADD COLUMN IF NOT EXISTS sucursal_nombre TEXT;

      CREATE TABLE IF NOT EXISTS dpo_aus_exclusiones (
        legajo VARCHAR(20) PRIMARY KEY,
        nombre TEXT,
        razon TEXT
      );

      CREATE TABLE IF NOT EXISTS dpo_gente_usuarios (
        nombre TEXT PRIMARY KEY,
        admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dpo_gente_permisos (
        nombre TEXT NOT NULL,
        modulo TEXT NOT NULL,
        PRIMARY KEY (nombre, modulo)
      );
    `);
    await seedDefaults(client);
    // Migraciones: columna ruta para tablas que tenían base64
    await client.query(`ALTER TABLE dpo_pc_evidencias ADD COLUMN IF NOT EXISTS ruta VARCHAR(500)`).catch(()=>{});
    await client.query(`ALTER TABLE dpo_distrib_archivos ADD COLUMN IF NOT EXISTS ruta VARCHAR(500)`).catch(()=>{});
    console.log('Base de datos inicializada (DPO Gente).');
  } finally {
    client.release();
  }
}

// ── AUTH (contraseña única, sin usuarios individuales) ──
const MODULOS_DISPONIBLES = ['ausentismo','pac','reclutamiento','aprendizaje','engagement','talento','comite-gente','kpi-ausentismo'];

app.post('/api/login', async (req, res) => {
  const { password, nombre } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Ingresá tu nombre' });
  const expected = process.env.PILAR_GENTE_PASSWORD || 'dpogente2024';
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin2026';
  const isAdmin = password === adminPwd;
  try {
    // Leer contraseña de acceso desde DB (fallback a env var)
    const cfgRes = await pool.query('SELECT password_acceso FROM dpo_config WHERE id=1');
    const pwdDB = cfgRes.rows[0]?.password_acceso;
    const expectedFinal = pwdDB || expected;
    if (password !== expectedFinal && !isAdmin) return res.status(401).json({ error: 'Contraseña incorrecta' });
    // Si no es admin, verificar que el usuario fue creado previamente
    if (!isAdmin) {
      const existe = await pool.query('SELECT 1 FROM dpo_gente_usuarios WHERE nombre=$1', [nombre.trim()]);
      if (!existe.rows.length) return res.status(401).json({ error: 'Usuario no registrado. Pedile al administrador que te cree el acceso.' });
    } else {
      // Admin: registrar si no existe
      await pool.query(
        `INSERT INTO dpo_gente_usuarios (nombre, admin) VALUES ($1, true) ON CONFLICT (nombre) DO UPDATE SET admin=true`,
        [nombre.trim()]
      );
    }
    const pRes = await pool.query('SELECT modulo FROM dpo_gente_permisos WHERE nombre=$1', [nombre.trim()]);
    const modulos = isAdmin ? MODULOS_DISPONIBLES : pRes.rows.map(r => r.modulo);
    res.json({ ok: true, admin: isAdmin, modulos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: listar usuarios con sus permisos
app.get('/api/admin/usuarios', async (req, res) => {
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin2026';
  if (req.headers['x-admin-key'] !== adminPwd) return res.status(403).json({ error: 'Sin acceso' });
  try {
    const usuarios = (await pool.query('SELECT nombre, admin FROM dpo_gente_usuarios ORDER BY nombre')).rows;
    const permisos = (await pool.query('SELECT nombre, modulo FROM dpo_gente_permisos')).rows;
    const map = {};
    permisos.forEach(p => { if (!map[p.nombre]) map[p.nombre] = []; map[p.nombre].push(p.modulo); });
    res.json(usuarios.map(u => ({ ...u, modulos: u.admin ? MODULOS_DISPONIBLES : (map[u.nombre] || []) })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: cambiar contraseña de acceso
app.post('/api/admin/password', async (req, res) => {
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin2026';
  if (req.headers['x-admin-key'] !== adminPwd) return res.status(403).json({ error: 'Sin acceso' });
  const { password } = req.body;
  if (!password || !password.trim()) return res.status(400).json({ error: 'Contraseña requerida' });
  try {
    await pool.query(`INSERT INTO dpo_config (id, password_acceso) VALUES (1, $1)
      ON CONFLICT (id) DO UPDATE SET password_acceso=$1`, [password.trim()]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: crear usuario
app.post('/api/admin/usuarios', async (req, res) => {
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin2026';
  if (req.headers['x-admin-key'] !== adminPwd) return res.status(403).json({ error: 'Sin acceso' });
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    await pool.query(`INSERT INTO dpo_gente_usuarios (nombre, admin) VALUES ($1, false) ON CONFLICT DO NOTHING`, [nombre.trim()]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: eliminar usuario
app.delete('/api/admin/usuarios/:nombre', async (req, res) => {
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin2026';
  if (req.headers['x-admin-key'] !== adminPwd) return res.status(403).json({ error: 'Sin acceso' });
  try {
    await pool.query('DELETE FROM dpo_gente_permisos WHERE nombre=$1', [req.params.nombre]);
    await pool.query('DELETE FROM dpo_gente_usuarios WHERE nombre=$1 AND admin=false', [req.params.nombre]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: toggle permiso
app.post('/api/admin/permisos/toggle', async (req, res) => {
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin2026';
  if (req.headers['x-admin-key'] !== adminPwd) return res.status(403).json({ error: 'Sin acceso' });
  const { nombre, modulo, activo } = req.body;
  try {
    if (activo) {
      await pool.query('INSERT INTO dpo_gente_permisos (nombre,modulo) VALUES ($1,$2) ON CONFLICT DO NOTHING', [nombre, modulo]);
    } else {
      await pool.query('DELETE FROM dpo_gente_permisos WHERE nombre=$1 AND modulo=$2', [nombre, modulo]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

const TIPOS_BLOQUE = ['titulo', 'texto', 'imagen', 'embed', 'columnas'];

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

app.patch('/api/paginas/:id/orden', async (req, res) => {
  const { orden } = req.body;
  if (orden == null) return res.status(400).json({ error: 'Falta orden' });
  try {
    await pool.query('UPDATE dpo_paginas SET orden=$1 WHERE id=$2', [orden, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Error' }); }
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

// ── PAC — Nómina ──
app.get('/api/pac/nomina', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_pac_nomina WHERE activo=true ORDER BY apellido, nombre');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pac/nomina', async (req, res) => {
  const { apellido, nombre, sector, posicion } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO dpo_pac_nomina (apellido,nombre,sector,posicion) VALUES ($1,$2,$3,$4) RETURNING *',
      [apellido||'', nombre||'', sector||'', posicion||'']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pac/nomina/:id', async (req, res) => {
  const { apellido, nombre, sector, posicion, activo } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dpo_pac_nomina SET apellido=$1,nombre=$2,sector=$3,posicion=$4,activo=$5 WHERE id=$6 RETURNING *',
      [apellido||'', nombre||'', sector||'', posicion||'', activo !== false, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PAC — Capacitaciones ──
app.get('/api/pac', async (req, res) => {
  try {
    const caps = await pool.query('SELECT * FROM dpo_pac_capacitaciones ORDER BY pilar, nombre, id');
    const asis = await pool.query(`
      SELECT a.*, n.apellido, n.nombre AS nombre_persona, n.sector, n.posicion
      FROM dpo_pac_asistentes a
      JOIN dpo_pac_nomina n ON n.id = a.nomina_id
      ORDER BY n.apellido, n.nombre
    `);
    const aMap = {};
    asis.rows.forEach(a => { (aMap[a.capacitacion_id] = aMap[a.capacitacion_id] || []).push(a); });
    res.json(caps.rows.map(c => ({ ...c, asistentes: aMap[c.id] || [] })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pac', async (req, res) => {
  const { pilar, nombre, responsable, fecha_programada, fecha_ejecucion, material_link, link_respuestas, link_formulario, observaciones, asistentes } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO dpo_pac_capacitaciones (pilar,nombre,responsable,fecha_programada,fecha_ejecucion,material_link,link_respuestas,link_formulario,observaciones) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [pilar||'', nombre||'', responsable||null, fecha_programada||null, fecha_ejecucion||null, material_link||null, link_respuestas||null, link_formulario||null, observaciones||null]
    );
    const cap = r.rows[0];
    if (Array.isArray(asistentes)) {
      for (const a of asistentes) {
        await pool.query(
          'INSERT INTO dpo_pac_asistentes (capacitacion_id,nomina_id,aplica,asistio,aprobado) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (capacitacion_id,nomina_id) DO UPDATE SET aplica=$3,asistio=$4,aprobado=$5',
          [cap.id, a.nomina_id, !!a.aplica, !!a.asistio, !!a.aprobado]
        );
      }
    }
    const asis = await pool.query(`SELECT a.*,n.apellido,n.nombre AS nombre_persona,n.sector,n.posicion FROM dpo_pac_asistentes a JOIN dpo_pac_nomina n ON n.id=a.nomina_id WHERE a.capacitacion_id=$1 ORDER BY n.apellido,n.nombre`, [cap.id]);
    res.json({ ...cap, asistentes: asis.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pac/:id', async (req, res) => {
  const { pilar, nombre, responsable, fecha_programada, fecha_ejecucion, material_link, link_respuestas, link_formulario, observaciones, asistentes } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dpo_pac_capacitaciones SET pilar=$1,nombre=$2,responsable=$3,fecha_programada=$4,fecha_ejecucion=$5,material_link=$6,link_respuestas=$7,link_formulario=$8,observaciones=$9 WHERE id=$10 RETURNING *',
      [pilar||'', nombre||'', responsable||null, fecha_programada||null, fecha_ejecucion||null, material_link||null, link_respuestas||null, link_formulario||null, observaciones||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const cap = r.rows[0];
    if (Array.isArray(asistentes)) {
      await pool.query('DELETE FROM dpo_pac_asistentes WHERE capacitacion_id=$1', [cap.id]);
      for (const a of asistentes) {
        await pool.query(
          'INSERT INTO dpo_pac_asistentes (capacitacion_id,nomina_id,aplica,asistio,aprobado) VALUES ($1,$2,$3,$4,$5)',
          [cap.id, a.nomina_id, !!a.aplica, !!a.asistio, !!a.aprobado]
        );
      }
    }
    const asis = await pool.query(`SELECT a.*,n.apellido,n.nombre AS nombre_persona,n.sector,n.posicion FROM dpo_pac_asistentes a JOIN dpo_pac_nomina n ON n.id=a.nomina_id WHERE a.capacitacion_id=$1 ORDER BY n.apellido,n.nombre`, [cap.id]);
    res.json({ ...cap, asistentes: asis.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pac/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_pac_capacitaciones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
app.get('/reclu-hub', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reclu-hub.html')));
app.get('/tendencias', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tendencias.html')));
app.get('/vacantes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vacantes.html')));
app.get('/movimientos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'movimientos.html')));
app.get('/aprendizaje-hub', (req, res) => res.sendFile(path.join(__dirname, 'public', 'aprendizaje-hub.html')));
app.get('/pac', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pac.html')));
app.get('/ambiente-hub', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ambiente-hub.html')));
app.get('/ausentismo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ausentismo.html')));
app.get('/engagement', (req, res) => res.sendFile(path.join(__dirname, 'public', 'engagement-hub.html')));
app.get('/encuesta-clima', (req, res) => res.sendFile(path.join(__dirname, 'public', 'engagement.html')));
app.get('/entrevista-permanencia', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entrevista-permanencia.html')));
app.get('/comite-gente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'comite-gente-hub.html')));
app.get('/comite-gente/reuniones', (req, res) => res.sendFile(path.join(__dirname, 'public', 'comite-gente-reuniones.html')));
app.get('/opr', (req, res) => res.sendFile(path.join(__dirname, 'public', 'opr.html')));
app.get('/entorno-laboral', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entorno-laboral.html')));
app.get('/negociacion-sindical', (req, res) => res.sendFile(path.join(__dirname, 'public', 'negociacion-sindical.html')));
app.get('/plan-comunicaciones', (req, res) => res.sendFile(path.join(__dirname, 'public', 'plan-comunicaciones.html')));
app.get('/talento-hub', (req, res) => res.sendFile(path.join(__dirname, 'public', 'talento-hub.html')));
app.get('/ciclo-gente-hub', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ciclo-gente-hub.html')));

// ===================== COMITÉ DE GENTE =====================
pool.query(`CREATE TABLE IF NOT EXISTS dpo_comite_miembros (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  empresa VARCHAR(100),
  funcion VARCHAR(150),
  puesto VARCHAR(200),
  gop_responsable VARCHAR(100),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});

pool.query(`CREATE TABLE IF NOT EXISTS dpo_comite_reuniones (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  anio INT,
  mes INT,
  tipo VARCHAR(80) DEFAULT 'mensual',
  lugar VARCHAR(200),
  tor TEXT,
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});

pool.query(`CREATE TABLE IF NOT EXISTS dpo_comite_asistencia (
  id SERIAL PRIMARY KEY,
  reunion_id INT REFERENCES dpo_comite_reuniones(id) ON DELETE CASCADE,
  miembro_id INT REFERENCES dpo_comite_miembros(id) ON DELETE CASCADE,
  estado CHAR(1) DEFAULT 'P',
  UNIQUE(reunion_id, miembro_id)
)`).catch(()=>{});

pool.query(`CREATE TABLE IF NOT EXISTS dpo_comite_acciones (
  id SERIAL PRIMARY KEY,
  reunion_id INT REFERENCES dpo_comite_reuniones(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  responsable VARCHAR(200),
  fecha_compromiso DATE,
  estado VARCHAR(30) DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});

// Miembros
app.get('/api/comite/miembros', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_comite_miembros ORDER BY nombre');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comite/miembros', async (req, res) => {
  try {
    const { nombre, empresa, funcion, puesto, gop_responsable } = req.body;
    const r = await pool.query(
      'INSERT INTO dpo_comite_miembros (nombre, empresa, funcion, puesto, gop_responsable) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [nombre, empresa, funcion, puesto, gop_responsable]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/comite/miembros/:id', async (req, res) => {
  try {
    const { nombre, empresa, funcion, puesto, gop_responsable, activo } = req.body;
    const r = await pool.query(
      'UPDATE dpo_comite_miembros SET nombre=$1, empresa=$2, funcion=$3, puesto=$4, gop_responsable=$5, activo=$6 WHERE id=$7 RETURNING *',
      [nombre, empresa, funcion, puesto, gop_responsable, activo, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/comite/miembros/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_comite_miembros WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Reuniones
app.get('/api/comite/reuniones', async (req, res) => {
  try {
    const { anio } = req.query;
    let q = `SELECT r.*,
      (SELECT COUNT(*) FROM dpo_comite_asistencia a WHERE a.reunion_id=r.id AND a.estado='P') AS presentes,
      (SELECT COUNT(*) FROM dpo_comite_asistencia a WHERE a.reunion_id=r.id) AS total_asistencia,
      (SELECT COUNT(*) FROM dpo_comite_acciones ac WHERE ac.reunion_id=r.id) AS total_acciones
      FROM dpo_comite_reuniones r`;
    const params = [];
    if (anio) { q += ' WHERE r.anio=$1'; params.push(anio); }
    q += ' ORDER BY r.fecha DESC';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/comite/reuniones/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_comite_reuniones WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrada' });
    const asistencia = await pool.query(
      `SELECT a.*, m.nombre, m.empresa, m.funcion, m.gop_responsable
       FROM dpo_comite_asistencia a
       JOIN dpo_comite_miembros m ON m.id=a.miembro_id
       WHERE a.reunion_id=$1 ORDER BY m.nombre`, [req.params.id]
    );
    const acciones = await pool.query(
      'SELECT * FROM dpo_comite_acciones WHERE reunion_id=$1 ORDER BY created_at', [req.params.id]
    );
    res.json({ ...r.rows[0], asistencia: asistencia.rows, acciones: acciones.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comite/reuniones', async (req, res) => {
  try {
    const { fecha, tipo, lugar, tor, notas } = req.body;
    const d = new Date(fecha);
    const anio = d.getFullYear();
    const mes = d.getMonth() + 1;
    const r = await pool.query(
      'INSERT INTO dpo_comite_reuniones (fecha, anio, mes, tipo, lugar, tor, notas) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [fecha, anio, mes, tipo||'mensual', lugar, tor, notas]
    );
    const reunion = r.rows[0];
    // auto-populate asistencia with all active miembros
    const miembros = await pool.query('SELECT id FROM dpo_comite_miembros WHERE activo=true');
    for (const m of miembros.rows) {
      await pool.query(
        'INSERT INTO dpo_comite_asistencia (reunion_id, miembro_id, estado) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [reunion.id, m.id, 'A']
      ).catch(()=>{});
    }
    res.json(reunion);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/comite/reuniones/:id', async (req, res) => {
  try {
    const { fecha, tipo, lugar, tor, notas } = req.body;
    const d = new Date(fecha);
    const r = await pool.query(
      'UPDATE dpo_comite_reuniones SET fecha=$1, anio=$2, mes=$3, tipo=$4, lugar=$5, tor=$6, notas=$7 WHERE id=$8 RETURNING *',
      [fecha, d.getFullYear(), d.getMonth()+1, tipo||'mensual', lugar, tor, notas, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/comite/reuniones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_comite_reuniones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Asistencia
app.put('/api/comite/asistencia/:id', async (req, res) => {
  try {
    const { estado } = req.body;
    await pool.query('UPDATE dpo_comite_asistencia SET estado=$1 WHERE id=$2', [estado, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Acciones
app.post('/api/comite/acciones', async (req, res) => {
  try {
    const { reunion_id, descripcion, responsable, fecha_compromiso, estado } = req.body;
    const r = await pool.query(
      'INSERT INTO dpo_comite_acciones (reunion_id, descripcion, responsable, fecha_compromiso, estado) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [reunion_id, descripcion, responsable, fecha_compromiso||null, estado||'pendiente']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/comite/acciones/:id', async (req, res) => {
  try {
    const { descripcion, responsable, fecha_compromiso, estado } = req.body;
    const r = await pool.query(
      'UPDATE dpo_comite_acciones SET descripcion=$1, responsable=$2, fecha_compromiso=$3, estado=$4 WHERE id=$5 RETURNING *',
      [descripcion, responsable, fecha_compromiso||null, estado, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/comite/acciones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_comite_acciones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Resumen para hub
app.get('/api/comite/resumen', async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    const [reuniones, acciones, prox] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM dpo_comite_reuniones WHERE anio=$1 AND fecha <= CURRENT_DATE', [anioActual]),
      pool.query("SELECT COUNT(*) AS total FROM dpo_comite_acciones WHERE estado='pendiente'"),
      pool.query('SELECT fecha FROM dpo_comite_reuniones WHERE fecha >= CURRENT_DATE ORDER BY fecha LIMIT 1')
    ]);
    res.json({
      reuniones_anio: Number(reuniones.rows[0].total),
      acciones_pendientes: Number(acciones.rows[0].total),
      proxima_reunion: prox.rows[0]?.fecha || null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== GOPs =====================
pool.query(`CREATE TABLE IF NOT EXISTS dpo_comite_gops (
  id SERIAL PRIMARY KEY,
  gop VARCHAR(80) NOT NULL,
  bloque VARCHAR(200) NOT NULL,
  pregunta TEXT NOT NULL,
  orden INT DEFAULT 0
)`).catch(()=>{});

pool.query(`CREATE TABLE IF NOT EXISTS dpo_comite_gop_respuestas (
  id SERIAL PRIMARY KEY,
  gop_pregunta_id INT REFERENCES dpo_comite_gops(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  mes INT NOT NULL,
  valor VARCHAR(10) DEFAULT '',
  UNIQUE(gop_pregunta_id, anio, mes)
)`).catch(()=>{});

const GOP_SEED = [
  { gop:'D&I', bloques:[
    { bloque:'D&I', preguntas:[
      '¿El CD cuenta con un shape / análisis en % de D&I de su nómina actual?',
      '¿Cuenta con Metas / Plan de acción anual para mejorar el D&I en su dotación? (Mujeres en la Lideranza, Mujeres en la operación, Personas con discapacidad)',
      '¿El CD cuenta con convenios con ONG / Consultoras, con el fin de fomentar la inclusión en su operación?',
      'Si tienen personas de licencia, ¿El equipo de liderazgo del CD mantiene Feedback frecuente con las personas que se encuentran de licencia? (Al menos una vez cada 15 días)',
      '¿El CD cuenta con los EPPs adecuados para todas las personas? (talles de ropa, guantes, lentes adaptados)',
    ]},
    { bloque:'Comunicación', preguntas:[
      'Dentro del Calendario de Comunicaciones, ¿se encuentran aquellas fechas relacionadas a D&I?',
      '¿El CD cuenta con un mecanismo confidencial para levantar problemas relacionados a Seguridad Psicológica?',
    ]},
    { bloque:'Estructura', preguntas:[
      '¿El ingreso al CD es accesible para una persona con movilidad reducida?',
      'Las áreas operativas, ¿Cuentan con estructura adecuada para las distintas necesidades del personal? (Baños mixtos / para personas con movilidad reducida, entre otros)',
      '¿El CD cuenta con lactario, Espacios adecuado o políticas de adaptación?',
      'El CD cuenta con un plan de acción para que sus instalaciones sean más inclusivas a largo plazo.',
    ]},
    { bloque:'R&S', preguntas:[
      '¿Las Vacantes abiertas se publican a través de los medios de comunicación del CD? ¿Las publicaciones son inclusivas?',
      '¿Todas las personas que participan en el proceso de reclutamiento y selección realizaron el entrenamiento de Sesgos Inconscientes?',
    ]},
    { bloque:'Aprendizaje & Desarrollo', preguntas:[
      '¿El CD cuenta con agenda de actividades de D&I anual? (8M, Semana D&I, espacios de diálogo con la operación)',
      '¿Los líderes del CD participaron de entrenamientos de D&I?',
      '¿El Equipo Operativo del CD participó de entrenamientos de D&I?',
      '¿Todos los miembros del CD participaron de la capacitación de Seguridad Psicológica?',
    ]},
  ]},
  { gop:'Reconocimiento', bloques:[
    { bloque:'Programa de Reconocimiento', preguntas:[
      '¿Recibieron las áreas capacitación anual sobre las métricas del Programa de reconocimiento local?',
      '¿Existe un programa de reconocimiento que sea accesible para todos los empleados operativos en el almacén?',
      '¿Existe un programa de reconocimiento accesible a todos los colaboradores del transporte operativo?',
      '¿Existe un seguimiento de las personas reconocidas por mes?',
      '¿Existe un programa de reconocimiento que sea accesible para todos los empleados del sector administrativo?',
      '¿El programa de reconocimiento se verifica y es comunicado mensualmente en todos los turnos?',
    ]},
    { bloque:'Premiaciones', preguntas:[
      '¿Tiene la unidad un presupuesto definido de eventos / reconocimientos?',
      '¿La unidad realiza una encuesta anual para escuchar la opinión de los empleados sobre los premios seleccionados?',
    ]},
    { bloque:'Definición de Metas', preguntas:[
      '¿Los criterios definidos para el programa de Reconocimiento están alineados con el sueño del Distribuidor y las 3R?',
      '¿Los empleados operativos conocen los objetivos directamente relacionados con 3R?',
      '¿El Distribuidor garantiza la comunicación mensual de metas de 3R?',
    ]},
    { bloque:'Liderazgo', preguntas:[
      '¿El liderazgo participa en la comunicación de resultados mensualmente?',
      '¿El liderazgo reconoce semanalmente los aspectos más destacados durante las reuniones del equipo?',
    ]},
  ]},
  { gop:'Jornada', bloques:[
    { bloque:'Gestión de la Jornada', preguntas:[
      '¿El área de personas realiza un seguimiento del saldo de horas (positivo y negativo) de todos los empleados una vez por semana y comunica el saldo a los empleados?',
      '¿El equipo recibe capacitación sobre reglas de jornada laboral?',
      'El CD prioriza a los empleados con el mayor número de horas positivas para la compensación de horas.',
      'Planear mensualmente el horario de trabajo del equipo para los fin de semana.',
      'Se aplican medidas disciplinarias cuando no se cumple la jornada.',
      'El CD planifica y comunica mensualmente el cronograma de trabajo del equipo para los fines de semana del 100% de la operación.',
      '¿El CD comunica el plan de compensación con una semana de anticipación?',
      'Los desvíos de Jornada están justificados y evidenciados.',
      'En caso de ausentismo e interjornada ¿el liderazgo toma una decisión de reubicación?',
    ]},
    { bloque:'Gestión de Vacaciones', preguntas:[
      '¿Se realiza la planificación de vacaciones anuales para todo el equipo?',
      'Divulgar el calendario de vacaciones a todo el equipo mensualmente después de la validación en una reunión del comité.',
    ]},
  ]},
  { gop:'Estructura', bloques:[
    { bloque:'Estructura', preguntas:[
      '¿Están todos los acondicionadores de aire activos en la unidad?',
      '¿Funcionan perfectamente los portones de acceso?',
    ]},
    { bloque:'Limpieza', preguntas:[
      '¿El horario de limpieza del área está disponible en un lugar visible para los empleados y se actualiza diariamente?',
      '¿Están las cafeteras en buenas condiciones?',
      '¿Funcionan los baños / vestuarios? ¿Las duchas tienen agua caliente?',
      '¿Todas las personas (incluidos los temporales) tienen casilleros en los baños?',
    ]},
    { bloque:'Higiene y Materiales Desechables', preguntas:[
      '¿El Distribuidor garantiza la limpieza y reposición de materiales en los baños y vestuarios a la entrada y salida de cada turno?',
      '¿El Distribuidor garantiza un stock de material de limpieza en la unidad?',
    ]},
    { bloque:'Herramientas de Trabajo', preguntas:[
      '¿Se mantienen en buenas condiciones los equipos electrónicos (tabletas, teléfonos celulares, computadoras)?',
      '¿Se conservan en buenas condiciones el equipo de trabajo (zorras, montacargas, camiones)?',
      '¿Se conservan en buenas condiciones los muebles de los sectores (mesa, sillas y armarios)?',
    ]},
    { bloque:'Comunicación', preguntas:[
      '¿Se comunican al equipo las acciones correctivas y las mejoras relacionadas a SSGG?',
    ]},
    { bloque:'Uniformes & EPPs', preguntas:[
      '¿La unidad sigue los lineamientos del Procedimiento Operativo Estándar y realiza una sola entrega con la cantidad y artículos establecidos?',
      '¿El CD mantiene la revisión y actualización del Stock de EPPs?',
    ]},
  ]},
  { gop:'Remuneración', bloques:[
    { bloque:'Gestión de Remuneración', preguntas:[
      '¿El Equipo recibe capacitación sobre el Paquete de Compensación TOTAL anualmente?',
      '¿El CD aplica el control de retención a los empleados después de la capacitación del Paquete de compensación?',
      '¿El Recibo de Sueldo es entregado en tiempo y forma al empleado?',
      '¿En caso de haber errores de pago, se corrigen dentro del mes de ocurrencia?',
      '¿Se notifica al empleado con anticipación cuando van a tener descuentos?',
      '¿Están los empleados del sector administrativo y los líderes dentro del porcentaje del 80% de la Tabla Salarial?',
      '¿El Distribuidor realiza una encuesta anual de satisfacción con los beneficios?',
      '¿Tiene la unidad convenios con instituciones con red de descuento para empleados?',
    ]},
    { bloque:'Comunicación', preguntas:[
      '¿El Distribuidor comunica adecuadamente los Nuevos descuentos / Beneficios a todos sus empleados?',
    ]},
  ]},
  { gop:'Turnover', bloques:[
    { bloque:'L&D - Inducción', preguntas:[
      '¿El gerente de área tiene reuniones semanales con un empleado nuevo para verificar el progreso de la inducción dentro de los primeros 30 días?',
      '¿El programa de mentores se realiza en el CD?',
      '¿Los nuevos ingresos evalúan la calidad de su inducción y capacitación al final del período?',
      '¿Existe un programa de inducción y capacitación gradual para toda la operación?',
    ]},
    { bloque:'Recruitment & Selection', preguntas:[
      '¿El jefe del Distribuidor tiene una entrevista de seguimiento con los nuevos empleados 3 meses después de la fecha de contratación?',
      '¿Estamos atrayendo los talentos adecuados? ¿Es efectiva nuestra Estrategia de Atracción de Talento?',
    ]},
    { bloque:'Work Environment & Engagement', preguntas:[
      '¿La adherencia a la Encuesta de Clima supera el 85% de tasa de respuesta?',
      'Plan de acción de la encuesta de engagement en ejecución y con comunicación mensual al equipo.',
    ]},
    { bloque:'Talent & Growth', preguntas:[
      '¿Has revisado las entrevistas de salida? ¿Existe algún patrón/causa raíz?',
    ]},
  ]},
  { gop:'Ausentismo', bloques:[
    { bloque:'Ausentismo', preguntas:[
      '¿El 100% de los empleados vive en la ciudad o cerca del CD? Si no, ¿hay alguna otra alternativa?',
      '¿Hay un control diario de la visibilidad del ausentismo por tipo de ausencias del día anterior para cada empleado?',
      '¿Hay una entrevista de ausentismo al día siguiente realizada por el coordinador/supervisor del área?',
      '¿Se discuten las causas de ausentismo y exceso de horas de trabajo en las reuniones semanales?',
      'Cuando un KPI no alcanza el objetivo, ¿se analiza el ausentismo y existe un plan de acción para mejorar?',
      'El ausentismo por motivos médicos, ¿es analizado y existe un plan de acción junto con el equipo médico?',
      '¿Los empleados comunican las ausencias con al menos 24 horas de anticipación?',
      'En caso de ausencia injustificada, ¿existe un plan de acción para atacar el problema?',
    ]},
  ]},
];

(async function seedGops() {
  try {
    // wait for tables to be ready
    for (let i = 0; i < 10; i++) {
      try { await pool.query('SELECT 1 FROM dpo_comite_gops LIMIT 1'); break; }
      catch(_) { await new Promise(r => setTimeout(r, 500)); }
    }
    const existing = await pool.query('SELECT COUNT(*) AS c FROM dpo_comite_gops');
    if (Number(existing.rows[0].c) > 0) return;
    let orden = 0;
    for (const g of GOP_SEED) {
      for (const b of g.bloques) {
        for (const p of b.preguntas) {
          await pool.query('INSERT INTO dpo_comite_gops (gop, bloque, pregunta, orden) VALUES ($1,$2,$3,$4)',
            [g.gop, b.bloque, p, orden++]);
        }
      }
    }
    console.log('GOP seed: ' + orden + ' preguntas insertadas');
  } catch(e) { console.error('GOP seed error:', e.message); }
})();

app.get('/api/comite/gops/preguntas', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_comite_gops ORDER BY orden');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/comite/gops/respuestas', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query(
      'SELECT gop_pregunta_id, mes, valor FROM dpo_comite_gop_respuestas WHERE anio=$1',
      [anio || new Date().getFullYear()]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/comite/gops/respuestas', async (req, res) => {
  try {
    const { gop_pregunta_id, anio, mes, valor } = req.body;
    await pool.query(
      `INSERT INTO dpo_comite_gop_respuestas (gop_pregunta_id, anio, mes, valor)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (gop_pregunta_id, anio, mes) DO UPDATE SET valor = $4`,
      [gop_pregunta_id, anio, mes, valor]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/comite-gente/gops', (req, res) => res.sendFile(path.join(__dirname, 'public', 'comite-gente-gops.html')));

// ===================== PDA (Plan de Acción) =====================
pool.query(`CREATE TABLE IF NOT EXISTS dpo_comite_pda (
  id SERIAL PRIMARY KEY,
  accion TEXT NOT NULL,
  gop VARCHAR(80),
  bloque VARCHAR(200),
  responsable VARCHAR(200),
  fecha_compromiso DATE,
  estado VARCHAR(30) DEFAULT 'pendiente',
  prioridad VARCHAR(20) DEFAULT 'media',
  evidencia TEXT,
  anio INT,
  mes_origen INT,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});

app.get('/api/comite/pda', async (req, res) => {
  try {
    const { anio } = req.query;
    let q = 'SELECT * FROM dpo_comite_pda';
    const params = [];
    if (anio) { q += ' WHERE anio=$1'; params.push(anio); }
    q += ' ORDER BY created_at DESC';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comite/pda', async (req, res) => {
  try {
    const { accion, gop, bloque, responsable, fecha_compromiso, estado, prioridad, evidencia, anio, mes_origen } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_comite_pda (accion, gop, bloque, responsable, fecha_compromiso, estado, prioridad, evidencia, anio, mes_origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [accion, gop||null, bloque||null, responsable||null, fecha_compromiso||null, estado||'pendiente', prioridad||'media', evidencia||null, anio||new Date().getFullYear(), mes_origen||null]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/comite/pda/:id', async (req, res) => {
  try {
    const { accion, gop, bloque, responsable, fecha_compromiso, estado, prioridad, evidencia } = req.body;
    const r = await pool.query(
      `UPDATE dpo_comite_pda SET accion=$1, gop=$2, bloque=$3, responsable=$4, fecha_compromiso=$5, estado=$6, prioridad=$7, evidencia=$8 WHERE id=$9 RETURNING *`,
      [accion, gop||null, bloque||null, responsable||null, fecha_compromiso||null, estado, prioridad, evidencia||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/comite/pda/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_comite_pda WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/comite/pda/resumen', async (req, res) => {
  try {
    const anio = req.query.anio || new Date().getFullYear();
    const r = await pool.query(
      `SELECT estado, COUNT(*) AS total FROM dpo_comite_pda WHERE anio=$1 GROUP BY estado`, [anio]
    );
    const map = {};
    r.rows.forEach(row => { map[row.estado] = Number(row.total); });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    const completadas = map['completada'] || 0;
    res.json({ total, completadas, pct: total ? Math.round(completadas / total * 100) : 0, por_estado: map });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/comite-gente/pda', (req, res) => res.sendFile(path.join(__dirname, 'public', 'comite-gente-pda.html')));

// ===================== STORAGE GUARD =====================
const STORAGE_LIMIT_MB = 400;
const TABLAS_ARCHIVOS = [
  'dpo_ciclogente_archivos','dpo_desempeno_archivos','dpo_distrib_archivos',
  'dpo_opr_archivos','dpo_turnover_archivos','dpo_ns_documentos'
];

async function getStorageMB() {
  try {
    const queries = TABLAS_ARCHIVOS.map(t =>
      `SELECT pg_total_relation_size('${t}') AS s`
    );
    let total = 0;
    for (const q of queries) {
      try { const r = await pool.query(q); total += Number(r.rows[0].s) || 0; } catch(_){}
    }
    return Math.round(total / 1024 / 1024 * 10) / 10;
  } catch(_) { return 0; }
}

async function checkStorageLimit(res) {
  const used = await getStorageMB();
  if (used >= STORAGE_LIMIT_MB) {
    res.status(507).json({ error: `Almacenamiento lleno: ${used}MB de ${STORAGE_LIMIT_MB}MB usados. Eliminá archivos antes de subir nuevos.` });
    return false;
  }
  return true;
}

app.get('/api/storage', async (req, res) => {
  try {
    const used = await getStorageMB();
    res.json({ used_mb: used, limit_mb: STORAGE_LIMIT_MB, pct: Math.round(used / STORAGE_LIMIT_MB * 100) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CICLO DE GENTE - ARCHIVOS ──
pool.query(`CREATE TABLE IF NOT EXISTS dpo_ciclogente_archivos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(300),
  tipo VARCHAR(100),
  contenido BYTEA,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});
pool.query(`ALTER TABLE dpo_ciclogente_archivos ADD COLUMN IF NOT EXISTS contenido BYTEA`).catch(()=>{});

app.get('/api/ciclogente/archivos', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nombre, tipo, created_at FROM dpo_ciclogente_archivos ORDER BY created_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ciclogente/archivos/:id/file', async (req, res) => {
  try {
    const r = await pool.query('SELECT nombre, tipo, contenido FROM dpo_ciclogente_archivos WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].contenido) return res.status(404).json({ error: 'Archivo no encontrado' });
    const { nombre, tipo, contenido } = r.rows[0];
    res.setHeader('Content-Type', tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename=”${nombre}”`);
    res.send(contenido);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ciclogente/archivos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    if (!await checkStorageLimit(res)) return;
    const r = await pool.query(
      'INSERT INTO dpo_ciclogente_archivos (nombre, tipo, contenido) VALUES ($1,$2,$3) RETURNING id',
      [req.file.originalname, req.file.mimetype, req.file.buffer]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ciclogente/archivos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_ciclogente_archivos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CICLO DE GENTE - PDF (legacy) ──
app.post('/api/ciclogente/pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const b64 = req.file.buffer.toString('base64');
    await pool.query(
      `INSERT INTO dpo_ciclogente_pdf (id, nombre, tipo, contenido, updated_at) VALUES (1,$1,$2,$3,NOW())
       ON CONFLICT (id) DO UPDATE SET nombre=$1, tipo=$2, contenido=$3, updated_at=NOW()`,
      [req.file.originalname, req.file.mimetype, b64]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ciclogente/pdf', async (req, res) => {
  try {
    const r = await pool.query('SELECT nombre, tipo, contenido FROM dpo_ciclogente_pdf WHERE id=1');
    if (!r.rows.length) return res.status(404).end();
    const { nombre, tipo, contenido } = r.rows[0];
    res.setHeader('Content-Type', tipo || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.send(Buffer.from(contenido, 'base64'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.head('/api/ciclogente/pdf', async (req, res) => {
  try {
    const r = await pool.query('SELECT id FROM dpo_ciclogente_pdf WHERE id=1');
    res.status(r.rows.length ? 200 : 404).end();
  } catch(e) { res.status(500).end(); }
});

// ── TENDENCIAS DE LA FUERZA LABORAL ──
app.post('/api/tendencias/upload', upload.single('file'), async (req, res) => {
  const { mes, anio } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets['DOTACIÓN'];
    if (!ws) return res.status(400).json({ error: 'No se encontró la hoja DOTACIÓN en el archivo' });

    const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // rawRows[0] = note row, rawRows[1] = headers, rawRows[2+] = data
    const HEADERS = (rawRows[1] || []).map(h => String(h).trim());
    const col = (name) => HEADERS.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    const iDNI     = col('DNI');
    const iNombre  = col('NOMBRE');
    const iApell   = col('APELLIDO');
    const iSector  = col('SECTOR');
    const iPosic   = col('POSICIÓN') >= 0 ? col('POSICIÓN') : col('POSICION');
    const iContrat = col('TIPO DE CONTRATO');
    const iSede    = col('SEDES');
    const iIngreso = col('FECHA DE INGRESO AL DISTRIBUIDOR');
    const iFSalida = col('FECHA DE SALIDA');
    const iTSalida = col('TIPO DE SALIDA');

    const toDate = (v) => {
      if (!v || v === '') return null;
      if (v instanceof Date) return v.toISOString().split('T')[0];
      if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return v;
      return null;
    };

    const processedRows = [];
    for (let i = 2; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || !row[iDNI]) continue;
      const tipoContrato = String(row[iContrat] || '').trim().toUpperCase();
      if (tipoContrato === 'VACANTE') continue;
      processedRows.push({
        dni:          row[iDNI],
        nombre:       String(row[iNombre] || '').trim(),
        apellido:     String(row[iApell]  || '').trim(),
        sector:       String(row[iSector] || '').trim(),
        posicion:     String(row[iPosic]  || '').trim(),
        tipo_contrato: tipoContrato,
        sede:         String(row[iSede]   || '').trim().toUpperCase(),
        fecha_ingreso: toDate(row[iIngreso]),
        fecha_salida:  toDate(row[iFSalida]),
        tipo_salida:   row[iTSalida] ? String(row[iTSalida]).trim() : null,
      });
    }

    await pool.query(
      `INSERT INTO dpo_tendencias_snapshot (mes, anio, rows)
       VALUES ($1,$2,$3)
       ON CONFLICT (mes, anio) DO UPDATE SET rows=$3, created_at=NOW()`,
      [parseInt(mes), parseInt(anio), JSON.stringify(processedRows)]
    );

    res.json({ ok: true, count: processedRows.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tendencias/periods', async (req, res) => {
  try {
    const r = await pool.query('SELECT mes, anio, created_at FROM dpo_tendencias_snapshot ORDER BY anio, mes');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tendencias/:anio', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT mes, anio, rows, created_at FROM dpo_tendencias_snapshot WHERE anio=$1 ORDER BY mes',
      [req.params.anio]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tendencias/:anio/:mes', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM dpo_tendencias_snapshot WHERE anio=$1 AND mes=$2',
      [req.params.anio, req.params.mes]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MOVIMIENTOS ──
app.get('/api/movimientos', async (req, res) => {
  try {
    const { anio, mes } = req.query;
    let q = 'SELECT * FROM dpo_movimientos WHERE 1=1';
    const params = [];
    if (anio) { params.push(anio); q += ` AND anio=$${params.length}`; }
    if (mes)  { params.push(mes);  q += ` AND mes=$${params.length}`; }
    q += ' ORDER BY fecha DESC NULLS LAST, id DESC';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/movimientos', async (req, res) => {
  const { fecha, mes, anio, apellido_nombre, posicion_anterior, posicion_nueva } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO dpo_movimientos (fecha,mes,anio,apellido_nombre,posicion_anterior,posicion_nueva)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [fecha||null, mes||null, anio||null, apellido_nombre||'', posicion_anterior||'', posicion_nueva||'']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/movimientos/:id', async (req, res) => {
  const { fecha, mes, anio, apellido_nombre, posicion_anterior, posicion_nueva } = req.body;
  try {
    const r = await pool.query(
      `UPDATE dpo_movimientos SET fecha=$1,mes=$2,anio=$3,apellido_nombre=$4,posicion_anterior=$5,posicion_nueva=$6 WHERE id=$7 RETURNING *`,
      [fecha||null, mes||null, anio||null, apellido_nombre||'', posicion_anterior||'', posicion_nueva||'', req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/movimientos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_movimientos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── VACANTES ──
app.get('/api/vacantes', async (req, res) => {
  try {
    const { anio, sede, status } = req.query;
    let q = `SELECT v.*,
      (SELECT COUNT(*) FROM dpo_vacantes_candidatos c WHERE c.vacante_id=v.id) AS n_candidatos,
      (SELECT COUNT(*) FROM dpo_vacantes_candidatos c WHERE c.vacante_id=v.id AND c.accion='Avanza / Contratado') AS n_contratados
      FROM dpo_vacantes v WHERE 1=1`;
    const params = [];
    if (anio)   { params.push(anio);   q += ` AND v.anio=$${params.length}`; }
    if (sede)   { params.push(sede);   q += ` AND v.sede=$${params.length}`; }
    if (status) { params.push(status); q += ` AND v.status=$${params.length}`; }
    q += ' ORDER BY v.apertura DESC NULLS LAST, v.id DESC';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vacantes', async (req, res) => {
  const { sede,mes,anio,posicion,sector,tipo_contratacion,apertura,fecha_inicio,fecha_finalizacion,status,nuevo_ingreso } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO dpo_vacantes (sede,mes,anio,posicion,sector,tipo_contratacion,apertura,fecha_inicio,fecha_finalizacion,status,nuevo_ingreso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [sede||'Dolores',mes||'',anio||null,posicion||'',sector||'',tipo_contratacion||'',apertura||null,fecha_inicio||null,fecha_finalizacion||null,status||'En curso',nuevo_ingreso||false]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/vacantes/:id', async (req, res) => {
  const { sede,mes,anio,posicion,sector,tipo_contratacion,apertura,fecha_inicio,fecha_finalizacion,status,nuevo_ingreso } = req.body;
  try {
    const r = await pool.query(
      `UPDATE dpo_vacantes SET sede=$1,mes=$2,anio=$3,posicion=$4,sector=$5,tipo_contratacion=$6,apertura=$7,fecha_inicio=$8,fecha_finalizacion=$9,status=$10,nuevo_ingreso=$11 WHERE id=$12 RETURNING *`,
      [sede||'Dolores',mes||'',anio||null,posicion||'',sector||'',tipo_contratacion||'',apertura||null,fecha_inicio||null,fecha_finalizacion||null,status||'En curso',nuevo_ingreso||false,req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/vacantes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_vacantes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/vacantes/:id/candidatos', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_vacantes_candidatos WHERE vacante_id=$1 ORDER BY id', [req.params.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vacantes/:id/candidatos', async (req, res) => {
  const { nombre,apellido,celular,mail,fuente,fecha_entrevista_lider,fecha_entrevista_rrhh,fecha_entrevista_dueno,comentarios,accion,feedback,pool_posicion,fecha_cierre,fecha_ingreso } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO dpo_vacantes_candidatos (vacante_id,nombre,apellido,celular,mail,fuente,fecha_entrevista_lider,fecha_entrevista_rrhh,fecha_entrevista_dueno,comentarios,accion,feedback,pool_posicion,fecha_cierre,fecha_ingreso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.params.id,nombre||'',apellido||'',celular||'',mail||'',fuente||'',fecha_entrevista_lider||null,fecha_entrevista_rrhh||null,fecha_entrevista_dueno||null,comentarios||'',accion||'',feedback||'',pool_posicion||'',fecha_cierre||null,fecha_ingreso||null]
    );
    if (accion === 'Contratado') {
      await pool.query(`UPDATE dpo_vacantes SET status='Ok' WHERE id=$1`, [req.params.id]);
    }
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/vacantes/:id/candidatos/:cid', async (req, res) => {
  const { nombre,apellido,celular,mail,fuente,fecha_entrevista_lider,fecha_entrevista_rrhh,fecha_entrevista_dueno,comentarios,accion,feedback,pool_posicion,fecha_cierre,fecha_ingreso } = req.body;
  try {
    const r = await pool.query(
      `UPDATE dpo_vacantes_candidatos SET nombre=$1,apellido=$2,celular=$3,mail=$4,fuente=$5,fecha_entrevista_lider=$6,fecha_entrevista_rrhh=$7,fecha_entrevista_dueno=$8,comentarios=$9,accion=$10,feedback=$11,pool_posicion=$12,fecha_cierre=$13,fecha_ingreso=$14 WHERE id=$15 AND vacante_id=$16 RETURNING *`,
      [nombre||'',apellido||'',celular||'',mail||'',fuente||'',fecha_entrevista_lider||null,fecha_entrevista_rrhh||null,fecha_entrevista_dueno||null,comentarios||'',accion||'',feedback||'',pool_posicion||'',fecha_cierre||null,fecha_ingreso||null,req.params.cid,req.params.id]
    );
    if (accion === 'Contratado') {
      await pool.query(`UPDATE dpo_vacantes SET status='Ok' WHERE id=$1`, [req.params.id]);
    }
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/vacantes/:id/candidatos/:cid', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_vacantes_candidatos WHERE id=$1 AND vacante_id=$2', [req.params.cid, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/vacantes/:id/export', async (req, res) => {
  try {
    const id = req.params.id;
    const [vacRow, candsRow, pregsRow] = await Promise.all([
      pool.query('SELECT * FROM dpo_vacantes WHERE id=$1', [id]),
      pool.query('SELECT * FROM dpo_vacantes_candidatos WHERE vacante_id=$1 ORDER BY id', [id]),
      pool.query('SELECT * FROM dpo_vacantes_preguntas WHERE vacante_id=$1 ORDER BY orden, id', [id]),
    ]);
    const vac = vacRow.rows[0];
    const cands = candsRow.rows;
    const pregs = pregsRow.rows;

    // Cargar todas las respuestas de todos los candidatos
    const respsAll = await Promise.all(cands.map(c =>
      pool.query('SELECT * FROM dpo_vacantes_respuestas WHERE candidato_id=$1', [c.id])
        .then(r => r.rows)
    ));

    const fmtDate = v => v ? new Date(v).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';

    const headers = [
      'Apellido y Nombre','Fuente','Celular','Mail',
      'Ent. Líder','Ent. RRHH','Ent. Dueño',
      'Fecha Ingreso','Feedback','Acción',
      ...pregs.map(p => p.pregunta)
    ];

    const rows = cands.map((c, i) => {
      const respMap = {};
      respsAll[i].forEach(r => { respMap[r.pregunta_id] = r.respuesta; });
      return [
        `${c.apellido||''}, ${c.nombre||''}`.trim().replace(/^,\s*/,''),
        c.fuente||'',
        c.celular||'',
        c.mail||'',
        fmtDate(c.fecha_entrevista_lider),
        fmtDate(c.fecha_entrevista_rrhh),
        fmtDate(c.fecha_entrevista_dueno),
        fmtDate(c.fecha_ingreso),
        c.feedback||'',
        c.accion||'',
        ...pregs.map(p => respMap[p.id]||''),
      ];
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([headers, ...rows]);

    // Ancho de columnas
    ws['!cols'] = [
      {wch:28},{wch:14},{wch:14},{wch:28},
      {wch:13},{wch:13},{wch:13},
      {wch:13},{wch:14},{wch:20},
      ...pregs.map(() => ({wch:40}))
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Candidatos');
    const buf = xlsx.write(wb, { type:'buffer', bookType:'xlsx' });
    const nombre = (vac ? `${vac.posicion} - Candidatos` : 'Candidatos').replace(/[^\w\s\-]/g, '').trim();
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/vacantes/:id/preguntas', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_vacantes_preguntas WHERE vacante_id=$1 ORDER BY orden, id', [req.params.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vacantes/:id/preguntas', async (req, res) => {
  const { pregunta, orden } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO dpo_vacantes_preguntas (vacante_id, pregunta, orden) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, pregunta, orden || 0]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/vacantes/:id/preguntas/:pid', async (req, res) => {
  const { pregunta } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dpo_vacantes_preguntas SET pregunta=$1 WHERE id=$2 AND vacante_id=$3 RETURNING *',
      [pregunta, req.params.pid, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/vacantes/:id/preguntas/:pid', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_vacantes_preguntas WHERE id=$1 AND vacante_id=$2', [req.params.pid, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/vacantes/:id/candidatos/:cid/respuestas', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_vacantes_respuestas WHERE candidato_id=$1', [req.params.cid]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vacantes/:id/candidatos/:cid/respuestas', async (req, res) => {
  const { respuestas } = req.body; // [{pregunta_id, respuesta}]
  try {
    for (const { pregunta_id, respuesta } of respuestas) {
      await pool.query(
        `INSERT INTO dpo_vacantes_respuestas (candidato_id, pregunta_id, respuesta)
         VALUES ($1,$2,$3)
         ON CONFLICT (candidato_id, pregunta_id) DO UPDATE SET respuesta=$3`,
        [req.params.cid, pregunta_id, respuesta || '']
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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

// ── AUSENTISMO ──

const AUS_COMPUTABLES = [
  'Lic. Enfermedad (menor a 20 dias)','Rechazo de ART','In Itineres',
  'Lic. Pedida con menos de 48hs','Dias de duelo','Faltas no programadas'
];

function ausExcelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

function ausGetDatesInRange(fromISO, toISO) {
  const dates = [];
  const cur = new Date(fromISO + 'T00:00:00Z');
  const end = new Date(toISO + 'T00:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function ausParseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += ch;
  }
  result.push(current);
  return result;
}

function ausTimeToMinutes(t) {
  if (!t) return 0;
  const parts = t.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

function ausWorkingDaysInMonth(anio, mes, diasNoLabSet) {
  const days = [];
  const cur = new Date(Date.UTC(+anio, +mes - 1, 1));
  const end = new Date(Date.UTC(+anio, +mes, 0));
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    if (cur.getUTCDay() !== 0 && !diasNoLabSet.has(iso)) days.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// Cargar empleados (una vez)
app.post('/api/ausentismo/empleados', upload.single('file'), async (req, res) => {
  try {
    const wb = xlsx.read(req.file.buffer);
    const ws = wb.Sheets['Empleados'];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
    // Find header row (first row where col 0 looks like 'legajo' or 'Legajo')
    let hIdx = rows.findIndex(r => r && String(r[0]||'').toLowerCase().replace(/\s+\*/g,'').trim() === 'legajo');
    if (hIdx < 0) return res.status(400).json({ error: 'No se encontró encabezado legajo' });
    const headers = rows[hIdx].map(h => String(h||'').toLowerCase().replace(/[\s*]+/g,'').trim());
    const dataRows = rows.slice(hIdx + 2); // skip header + display-label row
    const iLeg = headers.indexOf('legajo'), iDni = headers.indexOf('dni');
    const iApe = headers.indexOf('apellido'), iNom = headers.indexOf('nombre');
    const iSec = headers.findIndex(h => h.includes('sector')), iEst = headers.indexOf('estado');
    const iSuc = headers.findIndex(h => h.includes('sucursal'));
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM dpo_aus_empleados');
      let cnt = 0;
      for (const row of dataRows) {
        const leg = String(row[iLeg]||'').trim();
        const dni = String(row[iDni]||'').trim();
        if (!leg || !dni) continue;
        const sucVal = String(row[iSuc >= 0 ? iSuc : -1]||'').trim();
        await client.query(
          `INSERT INTO dpo_aus_empleados (legajo,dni,apellido,nombre,sector_nombre,sucursal_nombre,estado)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (legajo) DO UPDATE
           SET dni=$2,apellido=$3,nombre=$4,sector_nombre=$5,
               sucursal_nombre=CASE WHEN $6='' THEN dpo_aus_empleados.sucursal_nombre ELSE $6 END,
               estado=$7`,
          [leg, dni, String(row[iApe]||'').trim(), String(row[iNom]||'').trim(),
           String(row[iSec]||'').trim(), sucVal, String(row[iEst]||'activo').trim()]
        );
        cnt++;
      }
      res.json({ ok: true, empleados: cnt });
    } finally { client.release(); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Chequear si hay empleados cargados
app.put('/api/ausentismo/empleados/:legajo/sucursal', async (req, res) => {
  try {
    const { sucursal } = req.body;
    await pool.query('UPDATE dpo_aus_empleados SET sucursal_nombre=$1 WHERE legajo=$2', [sucursal, req.params.legajo]);
    // Actualizar también los registros históricos de ausencias y jornadas
    await pool.query(
      `UPDATE dpo_aus_ausencias SET sucursal_nombre=$1
       WHERE dni=(SELECT dni FROM dpo_aus_empleados WHERE legajo=$2)`,
      [sucursal, req.params.legajo]
    );
    await pool.query(
      `UPDATE dpo_aus_jornadas SET sucursal_nombre=$1
       WHERE dni=(SELECT dni FROM dpo_aus_empleados WHERE legajo=$2)`,
      [sucursal, req.params.legajo]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ausentismo/empleados/count', async (req, res) => {
  try {
    const r = await pool.query("SELECT COUNT(*) FROM dpo_aus_empleados WHERE estado='activo'");
    res.json({ count: parseInt(r.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Upload 3 archivos Ficha y procesar
app.post('/api/ausentismo/upload', upload.fields([
  { name: 'marcas', maxCount: 1 },
  { name: 'justif', maxCount: 1 },
  { name: 'vac', maxCount: 1 }
]), async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const empCheck = await client.query("SELECT COUNT(*) FROM dpo_aus_empleados WHERE estado='activo'");
      if (parseInt(empCheck.rows[0].count) === 0)
        return res.status(400).json({ error: 'Primero cargá el archivo de empleados.' });
      const empleados = (await client.query("SELECT * FROM dpo_aus_empleados WHERE estado='activo' AND UPPER(sector_nombre) IN ('OPERACIONES','ALMACEN') AND legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)")).rows;
      const empByLegajo = {}, empByDni = {};
      empleados.forEach(e => { empByLegajo[e.legajo] = e; empByDni[e.dni] = e; });

      // Parsear marcas CSV
      const csv = req.files['marcas'][0].buffer.toString('utf8').replace(/^ï»¿/, '');
      const csvLines = csv.split('\n').filter(Boolean);
      const hdr = ausParseCSVRow(csvLines[0]);
      const [iDni,iEmp,iFec,iHor,iAcc] = ['dni','empleado','fecha','hora','accion'].map(c => hdr.indexOf(c));
      const marcasMap = {};
      let minFecha = null, maxFecha = null;
      for (let i = 1; i < csvLines.length; i++) {
        const c = ausParseCSVRow(csvLines[i]);
        const dni = (c[iDni]||'').trim(), fecha = (c[iFec]||'').trim();
        if (!dni || !fecha) continue;
        const key = `${dni}|${fecha}`;
        if (!marcasMap[key]) marcasMap[key] = { dni, fecha, empleado: (c[iEmp]||'').trim(), marks: [] };
        marcasMap[key].marks.push({ hora: (c[iHor]||'').trim(), accion: (c[iAcc]||'').trim() });
        if (!minFecha || fecha < minFecha) minFecha = fecha;
        if (!maxFecha || fecha > maxFecha) maxFecha = fecha;
      }
      if (!minFecha) return res.status(400).json({ error: 'El CSV de marcas está vacío.' });

      // Solo procesar el mes más reciente presente en el CSV
      const mesFiltro = maxFecha.slice(0, 7); // 'YYYY-MM'
      for (const k of Object.keys(marcasMap)) {
        if (!marcasMap[k].fecha.startsWith(mesFiltro)) delete marcasMap[k];
      }
      minFecha = mesFiltro + '-01';
      maxFecha = new Date(Date.UTC(+mesFiltro.slice(0,4), +mesFiltro.slice(5,7), 0)).toISOString().slice(0, 10);

      // Parsear justificaciones XLSX
      const justifWb = xlsx.read(req.files['justif'][0].buffer);
      const justifRows = xlsx.utils.sheet_to_json(justifWb.Sheets[justifWb.SheetNames[0]], { header: 1 });
      const jiHdr = justifRows.findIndex(r => r && r[0] === 'ID');
      const jH = jiHdr >= 0 ? justifRows[jiHdr].map(String) : [];
      const [jEmpId,jDesde,jHasta,jMot,jEst] = ['Empleado ID','Fecha Desde','Fecha Hasta','Motivo','Estado'].map(c => jH.indexOf(c));
      const justifMap = {};
      for (let i = jiHdr + 1; i < justifRows.length; i++) {
        const r = justifRows[i];
        if (!r || String(r[jEst]||'').trim() !== 'aprobada') continue;
        const legajo = String(r[jEmpId]||'').trim();
        const emp = empByLegajo[legajo];
        if (!emp) continue;
        const desde = ausExcelDateToISO(r[jDesde]), hasta = ausExcelDateToISO(r[jHasta]);
        if (!desde || !hasta) continue;
        const motivo = String(r[jMot]||'').trim();
        for (const d of ausGetDatesInRange(desde, hasta)) justifMap[`${emp.dni}|${d}`] = motivo;
      }

      // Parsear vacaciones XLSX
      const vacWb = xlsx.read(req.files['vac'][0].buffer);
      const vacRows = xlsx.utils.sheet_to_json(vacWb.Sheets[vacWb.SheetNames[0]], { header: 1 });
      const viHdr = vacRows.findIndex(r => r && r[0] === 'ID');
      const vH = viHdr >= 0 ? vacRows[viHdr].map(String) : [];
      const [vDni,vDesde,vHasta,vEst] = ['DNI','Fecha Desde','Fecha Hasta','Estado'].map(c => vH.indexOf(c));
      const vacMap = {};
      for (let i = viHdr + 1; i < vacRows.length; i++) {
        const r = vacRows[i];
        if (!r || String(r[vEst]||'').trim() !== 'aprobado') continue;
        const dni = String(r[vDni]||'').trim();
        const desde = ausExcelDateToISO(r[vDesde]), hasta = ausExcelDateToISO(r[vHasta]);
        if (!dni || !desde || !hasta) continue;
        for (const d of ausGetDatesInRange(desde, hasta)) vacMap[`${dni}|${d}`] = true;
      }

      // Días no laborables ya marcados
      const nolRes = await client.query('SELECT fecha FROM dpo_aus_dias_no_lab');
      const diasNoLab = new Set(nolRes.rows.map(r => r.fecha.toISOString().slice(0, 10)));

      // Guardar jornadas (reemplazar rango)
      await client.query('DELETE FROM dpo_aus_jornadas WHERE fecha BETWEEN $1 AND $2', [minFecha, maxFecha]);
      for (const entry of Object.values(marcasMap)) {
        const { dni, fecha, empleado, marks } = entry;
        const emp = empByDni[dni];
        const sector = emp ? emp.sector_nombre : '';
        marks.sort((a, b) => ausTimeToMinutes(a.hora) - ausTimeToMinutes(b.hora));
        let totalMin = 0, completo = true, i = 0;
        while (i < marks.length) {
          if (marks[i].accion === 'ingreso' && i + 1 < marks.length && marks[i+1].accion === 'egreso') {
            totalMin += ausTimeToMinutes(marks[i+1].hora) - ausTimeToMinutes(marks[i].hora);
            i += 2;
          } else { completo = false; i++; }
        }
        const primerIngreso = marks.find(m => m.accion === 'ingreso');
        const ultimoEgreso = [...marks].reverse().find(m => m.accion === 'egreso');
        await client.query(
          `INSERT INTO dpo_aus_jornadas (dni,empleado_nombre,sector_nombre,sucursal_nombre,fecha,horas_trabajadas,datos_completos,hora_ingreso,hora_egreso)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (dni,fecha) DO UPDATE
           SET horas_trabajadas=$6, datos_completos=$7, hora_ingreso=$8, hora_egreso=$9`,
          [dni, empleado, sector, emp ? emp.sucursal_nombre : '', fecha, +(totalMin/60).toFixed(2), completo,
           primerIngreso ? primerIngreso.hora : null, ultimoEgreso ? ultimoEgreso.hora : null]
        );
      }

      // Borrar TODAS las ausencias del rango (para recalcular desde cero con los nuevos datos)
      const hoy = new Date().toISOString().slice(0, 10);
      await client.query('DELETE FROM dpo_aus_ausencias WHERE fecha BETWEEN $1 AND $2', [minFecha, maxFecha]);
      // Borrar también futuros de cualquier mes anterior mal cargado
      await client.query('DELETE FROM dpo_aus_ausencias WHERE fecha >= $1', [hoy]);

      // Calcular ausencias por empleado x día laborable (solo hasta ayer, no días futuros)
      const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const maxFechaAus = maxFecha < ayer ? maxFecha : ayer;
      const diasRango = ausGetDatesInRange(minFecha, maxFechaAus)
        .filter(d => new Date(d+'T00:00:00Z').getUTCDay() !== 0 && !diasNoLab.has(d));
      const presentes = new Set(Object.keys(marcasMap));
      for (const emp of empleados) {
        for (const fecha of diasRango) {
          const key = `${emp.dni}|${fecha}`;
          if (presentes.has(key)) continue;
          let categoria = 'Faltas no programadas', fuente = 'sin_registro', motivo_original = null;
          if (vacMap[key]) { categoria = 'Vacaciones'; fuente = 'vacaciones'; }
          else if (justifMap[key] !== undefined) { fuente = 'justificacion'; motivo_original = justifMap[key]; }
          await client.query(
            `INSERT INTO dpo_aus_ausencias (dni,empleado_nombre,sector_nombre,sucursal_nombre,fecha,categoria,motivo_original,fuente)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (dni,fecha) DO UPDATE
             SET categoria=EXCLUDED.categoria, motivo_original=EXCLUDED.motivo_original, fuente=EXCLUDED.fuente`,
            [emp.dni, `${emp.apellido} ${emp.nombre}`, emp.sector_nombre, emp.sucursal_nombre, fecha, categoria, motivo_original, fuente]
          );
        }
      }

      // Re-aplicar días no laborables: justificar ausencias donde corresponda
      const nolRango = await client.query(
        'SELECT fecha::text, sucursal_nombre FROM dpo_aus_dias_no_lab WHERE fecha BETWEEN $1 AND $2',
        [minFecha, maxFechaAus]
      );
      for (const nl of nolRango.rows) {
        const sucCond = nl.sucursal_nombre === 'TODAS' ? '' : ` AND UPPER(sucursal_nombre)=UPPER('${nl.sucursal_nombre.replace(/'/g,"''")}')`;
        await client.query(
          `UPDATE dpo_aus_ausencias SET categoria='Ausencia justificada', fuente='dia_no_laborable'
           WHERE fecha=$1 AND categoria NOT IN ('Vacaciones')` + sucCond,
          [nl.fecha]
        );
      }

      res.json({ ok: true, periodo: `${minFecha} → ${maxFecha}`, jornadas: Object.keys(marcasMap).length });
    } finally { client.release(); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Sincronización con FichaYa
async function fichaYaToken() {
  const base = process.env.FICHAYA_BASE_URL || 'https://control-asistencia.up.railway.app';
  const r = await fetch(`${base}/api/v1/external/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.FICHAYA_USERNAME, password: process.env.FICHAYA_PASSWORD })
  });
  if (!r.ok) throw new Error(`FichaYa auth error ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

function fichaYaParseFecha(str) {
  // DD/M/YYYY o D/M/YYYY → YYYY-MM-DD
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${String(+m).padStart(2,'0')}-${String(+d).padStart(2,'0')}`;
}

app.get('/api/ausentismo/test-ficha', async (req, res) => {
  try {
    if (!process.env.FICHAYA_USERNAME || !process.env.FICHAYA_PASSWORD)
      return res.status(503).json({ error: 'Credenciales FichaYa no configuradas.' });
    const base = process.env.FICHAYA_BASE_URL || 'https://control-asistencia.up.railway.app';
    const token = await fichaYaToken();
    const [justRes, vacRes] = await Promise.all([
      fetch(`${base}/api/v1/external/justificaciones`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${base}/api/v1/external/vacaciones/movimientos`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    res.json({
      justificaciones: justRes.ok ? await justRes.json() : { error: justRes.status, body: await justRes.text() },
      vacaciones: vacRes.ok ? await vacRes.json() : { error: vacRes.status, body: await vacRes.text() }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ausentismo/sync-ficha', async (req, res) => {
  try {
    const { anio, mes } = req.body;
    if (!anio || !mes) return res.status(400).json({ error: 'Indicá anio y mes.' });
    if (!process.env.FICHAYA_USERNAME || !process.env.FICHAYA_PASSWORD)
      return res.status(503).json({ error: 'Credenciales FichaYa no configuradas en el servidor.' });

    const fechaDesde = `${anio}-${String(+mes).padStart(2,'0')}-01`;
    const fechaHasta = new Date(Date.UTC(+anio, +mes, 0)).toISOString().slice(0, 10);
    const base = process.env.FICHAYA_BASE_URL || 'https://control-asistencia.up.railway.app';

    // Obtener token y descargar CSV
    const token = await fichaYaToken();
    const csvUrl = `${base}/api/v1/external/reportes/asistencia.csv?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}&limit=20000`;
    const csvRes = await fetch(csvUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!csvRes.ok) throw new Error(`FichaYa CSV error ${csvRes.status}: ${await csvRes.text()}`);
    const csvText = await csvRes.text();

    const client = await pool.connect();
    try {
      const empCheck = await client.query("SELECT COUNT(*) FROM dpo_aus_empleados WHERE estado='activo'");
      if (parseInt(empCheck.rows[0].count) === 0)
        return res.status(400).json({ error: 'Primero cargá el archivo de empleados.' });

      const empleados = (await client.query(
        "SELECT * FROM dpo_aus_empleados WHERE estado='activo' AND UPPER(sector_nombre) IN ('OPERACIONES','ALMACEN') AND legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)"
      )).rows;
      const empByLegajo = {}, empByDni = {};
      empleados.forEach(e => { empByLegajo[String(e.legajo)] = e; empByDni[String(e.dni)] = e; });

      // Parsear CSV de FichaYa
      // Columnas: MES,FECHA,HORA,PUERTA,TIPO MOV,CODIGO,NOMBRE,SECTOR
      const lines = csvText.replace(/\r/g, '').split('\n').filter(Boolean);
      const hdr = lines[0].split(',').map(h => h.trim().toUpperCase());
      const iF = hdr.indexOf('FECHA'), iH = hdr.indexOf('HORA');
      const iT = hdr.indexOf('TIPO MOV'), iC = hdr.indexOf('CODIGO'), iN = hdr.indexOf('NOMBRE');

      const marcasMap = {};
      for (let i = 1; i < lines.length; i++) {
        const cols = ausParseCSVRow(lines[i]);
        const codigo = String(cols[iC] || '').trim();
        const fechaRaw = String(cols[iF] || '').trim();
        const hora = String(cols[iH] || '').trim();
        const tipoMov = String(cols[iT] || '').trim().toLowerCase();
        const nombre = String(cols[iN] || '').trim();
        if (!codigo || !fechaRaw) continue;

        const fecha = fichaYaParseFecha(fechaRaw);
        if (!fecha || !fecha.startsWith(`${anio}-${String(+mes).padStart(2,'0')}`)) continue;

        // Resolver empleado por legajo primero, luego por DNI
        const emp = empByLegajo[codigo] || empByDni[codigo];
        if (!emp) continue;

        const accion = tipoMov.includes('entrada') || tipoMov.includes('ingreso') ? 'ingreso' : 'egreso';
        const key = `${emp.dni}|${fecha}`;
        if (!marcasMap[key]) marcasMap[key] = { dni: emp.dni, fecha, empleado: `${emp.apellido} ${emp.nombre}`, marks: [] };
        marcasMap[key].marks.push({ hora, accion });
      }

      const minFecha = fechaDesde, maxFecha = fechaHasta;

      // Días no laborables
      const nolRes = await client.query('SELECT fecha FROM dpo_aus_dias_no_lab');
      const diasNoLab = new Set(nolRes.rows.map(r => r.fecha.toISOString().slice(0, 10)));

      // Guardar jornadas (reemplazar rango)
      await client.query('DELETE FROM dpo_aus_jornadas WHERE fecha BETWEEN $1 AND $2', [minFecha, maxFecha]);
      for (const entry of Object.values(marcasMap)) {
        const { dni, fecha, empleado, marks } = entry;
        const emp = empByDni[dni];
        marks.sort((a, b) => ausTimeToMinutes(a.hora) - ausTimeToMinutes(b.hora));
        let totalMin = 0, completo = true, i = 0;
        while (i < marks.length) {
          if (marks[i].accion === 'ingreso' && i + 1 < marks.length && marks[i+1].accion === 'egreso') {
            totalMin += ausTimeToMinutes(marks[i+1].hora) - ausTimeToMinutes(marks[i].hora);
            i += 2;
          } else { completo = false; i++; }
        }
        const primerIngreso = marks.find(m => m.accion === 'ingreso');
        const ultimoEgreso = [...marks].reverse().find(m => m.accion === 'egreso');
        await client.query(
          `INSERT INTO dpo_aus_jornadas (dni,empleado_nombre,sector_nombre,sucursal_nombre,fecha,horas_trabajadas,datos_completos,hora_ingreso,hora_egreso)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (dni,fecha) DO UPDATE
           SET horas_trabajadas=$6, datos_completos=$7, hora_ingreso=$8, hora_egreso=$9`,
          [dni, empleado, emp ? emp.sector_nombre : '', emp ? emp.sucursal_nombre : '', fecha,
           +(totalMin/60).toFixed(2), completo,
           primerIngreso ? primerIngreso.hora : null, ultimoEgreso ? ultimoEgreso.hora : null]
        );
      }

      // Borrar ausencias del rango y recalcular
      const hoy = new Date().toISOString().slice(0, 10);
      await client.query('DELETE FROM dpo_aus_ausencias WHERE fecha BETWEEN $1 AND $2', [minFecha, maxFecha]);
      await client.query('DELETE FROM dpo_aus_ausencias WHERE fecha >= $1', [hoy]);

      const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const maxFechaAus = maxFecha < ayer ? maxFecha : ayer;
      const diasRango = ausGetDatesInRange(minFecha, maxFechaAus)
        .filter(d => new Date(d+'T00:00:00Z').getUTCDay() !== 0 && !diasNoLab.has(d));
      const presentes = new Set(Object.keys(marcasMap));

      for (const emp of empleados) {
        for (const fecha of diasRango) {
          const key = `${emp.dni}|${fecha}`;
          if (presentes.has(key)) continue;
          await client.query(
            `INSERT INTO dpo_aus_ausencias (dni,empleado_nombre,sector_nombre,sucursal_nombre,fecha,categoria,motivo_original,fuente)
             VALUES ($1,$2,$3,$4,$5,'Faltas no programadas',NULL,'sin_registro')
             ON CONFLICT (dni,fecha) DO UPDATE SET categoria='Faltas no programadas', fuente='sin_registro', motivo_original=NULL`,
            [emp.dni, `${emp.apellido} ${emp.nombre}`, emp.sector_nombre, emp.sucursal_nombre, fecha]
          );
        }
      }

      // Re-aplicar días no laborables
      const nolRango = await client.query(
        'SELECT fecha::text, sucursal_nombre FROM dpo_aus_dias_no_lab WHERE fecha BETWEEN $1 AND $2',
        [minFecha, maxFechaAus]
      );
      for (const nl of nolRango.rows) {
        const sucCond = nl.sucursal_nombre === 'TODAS' ? '' : ` AND UPPER(sucursal_nombre)=UPPER('${nl.sucursal_nombre.replace(/'/g,"''")}')`;
        await client.query(
          `UPDATE dpo_aus_ausencias SET categoria='Ausencia justificada', fuente='dia_no_laborable'
           WHERE fecha=$1 AND categoria NOT IN ('Vacaciones')` + sucCond,
          [nl.fecha]
        );
      }

      res.json({ ok: true, periodo: `${minFecha} → ${maxFecha}`, jornadas: Object.keys(marcasMap).length });
    } finally { client.release(); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Meses con datos
app.get('/api/ausentismo/meses', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT TO_CHAR(fecha,'YYYY-MM') AS mes FROM dpo_aus_jornadas ORDER BY mes DESC`
    );
    res.json(r.rows.map(r => r.mes));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Días no laborables
app.get('/api/ausentismo/dias-no-lab/:anio/:mes', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT fecha::text, descripcion, sucursal_nombre FROM dpo_aus_dias_no_lab
       WHERE EXTRACT(year FROM fecha)=$1 AND EXTRACT(month FROM fecha)=$2 ORDER BY fecha, sucursal_nombre`,
      [req.params.anio, req.params.mes]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ausentismo/dias-no-lab', async (req, res) => {
  try {
    const { fecha, descripcion, accion, sucursal_nombre } = req.body;
    const suc = sucursal_nombre || 'TODAS';
    if (accion === 'eliminar') {
      await pool.query('DELETE FROM dpo_aus_dias_no_lab WHERE fecha=$1 AND sucursal_nombre=$2', [fecha, suc]);
      // Revertir ausencias: si queda marcado para TODAS o para esta sucursal, revertir solo las de esta sucursal
      const sucClause = suc === 'TODAS'
        ? '' // TODAS → revertir todo
        : ` AND UPPER(sucursal_nombre)=UPPER('${suc.replace(/'/g, "''")}')`;
      // Solo revertir si no hay otro registro para TODAS que cubra este día
      const stillCovered = suc !== 'TODAS' ? await pool.query(
        `SELECT 1 FROM dpo_aus_dias_no_lab WHERE fecha=$1 AND sucursal_nombre='TODAS'`, [fecha]
      ) : { rows: [] };
      if (stillCovered.rows.length === 0) {
        await pool.query(
          `UPDATE dpo_aus_ausencias SET categoria='Faltas no programadas', fuente='sin_registro'
           WHERE fecha=$1 AND fuente='dia_no_laborable'` + (suc !== 'TODAS' ? ` AND UPPER(sucursal_nombre)=UPPER($2)` : ''),
          suc !== 'TODAS' ? [fecha, suc] : [fecha]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO dpo_aus_dias_no_lab (fecha, descripcion, sucursal_nombre) VALUES ($1,$2,$3)
         ON CONFLICT (fecha, sucursal_nombre) DO UPDATE SET descripcion=$2`,
        [fecha, descripcion || '', suc]
      );
      // Justificar ausencias de ese día para la sucursal indicada (o todas si TODAS)
      await pool.query(
        `UPDATE dpo_aus_ausencias SET categoria='Ausencia justificada', fuente='dia_no_laborable'
         WHERE fecha=$1 AND categoria NOT IN ('Vacaciones')` + (suc !== 'TODAS' ? ` AND UPPER(sucursal_nombre)=UPPER($2)` : ''),
        suc !== 'TODAS' ? [fecha, suc] : [fecha]
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Resumen mensual
function ausSucClause(sucursal, startParam) {
  // startParam: next $N index after existing params
  if (!sucursal || sucursal === 'total') return { clause: '', params: [] };
  return { clause: ` AND UPPER(sucursal_nombre)=$${startParam}`, params: [sucursal.toUpperCase()] };
}

function ausEmpSucClause(sucursal, startParam) {
  if (!sucursal || sucursal === 'total') return { clause: '', params: [] };
  return { clause: ` AND UPPER(sucursal_nombre)=$${startParam}`, params: [sucursal.toUpperCase()] };
}

app.get('/api/ausentismo/resumen', async (req, res) => {
  try {
    const { anio, mes, sucursal } = req.query;
    const hasSucNol = sucursal && sucursal !== 'total';
    const nolRes = await pool.query(
      hasSucNol
        ? `SELECT fecha::text FROM dpo_aus_dias_no_lab
           WHERE EXTRACT(year FROM fecha)=$1 AND EXTRACT(month FROM fecha)=$2
             AND (sucursal_nombre='TODAS' OR UPPER(sucursal_nombre)=UPPER($3))`
        : `SELECT fecha::text FROM dpo_aus_dias_no_lab
           WHERE EXTRACT(year FROM fecha)=$1 AND EXTRACT(month FROM fecha)=$2`,
      hasSucNol ? [anio, mes, sucursal] : [anio, mes]
    );
    const diasNoLab = new Set(nolRes.rows.map(r => r.fecha));
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const diasLab = ausWorkingDaysInMonth(anio, mes, diasNoLab).filter(d => d <= ayer);
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hasta = new Date(Date.UTC(+anio, +mes, 0)).toISOString().slice(0, 10);

    // Empleados activos de OPERACIONES/ALMACEN no excluidos, con filtro de sucursal
    const hasSuc = sucursal && sucursal !== 'total';
    const empParams = hasSuc ? [sucursal.toUpperCase()] : [];
    const sucEmpCond = hasSuc ? ' AND UPPER(e.sucursal_nombre)=$1' : '';
    const empAll = (await pool.query(
      `SELECT e.* FROM dpo_aus_empleados e
       WHERE e.estado='activo' AND UPPER(e.sector_nombre) IN ('OPERACIONES','ALMACEN')
       AND e.legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)${sucEmpCond}
       ORDER BY e.apellido`,
      empParams
    )).rows;
    const nEmp = empAll.length;

    // Ausencias: JOIN con empleados para filtrar por sector/sucursal actuales
    const sucAusCond = hasSuc ? ' AND UPPER(e2.sucursal_nombre)=$3' : '';
    const ausRes = await pool.query(
      `SELECT a.dni, e2.apellido||' '||e2.nombre AS empleado_nombre, e2.sector_nombre, a.categoria
       FROM dpo_aus_ausencias a
       JOIN dpo_aus_empleados e2 ON e2.dni=a.dni
       WHERE a.fecha BETWEEN $1 AND $2
       AND e2.estado='activo' AND UPPER(e2.sector_nombre) IN ('OPERACIONES','ALMACEN')
       AND e2.legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)${sucAusCond}`,
      hasSuc ? [desde, hasta, sucursal.toUpperCase()] : [desde, hasta]
    );
    let computable = 0, justificada = 0;
    const porPersona = {};
    for (const a of ausRes.rows) {
      const isComp = AUS_COMPUTABLES.includes(a.categoria);
      if (isComp) computable++; else justificada++;
      if (!porPersona[a.dni]) porPersona[a.dni] = { nombre: a.empleado_nombre, sector: a.sector_nombre, comp: 0, just: 0 };
      if (isComp) porPersona[a.dni].comp++; else porPersona[a.dni].just++;
    }

    // Jornadas (presentes): JOIN con empleados
    const sucJorCond = hasSuc ? ' AND UPPER(e.sucursal_nombre)=$3' : '';
    const jorRes = await pool.query(
      `SELECT j.dni, COUNT(*)::int AS dias
       FROM dpo_aus_jornadas j
       JOIN dpo_aus_empleados e ON e.dni=j.dni
       WHERE j.fecha BETWEEN $1 AND $2
       AND e.estado='activo' AND UPPER(e.sector_nombre) IN ('OPERACIONES','ALMACEN')
       AND e.legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)${sucJorCond}
       GROUP BY j.dni`,
      hasSuc ? [desde, hasta, sucursal.toUpperCase()] : [desde, hasta]
    );
    const presMap = {}; jorRes.rows.forEach(r => presMap[r.dni] = r.dias);

    const indice = nEmp > 0 && diasLab.length > 0
      ? +(computable / (nEmp * diasLab.length) * 100).toFixed(2) : 0;
    const tabla = empAll.map(e => {
      const p = porPersona[e.dni] || { comp: 0, just: 0 };
      return {
        dni: e.dni, nombre: `${e.apellido} ${e.nombre}`, sector: e.sector_nombre, sucursal: e.sucursal_nombre,
        dias_lab: diasLab.length, presentes: presMap[e.dni] || 0,
        computable: p.comp, justificada: p.just,
        pct: diasLab.length > 0 ? +(p.comp / diasLab.length * 100).toFixed(1) : 0
      };
    });

    res.json({ diasLab: diasLab.length, nEmp, computable, justificada, indice, tabla });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Exclusiones
app.get('/api/ausentismo/exclusiones', async (req, res) => {
  try {
    const r = await pool.query('SELECT legajo,nombre,razon FROM dpo_aus_exclusiones ORDER BY nombre');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ausentismo/exclusiones', async (req, res) => {
  try {
    const { legajo, nombre, razon } = req.body;
    await pool.query(
      `INSERT INTO dpo_aus_exclusiones (legajo,nombre,razon) VALUES ($1,$2,$3)
       ON CONFLICT (legajo) DO UPDATE SET nombre=$2, razon=$3`,
      [legajo, nombre, razon || '']
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ausentismo/exclusiones/:legajo', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_aus_exclusiones WHERE legajo=$1', [req.params.legajo]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Empleados disponibles para excluir (activos, sectores válidos, no excluidos aún)
app.get('/api/ausentismo/empleados/lista', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT e.legajo, e.apellido, e.nombre, e.sector_nombre, e.sucursal_nombre,
              (x.legajo IS NOT NULL) AS excluido, x.razon
       FROM dpo_aus_empleados e
       LEFT JOIN dpo_aus_exclusiones x ON x.legajo = e.legajo
       WHERE e.estado='activo' AND UPPER(e.sector_nombre) IN ('OPERACIONES','ALMACEN')
       ORDER BY e.apellido, e.nombre`
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Sucursales disponibles
app.get('/api/ausentismo/sucursales', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT sucursal_nombre FROM dpo_aus_empleados
       WHERE estado='activo' AND UPPER(sector_nombre) IN ('OPERACIONES','ALMACEN') AND legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)
       AND sucursal_nombre IS NOT NULL AND sucursal_nombre != '' ORDER BY sucursal_nombre`
    );
    res.json(r.rows.map(r => r.sucursal_nombre));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Listado de ausencias
app.get('/api/ausentismo/ausencias', async (req, res) => {
  try {
    const { anio, mes, sucursal } = req.query;
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hasta = new Date(Date.UTC(+anio, +mes, 0)).toISOString().slice(0, 10);
    const hasSuc2 = sucursal && sucursal !== 'total';
    const sucCond2 = hasSuc2 ? ' AND UPPER(e.sucursal_nombre)=$3' : '';
    const r = await pool.query(
      `SELECT a.id,a.dni,e.apellido||' '||e.nombre AS empleado_nombre,
              e.sector_nombre,e.sucursal_nombre,a.fecha::text,
              a.categoria,a.enfermedad_afeccion,a.motivo_original,a.fuente
       FROM dpo_aus_ausencias a
       JOIN dpo_aus_empleados e ON e.dni=a.dni
       WHERE a.fecha BETWEEN $1 AND $2
       AND e.estado='activo' AND UPPER(e.sector_nombre) IN ('OPERACIONES','ALMACEN')
       AND e.legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)${sucCond2}
       ORDER BY a.fecha,e.apellido`,
      hasSuc2 ? [desde, hasta, sucursal.toUpperCase()] : [desde, hasta]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ausentismo/ausencias/:id', async (req, res) => {
  try {
    const { categoria, enfermedad_afeccion } = req.body;
    await pool.query(
      'UPDATE dpo_aus_ausencias SET categoria=$1,enfermedad_afeccion=$2 WHERE id=$3',
      [categoria, enfermedad_afeccion || null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Jornadas del mes
app.get('/api/ausentismo/jornada', async (req, res) => {
  try {
    const { anio, mes, sucursal } = req.query;
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hasta = new Date(Date.UTC(+anio, +mes, 0)).toISOString().slice(0, 10);
    const hasSuc3 = sucursal && sucursal !== 'total';
    const sucCond3 = hasSuc3 ? ' AND UPPER(e.sucursal_nombre)=$3' : '';
    const r = await pool.query(
      `SELECT j.id,j.dni,e.apellido||' '||e.nombre AS empleado_nombre,
              e.sector_nombre,e.sucursal_nombre,j.fecha::text,j.horas_trabajadas,j.datos_completos,
              j.hora_ingreso,j.hora_egreso
       FROM dpo_aus_jornadas j
       JOIN dpo_aus_empleados e ON e.dni=j.dni
       WHERE j.fecha BETWEEN $1 AND $2
       AND e.estado='activo' AND UPPER(e.sector_nombre) IN ('OPERACIONES','ALMACEN')
       AND e.legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)${sucCond3}
       ORDER BY j.fecha,e.apellido`,
      hasSuc3 ? [desde, hasta, sucursal.toUpperCase()] : [desde, hasta]
    );
    res.json({
      extendidas: r.rows.filter(j => j.horas_trabajadas > 12).length,
      incompletas: r.rows.filter(j => !j.datos_completos).length,
      jornadas: r.rows
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Análisis: días perdidos por sector / motivo / enfermedad
app.get('/api/ausentismo/analisis', async (req, res) => {
  try {
    const { anio, mes, sucursal } = req.query;
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hasta = new Date(Date.UTC(+anio, +mes, 0)).toISOString().slice(0, 10);
    const hasSuc4 = sucursal && sucursal !== 'total';
    const sucCond4 = hasSuc4 ? ' AND UPPER(e.sucursal_nombre)=$3' : '';
    const r = await pool.query(
      `SELECT e.sector_nombre,a.categoria,a.enfermedad_afeccion
       FROM dpo_aus_ausencias a
       JOIN dpo_aus_empleados e ON e.dni=a.dni
       WHERE a.fecha BETWEEN $1 AND $2
       AND e.estado='activo' AND UPPER(e.sector_nombre) IN ('OPERACIONES','ALMACEN')
       AND e.legajo NOT IN (SELECT legajo FROM dpo_aus_exclusiones)${sucCond4}`,
      hasSuc4 ? [desde, hasta, sucursal.toUpperCase()] : [desde, hasta]
    );
    const porSector = {}, porCategoria = {}, porEnfermedad = {};
    for (const a of r.rows) {
      const s = a.sector_nombre || 'Sin sector';
      porSector[s] = (porSector[s]||0) + 1;
      const c = a.categoria || 'Sin categoría';
      porCategoria[c] = (porCategoria[c]||0) + 1;
      if (a.enfermedad_afeccion) porEnfermedad[a.enfermedad_afeccion] = (porEnfermedad[a.enfermedad_afeccion]||0) + 1;
    }
    res.json({ porSector, porCategoria, porEnfermedad });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ENGAGEMENT ──────────────────────────────────────────────────────────────

app.get('/api/engagement/encuestas', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_eng_encuestas ORDER BY fecha_carga DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/engagement/encuestas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_eng_encuestas WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/engagement/resultados/:id', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM dpo_eng_resultados WHERE encuesta_id=$1 ORDER BY nivel,dimension,corte_tipo,corte_valor',
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/engagement/textos/:id', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM dpo_eng_textos WHERE encuesta_id=$1 ORDER BY corte_tipo,corte_valor,pregunta',
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/engagement/upload', upload.single('file'), async (req, res) => {
  try {
    const { periodo, descripcion } = req.body;
    if (!periodo) return res.status(400).json({ error: 'Indicá el período (ej: H2 2025).' });
    if (!req.file) return res.status(400).json({ error: 'Adjuntá el archivo Excel.' });

    const wb = xlsx.read(req.file.buffer);

    // Helper: encontrar hoja por nombre parcial (case-insensitive)
    function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }
    function findSheet(keywords) {
      const name = wb.SheetNames.find(n => keywords.every(k => norm(n).includes(norm(k))));
      return name ? wb.Sheets[name] : null;
    }

    // Helper: mapear columnas a corte_tipo/corte_valor
    function buildColMap(hdr0, hdr1, skipCols) {
      const map = [];
      let lastGrupo = '';
      for (let c = 0; c < hdr1.length; c++) {
        const g = String(hdr0[c] || '').trim().toUpperCase();
        if (g) lastGrupo = g;
        const v = String(hdr1[c] || '').trim();
        if (c < skipCols || !v) { map.push({ tipo: null, valor: null }); continue; }
        let tipo = 'total';
        if (lastGrupo === 'DISTRIBUIDORA') tipo = 'total';
        else if (lastGrupo === 'SUCURSAL') tipo = 'sucursal';
        else if (lastGrupo === 'SECTOR') tipo = 'sector';
        else if (lastGrupo === 'POSICION') tipo = 'posicion';
        else if (lastGrupo === 'GENERO') tipo = 'genero';
        map.push({ tipo, valor: v });
      }
      return map;
    }

    // Helper: mapear columnas H1 (una sola hoja con todo)
    function buildColMapH1(hdr0, hdr1) {
      const map = [];
      let lastGroup = '';
      const cleanV = v => v.replace(/del palacio s\.a\.?\s*-?\s*/i, '').trim();
      for (let c = 0; c < hdr1.length; c++) {
        const g = String(hdr0[c] || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
        if (g) lastGroup = g;
        const v = String(hdr1[c] || '').trim();
        if (c === 0 || !v) { map.push({ tipo: null, valor: null }); continue; }
        // Col 1 = año anterior → skip
        if (c === 1) { map.push({ tipo: null, valor: null }); continue; }
        let tipo = null, valor = cleanV(v);
        const gn = lastGroup;
        if (gn === 'DISTRIBUIDORES' && v.includes('2024')) { tipo = 'total'; valor = 'TOTAL'; }
        else if (gn.includes('SECTOR'))   { tipo = 'sector'; }
        else if (gn.includes('POSICION') || gn.includes('POSICION')) { tipo = 'posicion'; }
        else if (gn.includes('SUCURSAL')) { tipo = 'sucursal'; }
        else if (gn.includes('GENERO'))   { tipo = 'genero'; }
        // ÁREA / REGIÓN: skip (no usados)
        map.push({ tipo, valor });
      }
      return map;
    }

    // Hoja dimensiones: prueba nombre corto primero, luego con sufijo "- Total"
    const dimSheetNode = findSheet(['rdos por dimension']) && !findSheet(['rdos por dimension', 'total'])
      ? findSheet(['rdos por dimension'])
      : (findSheet(['rdos por dimension', 'total']) || findSheet(['rdos por dimension']));
    if (!dimSheetNode) return res.status(400).json({ error: `No se encontró la hoja de resultados por dimensión. Hojas disponibles: ${wb.SheetNames.join(', ')}` });
    const dimRows = xlsx.utils.sheet_to_json(dimSheetNode, { header: 1, defval: '' });

    // Detectar formato H1: fila 0 col 0 es "DISTRIBUIDORES" (plural) y fila 1 col 1 contiene un año
    const hdr0_0 = String(dimRows[0][0] || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const isH1 = hdr0_0.includes('DISTRIBUIDORES') && /\d{4}/.test(String(dimRows[1][1] || ''));
    const colMap = isH1 ? buildColMapH1(dimRows[0], dimRows[1]) : buildColMap(dimRows[0], dimRows[1], 1);
    const dimStartRow = 2;

    const dimResultados = [];
    let lastDim = '';
    for (let r = dimStartRow; r < dimRows.length; r++) {
      const row = dimRows[r];
      const dimCell = String(row[0] || '').trim();
      if (dimCell) lastDim = dimCell;
      const dim = lastDim;
      if (!dim) continue;
      for (let c = 1; c < row.length; c++) {
        const cm = colMap[c];
        if (!cm || !cm.tipo) continue;
        const puntaje = row[c] === '' ? null : Math.round(+row[c]);
        if (puntaje === null || isNaN(puntaje)) continue;
        // Evitar duplicados (misma dim+corte ya insertada)
        if (!dimResultados.find(x => x.dimension===dim && x.corte_tipo===cm.tipo && x.corte_valor===cm.valor))
          dimResultados.push({ nivel: 'dimension', dimension: dim, pregunta: null, corte_tipo: cm.tipo, corte_valor: cm.valor, puntaje });
      }
    }

    // Hoja preguntas
    const pregSheetNode = findSheet(['rdos por pregunta', 'total']) || findSheet(['rdos por pregunta']);
    const pregResultados = [];
    if (pregSheetNode && !isH1) {
      const pregRows = xlsx.utils.sheet_to_json(pregSheetNode, { header: 1, defval: '' });
      const pColMap = buildColMap(pregRows[0], pregRows[1], 2);
      for (let r = 2; r < pregRows.length; r++) {
        const row = pregRows[r];
        const dim = String(row[0] || '').trim(), preg = String(row[1] || '').trim();
        if (!dim || !preg) continue;
        for (let c = 2; c < row.length; c++) {
          const cm = pColMap[c];
          if (!cm || !cm.tipo) continue;
          const puntaje = row[c] === '' ? null : Math.round(+row[c]);
          if (puntaje === null || isNaN(puntaje)) continue;
          pregResultados.push({ nivel: 'pregunta', dimension: dim, pregunta: preg, corte_tipo: cm.tipo, corte_valor: cm.valor, puntaje });
        }
      }
    } else if (isH1) {
      // H1: preguntas están en "Rdos por segmentaciones" con dim+pregunta en cols 0,1
      const segSheet = findSheet(['segmentaciones']) || findSheet(['rdos por segmentacion']);
      if (segSheet) {
        const segRows = xlsx.utils.sheet_to_json(segSheet, { header: 1, defval: '' });
        const pColMap = buildColMapH1(segRows[0], segRows[1]);
        let lastDimP = '';
        for (let r = 2; r < segRows.length; r++) {
          const row = segRows[r];
          const dimCell = String(row[0] || '').trim();
          if (dimCell) lastDimP = dimCell;
          const preg = String(row[1] || '').trim();
          if (!lastDimP || !preg) continue;
          for (let c = 2; c < row.length; c++) {
            const cm = pColMap[c];
            if (!cm || !cm.tipo) continue;
            const puntaje = row[c] === '' ? null : Math.round(+row[c]);
            if (puntaje === null || isNaN(puntaje)) continue;
            pregResultados.push({ nivel: 'pregunta', dimension: lastDimP, pregunta: preg, corte_tipo: cm.tipo, corte_valor: cm.valor, puntaje });
          }
        }
      }
    }

    // Hoja por jefe
    const jefeSheetNode = isH1
      ? (findSheet(['jefes']) || findSheet(['jefe']))
      : (findSheet(['dimension', 'jefe']) && !findSheet(['dimension', 'jefe', 'sucursal'])
          ? findSheet(['dimension', 'jefe'])
          : (wb.Sheets['Rdos por dimension - Por Jefe'] || findSheet(['dimensi', 'total por'])));
    const jefeResultados = [];
    if (jefeSheetNode) {
      const jefeRows = xlsx.utils.sheet_to_json(jefeSheetNode, { header: 1, defval: '' });
      if (isH1) {
        // H1: fila 1 = nombres "SUCURSAL - APELLIDO, NOMBRE", fila 2 = DNIs, datos desde fila 3
        const nombresFila = jefeRows[1] || [];
        const dnisFila   = jefeRows[2] || [];
        // Construir lista de jefes: {col, corte_valor}
        const jefeCols = [];
        for (let c = 2; c < nombresFila.length; c++) {
          const nombre = String(nombresFila[c] || '').trim();
          if (!nombre) continue;
          const dni = String(dnisFila[c] || '').trim();
          // Extraer solo apellido nombre (quitar prefijo "SUCURSAL - ")
          const nombreLimpio = nombre.includes(' - ') ? nombre.split(' - ').slice(1).join(' - ') : nombre;
          const corte_valor = dni ? `${nombreLimpio}. DNI: ${dni}` : nombreLimpio;
          jefeCols.push({ col: c, corte_valor });
        }
        let lastDimJ = '';
        for (let r = 3; r < jefeRows.length; r++) {
          const row = jefeRows[r];
          const dimCell = String(row[0] || '').trim();
          if (dimCell) lastDimJ = dimCell;
          if (!lastDimJ) continue;
          for (const { col, corte_valor } of jefeCols) {
            const puntaje = row[col] === '' ? null : Math.round(+row[col]);
            if (puntaje === null || isNaN(puntaje)) continue;
            if (!jefeResultados.find(x => x.dimension===lastDimJ && x.corte_valor===corte_valor))
              jefeResultados.push({ nivel: 'dimension', dimension: lastDimJ, pregunta: null, corte_tipo: 'jefe', corte_valor, puntaje });
          }
        }
      } else {
        const jefeHdr = jefeRows[0] || [];
        for (let r = 1; r < jefeRows.length; r++) {
          const row = jefeRows[r];
          const dim = String(row[0] || '').trim();
          if (!dim) continue;
          for (let c = 1; c < jefeHdr.length; c++) {
            const jefe = String(jefeHdr[c] || '').trim();
            if (!jefe) continue;
            const puntaje = row[c] === '' ? null : Math.round(+row[c]);
            if (puntaje === null || isNaN(puntaje)) continue;
            jefeResultados.push({ nivel: 'dimension', dimension: dim, pregunta: null, corte_tipo: 'jefe', corte_valor: jefe, puntaje });
          }
        }
      }
    }

    // Hoja respuestas de texto
    const txtSheetNode = findSheet(['respuestas de texto', 'total']) || (isH1 ? findSheet(['respuestas de texto']) : null);
    const textos = [];
    if (txtSheetNode) {
      const txtRows = xlsx.utils.sheet_to_json(txtSheetNode, { header: 1, defval: '' });
      const startR = isH1 ? 1 : 1;
      for (let r = startR; r < txtRows.length; r++) {
        const row = txtRows[r];
        const preg = String(row[1] || '').trim(), resp = String(row[2] || '').trim();
        if (!preg || !resp || resp.trim().length < 3) continue;
        textos.push({ corte_tipo: 'total', corte_valor: 'Del Palacio S.A.', pregunta: preg, respuesta: resp });
      }
    }

    // Guardar en DB
    const enc = await pool.query(
      'INSERT INTO dpo_eng_encuestas (periodo,descripcion) VALUES ($1,$2) RETURNING id',
      [periodo, descripcion || '']
    );
    const encId = enc.rows[0].id;

    const allRes = [...dimResultados, ...pregResultados, ...jefeResultados];
    for (const r of allRes) {
      await pool.query(
        'INSERT INTO dpo_eng_resultados (encuesta_id,nivel,dimension,pregunta,corte_tipo,corte_valor,puntaje) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [encId, r.nivel, r.dimension, r.pregunta, r.corte_tipo, r.corte_valor, r.puntaje]
      );
    }
    for (const t of textos) {
      await pool.query(
        'INSERT INTO dpo_eng_textos (encuesta_id,pregunta,respuesta,corte_tipo,corte_valor) VALUES ($1,$2,$3,$4,$5)',
        [encId, t.pregunta, t.respuesta, t.corte_tipo, t.corte_valor]
      );
    }

    res.json({ ok: true, encuesta_id: encId, resultados: allRes.length, textos: textos.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Adjuntos de encuesta
app.get('/api/engagement/adjuntos/:encuestaId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, nombre, mime_type, tamanio, fecha_carga FROM dpo_eng_adjuntos WHERE encuesta_id=$1 ORDER BY fecha_carga DESC',
      [req.params.encuestaId]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/engagement/adjuntos/file/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT nombre, mime_type, datos FROM dpo_eng_adjuntos WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, mime_type, datos } = r.rows[0];
    res.setHeader('Content-Type', mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombre)}"`);
    res.send(datos);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/engagement/adjuntos/:encuestaId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Sin archivo.' });
    await pool.query(
      'INSERT INTO dpo_eng_adjuntos (encuesta_id, nombre, mime_type, tamanio, datos) VALUES ($1,$2,$3,$4,$5)',
      [req.params.encuestaId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/engagement/adjuntos/file/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_eng_adjuntos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== ENTORNO LABORAL =====================
app.get('/api/el/reportes', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_el_reportes ORDER BY fecha DESC, created_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/el/reportes', async (req, res) => {
  try {
    const { fecha, sucursal, categoria, nombre, descripcion, estado, responsable, fecha_cierre, foto_url, notas_cierre, origen } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_el_reportes (fecha,sucursal,categoria,nombre,descripcion,estado,responsable,fecha_cierre,foto_url,notas_cierre,origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [fecha||null, sucursal||null, categoria||null, nombre||null, descripcion||null,
       estado||'Pendiente', responsable||null, fecha_cierre||null, foto_url||null,
       notas_cierre||null, origen||'manual']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/el/reportes/:id', async (req, res) => {
  try {
    const { fecha, sucursal, categoria, nombre, descripcion, estado, responsable, fecha_cierre, foto_url, notas_cierre } = req.body;
    const r = await pool.query(
      `UPDATE dpo_el_reportes SET fecha=$1,sucursal=$2,categoria=$3,nombre=$4,descripcion=$5,
       estado=$6,responsable=$7,fecha_cierre=$8,foto_url=$9,notas_cierre=$10 WHERE id=$11 RETURNING *`,
      [fecha||null, sucursal||null, categoria||null, nombre||null, descripcion||null,
       estado||'Pendiente', responsable||null, fecha_cierre||null, foto_url||null,
       notas_cierre||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/el/reportes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_el_reportes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/el/revision', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_el_revision WHERE id=1');
    res.json(r.rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/el/revision', async (req, res) => {
  try {
    const { pendiente, resuelto, inversion } = req.body;
    await pool.query(
      `INSERT INTO dpo_el_revision (id,pendiente,resuelto,inversion,updated_at) VALUES (1,$1,$2,$3,NOW())
       ON CONFLICT (id) DO UPDATE SET pendiente=$1,resuelto=$2,inversion=$3,updated_at=NOW()`,
      [pendiente||'', resuelto||'', inversion||'']
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Webhook desde Google Apps Script
app.post('/api/el/webhook', async (req, res) => {
  try {
    const { fecha, sucursal, categoria, nombre, descripcion, foto_url, secret } = req.body;
    if (secret && process.env.EL_WEBHOOK_SECRET && secret !== process.env.EL_WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Unauthorized' });
    await pool.query(
      `INSERT INTO dpo_el_reportes (fecha,sucursal,categoria,nombre,descripcion,estado,foto_url,origen)
       VALUES ($1,$2,$3,$4,$5,'Pendiente',$6,'forms')`,
      [fecha || new Date().toISOString().split('T')[0], sucursal||null, categoria||null,
       nombre||null, descripcion||null, foto_url||null]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== CONFLICTOS LABORALES =====================
app.get('/api/cl/conflictos', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_cl_conflictos ORDER BY fecha DESC, created_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cl/conflictos', async (req, res) => {
  try {
    const { fecha, nombre, contacto, problema, estado, responsable, fecha_cierre, notas_cierre, origen } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_cl_conflictos (fecha,nombre,contacto,problema,estado,responsable,fecha_cierre,notas_cierre,origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [fecha||null, nombre||null, contacto||null, problema||null,
       estado||'Pendiente', responsable||null, fecha_cierre||null, notas_cierre||null, origen||'manual']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/cl/conflictos/:id', async (req, res) => {
  try {
    const { fecha, nombre, contacto, problema, estado, responsable, fecha_cierre, notas_cierre } = req.body;
    const r = await pool.query(
      `UPDATE dpo_cl_conflictos SET fecha=$1,nombre=$2,contacto=$3,problema=$4,
       estado=$5,responsable=$6,fecha_cierre=$7,notas_cierre=$8 WHERE id=$9 RETURNING *`,
      [fecha||null, nombre||null, contacto||null, problema||null,
       estado||'Pendiente', responsable||null, fecha_cierre||null, notas_cierre||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cl/conflictos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_cl_conflictos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cl/webhook', async (req, res) => {
  try {
    const { fecha, nombre, contacto, problema } = req.body;
    await pool.query(
      `INSERT INTO dpo_cl_conflictos (fecha,nombre,contacto,problema,estado,origen)
       VALUES ($1,$2,$3,$4,'Pendiente','forms')`,
      [fecha || new Date().toISOString().split('T')[0], nombre||null, contacto||null, problema||null]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== EVIDENCIAS INCLUSIVIDAD =====================
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.get('/api/el/evidencias', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, fecha, descripcion, archivo_nombre, archivo_tipo, created_at FROM dpo_el_evidencias ORDER BY fecha DESC, created_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/el/evidencias', uploadMem.single('archivo'), async (req, res) => {
  try {
    const { fecha, descripcion } = req.body;
    const archivo_nombre = req.file.originalname;
    const archivo_tipo = req.file.mimetype;
    const archivo_data = req.file.buffer.toString('base64');
    await pool.query(
      `INSERT INTO dpo_el_evidencias (fecha, descripcion, archivo_nombre, archivo_tipo, archivo_data) VALUES ($1,$2,$3,$4,$5)`,
      [fecha || new Date().toISOString().split('T')[0], descripcion || null, archivo_nombre, archivo_tipo, archivo_data]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/el/evidencias/:id/archivo', async (req, res) => {
  try {
    const r = await pool.query('SELECT archivo_nombre, archivo_tipo, archivo_data FROM dpo_el_evidencias WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const { archivo_nombre, archivo_tipo, archivo_data } = r.rows[0];
    const buffer = Buffer.from(archivo_data, 'base64');
    res.setHeader('Content-Type', archivo_tipo);
    res.setHeader('Content-Disposition', `inline; filename="${archivo_nombre}"`);
    res.send(buffer);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/el/evidencias/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_el_evidencias WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== PLAN DE COMUNICACIONES =====================

app.get('/api/pc/comunicaciones', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query('SELECT * FROM dpo_pc_comunicaciones WHERE ($1::int IS NULL OR anio=$1) ORDER BY tipo, id', [anio || null]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pc/comunicaciones', async (req, res) => {
  try {
    const { anio, tipo, contenido, emisor, frecuencia, medio, destinatarios, por_que, meses } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_pc_comunicaciones (anio, tipo, contenido, emisor, frecuencia, medio, destinatarios, por_que, meses) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [anio, tipo||null, contenido, emisor||null, frecuencia||null, medio||null, destinatarios||null, por_que||null, JSON.stringify(meses||{})]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pc/comunicaciones/:id', async (req, res) => {
  try {
    const { anio, tipo, contenido, emisor, frecuencia, medio, destinatarios, por_que, meses } = req.body;
    await pool.query(
      `UPDATE dpo_pc_comunicaciones SET anio=$1, tipo=$2, contenido=$3, emisor=$4, frecuencia=$5, medio=$6, destinatarios=$7, por_que=$8, meses=$9 WHERE id=$10`,
      [anio, tipo||null, contenido, emisor||null, frecuencia||null, medio||null, destinatarios||null, por_que||null, JSON.stringify(meses||{}), req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pc/comunicaciones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_pc_comunicaciones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pc/feedback', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query('SELECT * FROM dpo_pc_feedback WHERE ($1::int IS NULL OR anio=$1) ORDER BY fecha DESC NULLS LAST', [anio || null]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pc/feedback', async (req, res) => {
  try {
    const { anio, fecha, aporte, autor, genero_ajuste, ajuste_descripcion } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_pc_feedback (anio, fecha, aporte, autor, genero_ajuste, ajuste_descripcion) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [anio, fecha||null, aporte, autor||null, genero_ajuste||false, ajuste_descripcion||null]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pc/feedback/:id', async (req, res) => {
  try {
    const { anio, fecha, aporte, autor, genero_ajuste, ajuste_descripcion } = req.body;
    await pool.query(
      `UPDATE dpo_pc_feedback SET anio=$1, fecha=$2, aporte=$3, autor=$4, genero_ajuste=$5, ajuste_descripcion=$6 WHERE id=$7`,
      [anio, fecha||null, aporte, autor||null, genero_ajuste||false, ajuste_descripcion||null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pc/feedback/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_pc_feedback WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pc/evidencias', async (req, res) => {
  try {
    const { comunicacion_id } = req.query;
    const r = await pool.query(
      'SELECT id, comunicacion_id, mes, nombre, tipo, created_at FROM dpo_pc_evidencias WHERE comunicacion_id=$1 ORDER BY mes, created_at',
      [comunicacion_id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pc/evidencias/:id/imagen', async (req, res) => {
  try {
    const r = await pool.query('SELECT ruta, tipo, nombre FROM dpo_pc_evidencias WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).end();
    const { ruta, tipo, nombre } = r.rows[0];
    res.setHeader('Content-Type', tipo || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.sendFile(ruta);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pc/evidencias', uploadDisk.single('imagen'), async (req, res) => {
  try {
    const { comunicacion_id, mes } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    const r = await pool.query(
      'INSERT INTO dpo_pc_evidencias (comunicacion_id, mes, nombre, tipo, ruta) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [comunicacion_id, mes || null, req.file.originalname, req.file.mimetype, req.file.path]
    );
    // Marcar el mes como realizado en la comunicación
    if (mes) {
      const c = await pool.query('SELECT meses FROM dpo_pc_comunicaciones WHERE id=$1', [comunicacion_id]);
      if (c.rows.length) {
        const meses = c.rows[0].meses || {};
        meses[String(mes)] = 'realizado';
        await pool.query('UPDATE dpo_pc_comunicaciones SET meses=$1 WHERE id=$2', [JSON.stringify(meses), comunicacion_id]);
      }
    }
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pc/evidencias/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT ruta FROM dpo_pc_evidencias WHERE id=$1', [req.params.id]);
    if (r.rows.length && r.rows[0].ruta) fs.unlink(r.rows[0].ruta, ()=>{});
    await pool.query('DELETE FROM dpo_pc_evidencias WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== NEGOCIACIÓN SINDICAL =====================

// Reuniones
app.get('/api/ns/reuniones', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query(
      'SELECT id, anio, fecha, tema, representantes, tipo, estado, resumen, archivo_nombre, archivo_tipo, created_at FROM dpo_ns_reuniones WHERE ($1::int IS NULL OR anio=$1) ORDER BY fecha DESC',
      [anio || null]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ns/reuniones', upload.single('archivo'), async (req, res) => {
  try {
    const { anio, fecha, tema, representantes, tipo, estado, resumen } = req.body;
    const archivo_nombre = req.file?.originalname || null;
    const archivo_tipo = req.file?.mimetype || null;
    const archivo_data = req.file ? req.file.buffer.toString('base64') : null;
    const r = await pool.query(
      `INSERT INTO dpo_ns_reuniones (anio, fecha, tema, representantes, tipo, estado, resumen, archivo_nombre, archivo_tipo, archivo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [anio, fecha || null, tema, representantes || null, tipo || 'ordinaria', estado || 'pendiente_minuta', resumen || null, archivo_nombre, archivo_tipo, archivo_data]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ns/reuniones/:id', upload.single('archivo'), async (req, res) => {
  try {
    const { anio, fecha, tema, representantes, tipo, estado, resumen } = req.body;
    const archivo_nombre = req.file?.originalname || req.body.archivo_nombre || null;
    const archivo_tipo = req.file?.mimetype || req.body.archivo_tipo || null;
    const archivo_data = req.file ? req.file.buffer.toString('base64') : undefined;
    if (archivo_data !== undefined) {
      await pool.query(
        `UPDATE dpo_ns_reuniones SET anio=$1, fecha=$2, tema=$3, representantes=$4, tipo=$5, estado=$6, resumen=$7, archivo_nombre=$8, archivo_tipo=$9, archivo_data=$10 WHERE id=$11`,
        [anio, fecha || null, tema, representantes || null, tipo, estado, resumen || null, archivo_nombre, archivo_tipo, archivo_data, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE dpo_ns_reuniones SET anio=$1, fecha=$2, tema=$3, representantes=$4, tipo=$5, estado=$6, resumen=$7 WHERE id=$8`,
        [anio, fecha || null, tema, representantes || null, tipo, estado, resumen || null, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ns/reuniones/:id/archivo', async (req, res) => {
  try {
    const r = await pool.query('SELECT archivo_nombre, archivo_tipo, archivo_data FROM dpo_ns_reuniones WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].archivo_data) return res.status(404).json({ error: 'No encontrado' });
    const { archivo_nombre, archivo_tipo, archivo_data } = r.rows[0];
    res.setHeader('Content-Type', archivo_tipo);
    res.setHeader('Content-Disposition', `inline; filename="${archivo_nombre}"`);
    res.send(Buffer.from(archivo_data, 'base64'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ns/reuniones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_ns_reuniones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Negociaciones
app.get('/api/ns/negociaciones', async (req, res) => {
  try {
    const { anio, sindicato } = req.query;
    const r = await pool.query(
      'SELECT * FROM dpo_ns_negociaciones WHERE ($1::int IS NULL OR anio=$1) AND ($2::text IS NULL OR sindicato=$2) ORDER BY fecha DESC NULLS LAST',
      [anio || null, sindicato || null]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ns/negociaciones', async (req, res) => {
  try {
    const { anio, fecha, tipo, sindicato, descripcion, estado, resultado } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_ns_negociaciones (anio, fecha, tipo, sindicato, descripcion, estado, resultado) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [anio, fecha || null, tipo, sindicato || 'Camioneros', descripcion || null, estado || 'en_curso', resultado || null]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ns/negociaciones/:id', async (req, res) => {
  try {
    const { anio, fecha, tipo, sindicato, descripcion, estado, resultado } = req.body;
    await pool.query(
      `UPDATE dpo_ns_negociaciones SET anio=$1, fecha=$2, tipo=$3, sindicato=$4, descripcion=$5, estado=$6, resultado=$7 WHERE id=$8`,
      [anio, fecha || null, tipo, sindicato || 'Camioneros', descripcion || null, estado, resultado || null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ns/negociaciones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_ns_negociaciones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PDAs de negociaciones
app.get('/api/ns/pdas/:negociacionId', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_ns_pdas WHERE negociacion_id=$1 ORDER BY fecha_limite', [req.params.negociacionId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ns/pdas', async (req, res) => {
  try {
    const { negociacion_id, accion, responsable, fecha_limite, estado } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_ns_pdas (negociacion_id, accion, responsable, fecha_limite, estado) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [negociacion_id, accion, responsable || null, fecha_limite || null, estado || 'pendiente']
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ns/pdas/:id', async (req, res) => {
  try {
    const { accion, responsable, fecha_limite, estado } = req.body;
    await pool.query(
      `UPDATE dpo_ns_pdas SET accion=$1, responsable=$2, fecha_limite=$3, estado=$4 WHERE id=$5`,
      [accion, responsable || null, fecha_limite || null, estado, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ns/pdas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_ns_pdas WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Calendario Gremial
app.get('/api/ns/calendario', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query('SELECT * FROM dpo_ns_calendario WHERE ($1::int IS NULL OR anio=$1) ORDER BY fecha_inicio NULLS LAST', [anio || null]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ns/calendario', async (req, res) => {
  try {
    const { anio, accion, responsable, fecha_inicio, fecha_fin, estado } = req.body;
    const r = await pool.query(
      `INSERT INTO dpo_ns_calendario (anio, accion, responsable, fecha_inicio, fecha_fin, estado) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [anio, accion, responsable || null, fecha_inicio || null, fecha_fin || null, estado || 'pendiente']
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ns/calendario/:id', async (req, res) => {
  try {
    const { anio, accion, responsable, fecha_inicio, fecha_fin, estado } = req.body;
    await pool.query(
      `UPDATE dpo_ns_calendario SET anio=$1, accion=$2, responsable=$3, fecha_inicio=$4, fecha_fin=$5, estado=$6 WHERE id=$7`,
      [anio, accion, responsable || null, fecha_inicio || null, fecha_fin || null, estado, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ns/calendario/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_ns_calendario WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Documentos
app.get('/api/ns/documentos', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query(
      'SELECT id, anio, fecha, categoria, descripcion, archivo_nombre, archivo_tipo, created_at FROM dpo_ns_documentos WHERE ($1::int IS NULL OR anio=$1) ORDER BY fecha DESC',
      [anio || null]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ns/documentos', upload.single('archivo'), async (req, res) => {
  try {
    const { anio, fecha, categoria, descripcion } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const archivo_nombre = req.file.originalname;
    const archivo_tipo = req.file.mimetype;
    const archivo_data = req.file.buffer.toString('base64');
    await pool.query(
      `INSERT INTO dpo_ns_documentos (anio, fecha, categoria, descripcion, archivo_nombre, archivo_tipo, archivo_data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [anio, fecha || null, categoria || null, descripcion || null, archivo_nombre, archivo_tipo, archivo_data]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ns/documentos/:id/archivo', async (req, res) => {
  try {
    const r = await pool.query('SELECT archivo_nombre, archivo_tipo, archivo_data FROM dpo_ns_documentos WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].archivo_data) return res.status(404).json({ error: 'No encontrado' });
    const { archivo_nombre, archivo_tipo, archivo_data } = r.rows[0];
    res.setHeader('Content-Type', archivo_tipo);
    res.setHeader('Content-Disposition', `inline; filename="${archivo_nombre}"`);
    res.send(Buffer.from(archivo_data, 'base64'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ns/documentos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_ns_documentos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== EVALUACIÓN DE DESEMPEÑO =====================
pool.query(`CREATE TABLE IF NOT EXISTS dpo_desempeno_archivos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(300),
  tipo VARCHAR(100),
  contenido BYTEA,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});
pool.query(`ALTER TABLE dpo_desempeno_archivos ADD COLUMN IF NOT EXISTS contenido BYTEA`).catch(()=>{});

app.get('/api/desempeno/archivos', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nombre, tipo, created_at FROM dpo_desempeno_archivos ORDER BY created_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/desempeno/archivos/:id/file', async (req, res) => {
  try {
    const r = await pool.query('SELECT nombre, tipo, contenido FROM dpo_desempeno_archivos WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].contenido) return res.status(404).json({ error: 'Archivo no encontrado' });
    const { nombre, tipo, contenido } = r.rows[0];
    res.setHeader('Content-Type', tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.send(contenido);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/desempeno/archivos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    if (!await checkStorageLimit(res)) return;
    const r = await pool.query(
      'INSERT INTO dpo_desempeno_archivos (nombre, tipo, contenido) VALUES ($1,$2,$3) RETURNING id',
      [req.file.originalname, req.file.mimetype, req.file.buffer]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/desempeno/archivos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_desempeno_archivos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/evaluacion-desempeno', (req, res) => res.sendFile(path.join(__dirname, 'public', 'evaluacion-desempeno.html')));

// ===================== EVALUACIÓN DEL DISTRIBUIDOR =====================
pool.query(`CREATE TABLE IF NOT EXISTS dpo_distrib_archivos (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  nombre VARCHAR(300),
  tipo VARCHAR(100),
  contenido TEXT,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});

app.get('/api/distrib/archivos', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query(
      'SELECT id, anio, nombre, tipo, created_at FROM dpo_distrib_archivos WHERE anio=$1 ORDER BY created_at DESC',
      [anio]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/distrib/archivos/:id/file', async (req, res) => {
  try {
    const r = await pool.query('SELECT nombre, tipo, contenido FROM dpo_distrib_archivos WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].contenido) return res.status(404).json({ error: 'Archivo no encontrado' });
    const { nombre, tipo, contenido } = r.rows[0];
    res.setHeader('Content-Type', tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.send(contenido);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/distrib/archivos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    if (!await checkStorageLimit(res)) return;
    const { anio } = req.body;
    const r = await pool.query(
      'INSERT INTO dpo_distrib_archivos (anio, nombre, tipo, contenido) VALUES ($1,$2,$3,$4) RETURNING id',
      [anio, req.file.originalname, req.file.mimetype, req.file.buffer]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/distrib/archivos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_distrib_archivos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/evaluacion-distribuidor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'evaluacion-distribuidor.html')));

// ===================== OPR =====================

// Tabla archivos OPR — usa disco, no base64 en DB
pool.query(`CREATE TABLE IF NOT EXISTS dpo_opr_archivos (
  id SERIAL PRIMARY KEY,
  periodo_id INTEGER REFERENCES dpo_opr_periodos(id) ON DELETE CASCADE,
  nombre VARCHAR(300),
  tipo VARCHAR(100),
  contenido BYTEA,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(()=>{});
pool.query(`ALTER TABLE dpo_opr_archivos ADD COLUMN IF NOT EXISTS contenido BYTEA`).catch(()=>{});

app.get('/api/opr/archivos', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    const r = await pool.query('SELECT id, periodo_id, nombre, tipo, created_at FROM dpo_opr_archivos WHERE periodo_id=$1 ORDER BY created_at DESC', [periodo_id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/opr/archivos/:id/file', async (req, res) => {
  try {
    const r = await pool.query('SELECT nombre, tipo, contenido FROM dpo_opr_archivos WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].contenido) return res.status(404).json({ error: 'Archivo no encontrado' });
    const { nombre, tipo, contenido } = r.rows[0];
    res.setHeader('Content-Type', tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.send(contenido);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/opr/archivos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    if (!await checkStorageLimit(res)) return;
    const { periodo_id } = req.body;
    const r = await pool.query(
      'INSERT INTO dpo_opr_archivos (periodo_id, nombre, tipo, contenido) VALUES ($1,$2,$3,$4) RETURNING id',
      [periodo_id, req.file.originalname, req.file.mimetype, req.file.buffer]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/opr/archivos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_opr_archivos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/opr/periodos', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_opr_periodos ORDER BY id DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/opr/periodos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_opr_periodos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/opr/personas/:periodoId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM dpo_opr_personas WHERE periodo_id=$1 ORDER BY sector, nombre',
      [req.params.periodoId]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/opr/upload', upload.single('file'), async (req, res) => {
  try {
    const { periodo, descripcion } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });

    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('base'));
    if (!sheetName) return res.status(400).json({ error: `Hoja "Base de datos" no encontrada. Hojas: ${wb.SheetNames.join(', ')}` });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    // Encontrar fila de encabezados (la que tiene "DNI" o "Nombre")
    let hdrRow = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      if (rows[i].some(v => String(v).toLowerCase().includes('nombre') && String(v).toLowerCase().includes('apellido'))) {
        hdrRow = i; break;
      }
    }
    if (hdrRow < 0) return res.status(400).json({ error: 'No se encontró la fila de encabezados' });

    const hdrs = rows[hdrRow].map(v => String(v).toLowerCase().trim());
    const col = keyword => hdrs.findIndex(h => keyword.every(k => h.includes(k)));

    const cSuc   = col(['sucursal']);
    const cDni   = col(['dni']);
    const cNom   = col(['nombre', 'apellido']);
    const cGen   = col(['género', 'genero']);
    const cPos   = col(['posición', 'posicion', 'actual']);
    const cSec   = col(['sector']);
    const cAnt   = col(['antigüedad', 'antiguedad', 'años']);
    const cTPos  = col(['tiempo', 'posición', 'posicion']);
    const cRie   = col(['riesgo']);
    const cMap   = col(['mapeo']);
    const cComO  = col(['comentarios', 'opr']);
    const cComH  = col(['humand']);
    const cMov   = col(['moverse']);
    const cPlazo = col(['plazo']);
    const cArea  = col(['área', 'area', 'posición', 'posicion']);
    const cTras  = col(['traslado']);
    const cKpi1  = col(['kpi #1']);
    const cKpi2  = col(['kpi #2']);
    const cKpi3  = col(['kpi #3']);
    const cClima = col(['clima']);
    const cLider = col(['efectividad']);

    // Notas OPR históricas (buscar por año en el header)
    const notaCols = [];
    hdrs.forEach((h, i) => {
      const m = h.match(/nota.*?(\d{4})/);
      if (m) notaCols.push({ idx: i, year: +m[1], prelim: h.includes('prelim') });
    });
    // Dentro del mismo año: prelim (0) antes que final (1)
    notaCols.sort((a,b) => a.year - b.year || (a.prelim ? 0 : 1) - (b.prelim ? 0 : 1));

    const getNota = (row, offset) => {
      if (notaCols.length <= offset) return '';
      const v = String(row[notaCols[notaCols.length - 1 - offset]?.idx] || '').trim();
      return v;
    };

    const per = await pool.query(
      'INSERT INTO dpo_opr_periodos (periodo,descripcion) VALUES ($1,$2) RETURNING id',
      [periodo, descripcion || '']
    );
    const periodoId = per.rows[0].id;

    let count = 0;
    for (let r = hdrRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const nombre = String(row[cNom] || '').trim();
      if (!nombre) continue;
      const ant = parseFloat(row[cAnt]);
      const tpos = parseFloat(row[cTPos]);
      await pool.query(
        `INSERT INTO dpo_opr_personas
          (periodo_id,sucursal,dni,nombre,genero,posicion,sector,antiguedad,tiempo_posicion,
           nota_ant2,nota_ant1,nota_prelim,nota_final,riesgo_salida,mapeo_talento,
           comentario_opr,comentario_humand,para_moverse,plazo_movimiento,area_movimiento,
           traslado,kpi1,kpi2,kpi3,clima,clima_lider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
        [
          periodoId,
          String(row[cSuc]||'').trim(),
          String(row[cDni]||'').trim(),
          nombre,
          String(row[cGen]||'').trim(),
          String(row[cPos]||'').trim(),
          String(row[cSec]||'').trim(),
          isNaN(ant) ? null : Math.round(ant * 10) / 10,
          isNaN(tpos) ? null : Math.round(tpos * 10) / 10,
          getNota(row, 3), // ant2
          getNota(row, 2), // ant1
          getNota(row, 1), // prelim
          getNota(row, 0), // final
          String(row[cRie]||'').trim(),
          String(row[cMap]||'').trim(),
          String(row[cComO]||'').trim(),
          String(row[cComH]||'').trim(),
          String(row[cMov]||'').trim(),
          String(row[cPlazo]||'').trim(),
          String(row[cArea]||'').trim(),
          String(row[cTras]||'').trim(),
          String(row[cKpi1]||'').trim(),
          String(row[cKpi2]||'').trim(),
          String(row[cKpi3]||'').trim(),
          String(row[cClima]||'').trim(),
          String(row[cLider]||'').trim(),
        ]
      );
      count++;
    }
    res.json({ ok: true, periodo_id: periodoId, personas: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== KPI TURNOVER =====================
pool.query(`CREATE TABLE IF NOT EXISTS dpo_turnover_archivos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(300),
  tipo VARCHAR(200),
  contenido BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`).catch(()=>{});
pool.query(`ALTER TABLE dpo_turnover_archivos ADD COLUMN IF NOT EXISTS contenido BYTEA`).catch(()=>{});

app.get('/api/turnover/archivos', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nombre, tipo, created_at FROM dpo_turnover_archivos ORDER BY created_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/turnover/archivos/:id/file', async (req, res) => {
  try {
    const r = await pool.query('SELECT nombre, tipo, contenido FROM dpo_turnover_archivos WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].contenido) return res.status(404).json({ error: 'Archivo no encontrado' });
    const { nombre, tipo, contenido } = r.rows[0];
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombre)}"`);
    if (tipo) res.setHeader('Content-Type', tipo);
    res.send(contenido);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/turnover/archivos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    if (!await checkStorageLimit(res)) return;
    const r = await pool.query(
      'INSERT INTO dpo_turnover_archivos (nombre, tipo, contenido) VALUES ($1,$2,$3) RETURNING id',
      [req.file.originalname, req.file.mimetype, req.file.buffer]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/turnover/archivos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dpo_turnover_archivos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/kpi-turnover', (req, res) => res.sendFile(path.join(__dirname, 'public', 'kpi-turnover.html')));

// ===================== KPI TURNOVER — DASHBOARD =====================
pool.query(`CREATE TABLE IF NOT EXISTS dpo_turnover_dotacion (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  dni BIGINT,
  nombre VARCHAR(200),
  apellido VARCHAR(200),
  genero VARCHAR(50),
  sector VARCHAR(100),
  sucursal VARCHAR(200),
  posicion VARCHAR(200),
  tipo_contrato VARCHAR(50),
  fecha_nacimiento DATE,
  fecha_ingreso DATE,
  fecha_salida DATE,
  ftes VARCHAR(10),
  tipo_salida VARCHAR(200),
  requiere_reemplazo BOOLEAN DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`).catch(()=>{});

pool.query(`ALTER TABLE dpo_turnover_dotacion ADD COLUMN IF NOT EXISTS sucursal VARCHAR(200)`).catch(()=>{});
pool.query(`ALTER TABLE dpo_turnover_dotacion ADD COLUMN IF NOT EXISTS fecha_salida DATE`).catch(()=>{});
pool.query(`ALTER TABLE dpo_turnover_dotacion ADD COLUMN IF NOT EXISTS es_lider BOOLEAN`).catch(()=>{});

pool.query(`CREATE TABLE IF NOT EXISTS dpo_turnover_config (
  anio INTEGER PRIMARY KEY,
  obj_tto_indeterminados DECIMAL(6,4) DEFAULT 0.0220
)`).catch(()=>{});

const MESES_SHEET = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val.toISOString().split('T')[0];
  const d = new Date(val);
  return isNaN(d) ? null : d.toISOString().split('T')[0];
}

function classifySector(sector) {
  const s = (sector || '').toUpperCase();
  if (s.includes('VENT')) return 'ventas';
  if (s.includes('LOG') || s.includes('DEP')) return 'logistica';
  if (s.includes('ADM')) return 'admin';
  return 'otros';
}

function generacion(fechaNac) {
  if (!fechaNac) return null;
  const anio = new Date(fechaNac).getFullYear();
  if (anio >= 1945 && anio <= 1964) return 'boomer';
  if (anio >= 1965 && anio <= 1981) return 'x';
  if (anio >= 1982 && anio <= 1994) return 'y';
  if (anio >= 1995 && anio <= 2009) return 'z';
  return 'otro';
}

app.post('/api/turnover/importar', uploadDisk.single('archivo'), async (req, res) => {
  try {
    const anio = parseInt(req.body.anio);
    const mes  = parseInt(req.body.mes);
    if (!anio || !mes) return res.status(400).json({ error: 'Falta anio o mes' });

    const wb = xlsx.readFile(req.file.path, { cellDates: true, raw: true });
    fs.unlink(req.file.path, ()=>{});

    // Detectar formato por hojas presentes
    const tieneActiva  = wb.SheetNames.some(n => n.toUpperCase().includes('DOTACI') && n.toUpperCase().includes('ACTIVA'));
    const tieneDotSola = !tieneActiva && wb.SheetNames.some(n => n.toUpperCase() === 'DOTACIÓN' || n.toUpperCase() === 'DOTACION');
    const tieneBajas   = wb.SheetNames.some(n => n.toUpperCase().includes('BAJAS'));

    function colIdx(hdr, ...names) {
      for (const name of names) {
        const i = hdr.findIndex(h => h && h.toString().toUpperCase().includes(name.toUpperCase()));
        if (i >= 0) return i;
      }
      return -1;
    }

    function cellDate(val) {
      if (!val) return null;
      if (val instanceof Date) {
        const y = val.getFullYear(), mo = String(val.getMonth()+1).padStart(2,'0'), d = String(val.getDate()).padStart(2,'0');
        return `${y}-${mo}-${d}`;
      }
      const s = val.toString().trim();
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) { const y = m[3].length===2?'20'+m[3]:m[3]; return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
      return s || null;
    }

    // Guardar requiere_reemplazo ya confirmados antes de borrar
    const prevConf = await pool.query(
      `SELECT dni, nombre, apellido, fecha_salida::text, requiere_reemplazo
       FROM dpo_turnover_dotacion
       WHERE anio=$1 AND mes=$2 AND requiere_reemplazo IS NOT NULL`, [anio, mes]
    );
    const confMap = new Map();
    for (const row of prevConf.rows) {
      const key = row.dni ? String(row.dni) : `${row.apellido}|${row.nombre}`;
      confMap.set(key, row.requiere_reemplazo);
    }

    await pool.query('DELETE FROM dpo_turnover_dotacion WHERE anio=$1 AND mes=$2', [anio, mes]);
    const bajas = [];

    async function insertarRegistro(campos) {
      const { dni, nombre, apellido, genero, sucursal, sector, posicion, tipo_contrato,
              fecha_nacimiento, fecha_ingreso, fecha_salida, ftes, tipo_salida } = campos;
      const ins = await pool.query(
        `INSERT INTO dpo_turnover_dotacion
           (anio,mes,dni,nombre,apellido,genero,sector,sucursal,posicion,tipo_contrato,
            fecha_nacimiento,fecha_ingreso,fecha_salida,ftes,tipo_salida,es_lider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [anio, mes, dni||null, nombre, apellido, genero, sector, sucursal||null, posicion,
         tipo_contrato, fecha_nacimiento, fecha_ingreso, fecha_salida||null, ftes, tipo_salida||null, false]
      );
      // Restaurar requiere_reemplazo si ya estaba confirmado
      const key = dni ? String(dni) : `${apellido}|${nombre}`;
      if (confMap.has(key)) {
        await pool.query('UPDATE dpo_turnover_dotacion SET requiere_reemplazo=$1 WHERE id=$2',
          [confMap.get(key), ins.rows[0].id]);
      } else if (ftes==='no' && tipo_contrato==='INDETERMINADO' && fecha_salida) {
        bajas.push({ id: ins.rows[0].id, nombre: `${nombre} ${apellido}`, tipo_salida: tipo_salida||'—', sector, posicion });
      }
    }

    if (tieneActiva) {
      // ── Formato LEGAJOS (del Palacio MM-YYYY.xlsx) ──
      // DOTACIÓN ACTIVA: todos los activos, filtrar por código de distribuidor
      const wsDot  = wb.Sheets[wb.SheetNames.find(n => n.toUpperCase().includes('DOTACI') && n.toUpperCase().includes('ACTIVA'))];
      const wsBaj  = tieneBajas ? wb.Sheets[wb.SheetNames.find(n => n.toUpperCase().includes('BAJAS'))] : null;

      function parseLegajosSheet(ws, esBaja) {
        const rows = xlsx.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' });
        const hdr  = rows[0].map(v => v ? v.toString() : '');
        const C = {
          cod:  colIdx(hdr, 'CÓDIGO DE DISTRI', 'CODIGO'),
          suc:  colIdx(hdr, 'SEDES', 'SUCURSAL'),
          nom:  colIdx(hdr, 'NOMBRE'),
          ape:  colIdx(hdr, 'Apellido', 'APELLIDO'),
          dni:  colIdx(hdr, 'DNI'),
          gen:  colIdx(hdr, 'GÉNERO', 'GENERO'),
          fnac: colIdx(hdr, 'FECHA DE NACIMIENTO', 'NACIMIENTO'),
          sec:  colIdx(hdr, 'SECTOR'),
          pos:  colIdx(hdr, 'POSICIÓN', 'POSICION'),
          cont: colIdx(hdr, 'TIPO DE CONTRATO'),
          fing: colIdx(hdr, 'Fecha de ingreso a la posicion', 'INGRESO A LA POSICION'),
          fsal: esBaja ? colIdx(hdr, 'Fecha de salida', 'SALIDA') : -1,
          tsal: esBaja ? colIdx(hdr, 'TIPO DE SALIDA') : -1,
        };
        const result = [];
        for (let i=1; i<rows.length; i++) {
          const r = rows[i];
          // Filtrar solo Del Palacio (código 136928)
          const cod = r[C.cod] ? r[C.cod].toString().trim() : '';
          if (cod !== '136928') continue;
          const nombre = r[C.nom] ? r[C.nom].toString().trim() : '';
          if (!nombre) continue;
          result.push(r);
          r._C = C;
        }
        return result;
      }

      const activos = parseLegajosSheet(wsDot, false);
      for (const r of activos) {
        const C = r._C;
        await insertarRegistro({
          dni:              r[C.dni] ? parseInt(r[C.dni]) : null,
          nombre:           r[C.nom].toString().trim(),
          apellido:         (r[C.ape]||'').toString().trim(),
          genero:           (r[C.gen]||'').toString().trim().toUpperCase(),
          sucursal:         (r[C.suc]||'').toString().trim().toUpperCase() || null,
          sector:           (r[C.sec]||'').toString().trim().toUpperCase(),
          posicion:         (r[C.pos]||'').toString().trim().toUpperCase(),
          tipo_contrato:    (r[C.cont]||'').toString().trim().toUpperCase(),
          fecha_nacimiento: cellDate(r[C.fnac]),
          fecha_ingreso:    cellDate(r[C.fing]),
          fecha_salida:     null,
          ftes:             'si',
          tipo_salida:      null,
        });
      }

      if (wsBaj) {
        const bajasRows = parseLegajosSheet(wsBaj, true);
        for (const r of bajasRows) {
          const C = r._C;
          const fecha_salida = cellDate(r[C.fsal]);
          if (!fecha_salida) continue;
          const [fy, fm] = fecha_salida.split('-').map(Number);
          if (fy !== anio || fm !== mes) continue; // solo bajas de este mes
          await insertarRegistro({
            dni:              r[C.dni] ? parseInt(r[C.dni]) : null,
            nombre:           r[C.nom].toString().trim(),
            apellido:         (r[C.ape]||'').toString().trim(),
            genero:           (r[C.gen]||'').toString().trim().toUpperCase(),
            sucursal:         (r[C.suc]||'').toString().trim().toUpperCase() || null,
            sector:           (r[C.sec]||'').toString().trim().toUpperCase(),
            posicion:         (r[C.pos]||'').toString().trim().toUpperCase(),
            tipo_contrato:    (r[C.cont]||'').toString().trim().toUpperCase(),
            fecha_nacimiento: cellDate(r[C.fnac]),
            fecha_ingreso:    cellDate(r[C.fing]),
            fecha_salida,
            ftes:             'no',
            tipo_salida:      (r[C.tsal]||'').toString().trim() || null,
          });
        }
      }

    } else if (tieneDotSola) {
      // ── Formato LEGAJOS v2 (una sola hoja DOTACIÓN con activos y bajas mezclados) ──
      const ws = wb.Sheets[wb.SheetNames.find(n => n.toUpperCase() === 'DOTACIÓN' || n.toUpperCase() === 'DOTACION')];
      const rows = xlsx.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' });
      // Detectar fila de encabezados: buscar la primera fila que contenga "NOMBRE" o "DNI"
      let hdrIdx = 0;
      for (let i=0; i<Math.min(5, rows.length); i++) {
        if (rows[i].some(v => v && /^(NOMBRE|DNI|CÓDIGO)$/i.test(v.toString().trim()))) { hdrIdx = i; break; }
      }
      const hdr  = rows[hdrIdx].map(v => v ? v.toString() : '');
      const C = {
        cod:  colIdx(hdr, 'CÓDIGO DE DISTRI', 'CODIGO DE DISTRI'),
        suc:  colIdx(hdr, 'SEDES', 'SUCURSAL'),
        nom:  colIdx(hdr, 'NOMBRE'),
        ape:  colIdx(hdr, 'APELLIDO', 'Apellido'),
        dni:  colIdx(hdr, 'DNI'),
        gen:  colIdx(hdr, 'GÉNERO', 'GENERO'),
        fnac: colIdx(hdr, 'FECHA DE NACIMIENTO', 'NACIMIENTO'),
        sec:  colIdx(hdr, 'SECTOR'),
        pos:  colIdx(hdr, 'POSICIÓN', 'POSICION'),
        cont: colIdx(hdr, 'TIPO DE CONTRATO'),
        fing: colIdx(hdr, 'FECHA DE INGRESO A LA POSICIÓN', 'Fecha de ingreso a la posicion', 'INGRESO A LA POSICION'),
        fsal: colIdx(hdr, 'FECHA DE SALIDA', 'Fecha de salida'),
        tsal: colIdx(hdr, 'TIPO DE SALIDA'),
      };
      for (let i=hdrIdx+1; i<rows.length; i++) {
        const r = rows[i];
        const cod = r[C.cod] ? r[C.cod].toString().trim() : '';
        if (cod !== '136928') continue;
        const nombre = r[C.nom] ? r[C.nom].toString().trim() : '';
        if (!nombre) continue;
        const fecha_salida = C.fsal >= 0 ? cellDate(r[C.fsal]) : null;
        const ftes = fecha_salida ? 'no' : 'si';
        if (ftes === 'no') {
          const [fy,fm] = fecha_salida.split('-').map(Number);
          if (fy !== anio || fm !== mes) continue;
        }
        await insertarRegistro({
          dni:              r[C.dni] ? parseInt(r[C.dni]) : null,
          nombre,
          apellido:         (r[C.ape]||'').toString().trim(),
          genero:           (r[C.gen]||'').toString().trim().toUpperCase(),
          sucursal:         C.suc >= 0 ? (r[C.suc]||'').toString().trim().toUpperCase() || null : null,
          sector:           (r[C.sec]||'').toString().trim().toUpperCase(),
          posicion:         (r[C.pos]||'').toString().trim().toUpperCase(),
          tipo_contrato:    (r[C.cont]||'').toString().trim().toUpperCase(),
          fecha_nacimiento: cellDate(r[C.fnac]),
          fecha_ingreso:    cellDate(r[C.fing]),
          fecha_salida,
          ftes,
          tipo_salida:      C.tsal >= 0 ? (r[C.tsal]||'').toString().trim() || null : null,
        });
      }

    } else {
      // ── Formato DASHBOARD (TURNOVER_DASHBOARD_YYYY.xlsx, hoja 📅 MesNombre) ──
      const sheetDash = `📅 ${MESES_SHEET[mes-1]}`;
      const ws = wb.Sheets[sheetDash];
      if (!ws) return res.status(400).json({ error: `No se encontró la hoja “${sheetDash}”, “DOTACIÓN ACTIVA” ni “DOTACIÓN” en el archivo.` });

      const rows = xlsx.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' });
      // Auto-detectar layout (STD: nom=3 texto, ALT: nom=3 número)
      let C;
      for (let i=2; i<rows.length; i++) {
        const v = rows[i][3];
        if (v==null||v==='') continue;
        C = (typeof v==='number'||/^\d{6,}$/.test(v.toString().trim()))
          ? { suc:2, nom:4, ape:5, dni:3, gen:7, fnac:8, sec:9, pos:10, cont:12, fing:13, fsal:16, tsal:17, ftes:28, lid:38 }
          : { suc:2, nom:3, ape:4, dni:6, gen:7, fnac:8, sec:9, pos:10, cont:12, fing:13, fsal:16, tsal:17, ftes:28, lid:38 };
        break;
      }
      if (!C) return res.status(400).json({ error: 'No se encontraron datos en la hoja.' });

      for (let i=2; i<rows.length; i++) {
        const r = rows[i];
        const nombre = (r[C.nom]!=null ? r[C.nom].toString() : '').trim();
        if (!nombre) continue;
        const fecha_salida = cellDate(r[C.fsal]);
        const ftes = (r[C.ftes]||'').toString().toLowerCase().trim() || (fecha_salida ? 'no' : 'si');
        if (ftes==='no') {
          if (!fecha_salida) continue;
          const [fy,fm] = fecha_salida.split('-').map(Number);
          if (fy!==anio||fm!==mes) continue;
        }
        await insertarRegistro({
          dni:              r[C.dni] ? parseInt(r[C.dni]) : null,
          nombre,
          apellido:         (r[C.ape]||'').toString().trim(),
          genero:           (r[C.gen]||'').toString().trim().toUpperCase(),
          sucursal:         (r[C.suc]||'').toString().trim().toUpperCase() || null,
          sector:           (r[C.sec]||'').toString().trim().toUpperCase(),
          posicion:         (r[C.pos]||'').toString().trim().toUpperCase(),
          tipo_contrato:    (r[C.cont]||'').toString().trim().toUpperCase(),
          fecha_nacimiento: cellDate(r[C.fnac]),
          fecha_ingreso:    cellDate(r[C.fing]),
          fecha_salida,
          ftes,
          tipo_salida:      (r[C.tsal]||'').toString().trim() || null,
        });
      }
    }

    res.json({ ok: true, mes, bajas_indeterminadas: bajas });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/turnover/dotacion/:mes', async (req, res) => {
  try {
    const mes  = parseInt(req.params.mes);
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    if (!mes || mes < 1 || mes > 12) return res.status(400).json({ error: 'Mes inválido' });
    const r = await pool.query('DELETE FROM dpo_turnover_dotacion WHERE anio=$1 AND mes=$2', [anio, mes]);
    res.json({ ok: true, eliminados: r.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/turnover/importar-json', express.json({limit:'10mb'}), async (req, res) => {
  try {
    const { anio, mes, registros } = req.body;
    if (!anio || !mes || !registros) return res.status(400).json({ error: 'Falta anio, mes o registros' });

    const prevConf = await pool.query(
      `SELECT dni, nombre, apellido, requiere_reemplazo
       FROM dpo_turnover_dotacion
       WHERE anio=$1 AND mes=$2 AND requiere_reemplazo IS NOT NULL`, [anio, mes]
    );
    const confMap = new Map();
    for (const row of prevConf.rows) {
      const key = row.dni ? String(row.dni) : `${row.apellido}|${row.nombre}`;
      confMap.set(key, row.requiere_reemplazo);
    }

    await pool.query('DELETE FROM dpo_turnover_dotacion WHERE anio=$1 AND mes=$2', [anio, mes]);

    const bajas = [];
    for (const r of registros) {
      const esbajaAnio = r.ftes === 'no' && (!r.fecha_salida || r.fecha_salida.startsWith(String(anio)));
      const ins = await pool.query(
        `INSERT INTO dpo_turnover_dotacion
           (anio,mes,dni,nombre,apellido,genero,sector,sucursal,posicion,tipo_contrato,fecha_nacimiento,fecha_ingreso,fecha_salida,ftes,tipo_salida,es_lider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [anio, mes, r.dni, r.nombre, r.apellido, r.genero, r.sector, r.sucursal||null,
         r.posicion, r.tipo_contrato, r.fecha_nacimiento, r.fecha_ingreso, r.fecha_salida||null, r.ftes, r.tipo_salida, r.es_lider||false]
      );
      const key = r.dni ? String(r.dni) : `${r.apellido}|${r.nombre}`;
      if (confMap.has(key)) {
        await pool.query('UPDATE dpo_turnover_dotacion SET requiere_reemplazo=$1 WHERE id=$2',
          [confMap.get(key), ins.rows[0].id]);
      } else if (esbajaAnio && r.tipo_contrato === 'INDETERMINADO') {
        bajas.push({ id: ins.rows[0].id, nombre: `${r.nombre} ${r.apellido}`, tipo_salida: r.tipo_salida||'—', sector: r.sector||'', posicion: r.posicion||'' });
      }
    }
    res.json({ ok: true, mes, insertados: registros.length, bajas_indeterminadas: bajas });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/turnover/confirmar-reemplazos', async (req, res) => {
  try {
    const { confirmaciones } = req.body; // [{ id, requiere_reemplazo: true/false }]
    for (const c of confirmaciones) {
      await pool.query('UPDATE dpo_turnover_dotacion SET requiere_reemplazo=$1 WHERE id=$2', [c.requiere_reemplazo, c.id]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/turnover/pendientes', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const r = await pool.query(
      `SELECT id, mes, nombre, apellido, tipo_salida, sector, posicion
       FROM dpo_turnover_dotacion
       WHERE anio=$1 AND ftes='no' AND tipo_contrato='INDETERMINADO' AND requiere_reemplazo IS NULL
         AND fecha_salida IS NOT NULL
         AND EXTRACT(MONTH FROM fecha_salida) = mes
         AND EXTRACT(YEAR FROM fecha_salida) = anio
       ORDER BY mes, id`, [anio]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/turnover/bajas-indet', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const r = await pool.query(
      `SELECT id, nombre, apellido, sector, posicion, tipo_salida, fecha_salida, requiere_reemplazo
       FROM dpo_turnover_dotacion
       WHERE anio=$1 AND ftes='no' AND tipo_contrato='INDETERMINADO'
         AND fecha_salida IS NOT NULL
         AND EXTRACT(MONTH FROM fecha_salida) = mes
         AND EXTRACT(YEAR FROM fecha_salida) = anio
       ORDER BY fecha_salida, apellido`, [anio]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/turnover/bajas-indet/:id', express.json(), async (req, res) => {
  try {
    const { requiere_reemplazo } = req.body; // true, false, o null
    await pool.query('UPDATE dpo_turnover_dotacion SET requiere_reemplazo=$1 WHERE id=$2', [requiere_reemplazo, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/turnover/dotacion', async (req, res) => {
  try {
    const anio     = parseInt(req.query.anio) || new Date().getFullYear();
    const mes      = parseInt(req.query.mes)  || null;
    const sector   = req.query.sector   || null;
    const sucursal = req.query.sucursal || null;
    const ftes     = req.query.ftes     || null;
    let q = `SELECT nombre, apellido, dni, sector, posicion, sucursal, tipo_contrato, ftes, fecha_salida, tipo_salida
             FROM dpo_turnover_dotacion WHERE anio=$1`;
    const params = [anio];
    if (mes)      { params.push(mes);      q += ` AND mes=$${params.length}`; }
    if (sector)   { params.push(sector);   q += ` AND UPPER(sector)=UPPER($${params.length})`; }
    if (sucursal) { params.push(sucursal); q += ` AND UPPER(sucursal)=UPPER($${params.length})`; }
    if (ftes)     { params.push(ftes);     q += ` AND ftes=$${params.length}`; }
    q += ' ORDER BY apellido, nombre';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/turnover/filtros', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const [sec, suc] = await Promise.all([
      pool.query(`SELECT DISTINCT sector FROM dpo_turnover_dotacion WHERE anio=$1 AND sector IS NOT NULL AND sector<>'' ORDER BY sector`, [anio]),
      pool.query(`SELECT DISTINCT sucursal FROM dpo_turnover_dotacion WHERE anio=$1 AND sucursal IS NOT NULL AND sucursal<>'' ORDER BY sucursal`, [anio])
    ]);
    res.json({ sectores: sec.rows.map(r=>r.sector), sucursales: suc.rows.map(r=>r.sucursal) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/turnover/dashboard', async (req, res) => {
  try {
    const anio    = parseInt(req.query.anio) || new Date().getFullYear();
    const sector  = req.query.sector  || null;
    const sucursal = req.query.sucursal || null;
    const posiciones = req.query.posiciones ? req.query.posiciones.split(',').map(p=>p.trim()).filter(Boolean) : null;

    const LID = `es_lider = true`;
    // Baja cuenta solo en el mes exacto de su fecha_salida
    const BAJA_MES = `(fecha_salida IS NOT NULL AND EXTRACT(MONTH FROM fecha_salida)=mes AND EXTRACT(YEAR FROM fecha_salida)=anio)`;

    const posWhere = posiciones && posiciones.length
      ? ` AND UPPER(posicion) IN (${posiciones.map(p=>`UPPER('${p.replace(/'/g,"''")}')`).join(',')})`
      : '';
    const extraWhere = (sector ? ` AND UPPER(sector)=UPPER('${sector.replace(/'/g,"''")}')` : '')
                    + (sucursal ? ` AND UPPER(sucursal)=UPPER('${sucursal.replace(/'/g,"''")}')` : '')
                    + posWhere;

    const q = (a) => pool.query(`
      SELECT
        mes,
        COUNT(*) FILTER (WHERE ftes='si' OR (ftes='no' AND ${BAJA_MES})) AS dot_total,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND tipo_contrato='INDETERMINADO') AS dot_indet,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND tipo_contrato ILIKE '%TEMPORADA%') AS dot_temp,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND genero='FEMENINO') AS dot_muj,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND genero='MASCULINO') AS dot_hom,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND sector ILIKE '%VENT%') AS sec_ventas,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND (sector ILIKE '%LOG%' OR sector ILIKE '%DEP%')) AS sec_log,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND sector ILIKE '%ADM%') AS sec_adm,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND NOT (sector ILIKE '%VENT%' OR sector ILIKE '%LOG%' OR sector ILIKE '%DEP%' OR sector ILIKE '%ADM%')) AS sec_otros,
        COUNT(*) FILTER (WHERE fecha_ingreso IS NOT NULL AND EXTRACT(MONTH FROM fecha_ingreso)=mes AND EXTRACT(YEAR FROM fecha_ingreso)=anio) AS ing_total,
        COUNT(*) FILTER (WHERE fecha_ingreso IS NOT NULL AND EXTRACT(MONTH FROM fecha_ingreso)=mes AND EXTRACT(YEAR FROM fecha_ingreso)=anio AND tipo_contrato='INDETERMINADO') AS ing_indet,
        COUNT(*) FILTER (WHERE fecha_ingreso IS NOT NULL AND EXTRACT(MONTH FROM fecha_ingreso)=mes AND EXTRACT(YEAR FROM fecha_ingreso)=anio AND tipo_contrato ILIKE '%TEMPORADA%') AS ing_temp,
        COUNT(*) FILTER (WHERE fecha_ingreso IS NOT NULL AND EXTRACT(MONTH FROM fecha_ingreso)=mes AND EXTRACT(YEAR FROM fecha_ingreso)=anio AND genero='FEMENINO') AS ing_muj,
        COUNT(*) FILTER (WHERE fecha_ingreso IS NOT NULL AND EXTRACT(MONTH FROM fecha_ingreso)=mes AND EXTRACT(YEAR FROM fecha_ingreso)=anio AND genero='MASCULINO') AS ing_hom,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES}) AS tto_total,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES} AND tipo_contrato ILIKE '%TEMPORADA%') AS tto_temp,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES} AND tipo_contrato='INDETERMINADO' AND requiere_reemplazo=true) AS tto_indet,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES} AND tipo_contrato='INDETERMINADO' AND requiere_reemplazo=true AND UPPER(posicion) IN ('CHOFER','AYUDANTE','OPERARIO/A')) AS tto_indet_op,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND UPPER(posicion) IN ('CHOFER','AYUDANTE','OPERARIO/A')) AS dot_op,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND tipo_contrato='INDETERMINADO' AND UPPER(posicion) IN ('CHOFER','AYUDANTE','OPERARIO/A')) AS dot_op_indet,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES} AND (tipo_salida ILIKE '%RENUNCIA%')) AS tto_vol,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES} AND (tipo_salida ILIKE '%DESPIDO%' OR tipo_salida ILIKE '%CAUSA%')) AS tto_invol,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES} AND genero='FEMENINO') AS tto_muj,
        COUNT(*) FILTER (WHERE ftes='no' AND ${BAJA_MES} AND genero='MASCULINO') AS tto_hom,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND sector ILIKE '%VENT%' AND genero='FEMENINO') AS ven_muj,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND (sector ILIKE '%LOG%' OR sector ILIKE '%DEP%') AND genero='FEMENINO') AS log_muj,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND sector ILIKE '%ADM%' AND genero='FEMENINO') AS adm_muj,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND ${LID}) AS lid_total,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND genero='FEMENINO' AND ${LID}) AS lid_muj,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND EXTRACT(YEAR FROM fecha_nacimiento) BETWEEN 1945 AND 1964) AS gen_boomer,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND EXTRACT(YEAR FROM fecha_nacimiento) BETWEEN 1965 AND 1981) AS gen_x,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND EXTRACT(YEAR FROM fecha_nacimiento) BETWEEN 1982 AND 1994) AS gen_y,
        COUNT(*) FILTER (WHERE (ftes='si' OR (ftes='no' AND ${BAJA_MES})) AND EXTRACT(YEAR FROM fecha_nacimiento) BETWEEN 1995 AND 2009) AS gen_z
      FROM dpo_turnover_dotacion
      WHERE anio=$1${extraWhere}
      GROUP BY mes ORDER BY mes
    `, [a]);

    const [cur, prev, cfg, pend] = await Promise.all([
      q(anio),
      q(anio - 1),
      pool.query('SELECT * FROM dpo_turnover_config WHERE anio=$1', [anio]),
      pool.query(`SELECT COUNT(*)::int AS c FROM dpo_turnover_dotacion WHERE anio=$1 AND ftes='no' AND tipo_contrato='INDETERMINADO' AND requiere_reemplazo IS NULL AND fecha_salida IS NOT NULL AND EXTRACT(MONTH FROM fecha_salida)=mes AND EXTRACT(YEAR FROM fecha_salida)=anio`, [anio])
    ]);

    const toN = v => parseInt(v) || 0;
    const pct = (a,b) => b > 0 ? a/b : null;

    function buildMonth(row) {
      const d = toN(row.dot_total);
      return {
        dot_total: d, dot_indet: toN(row.dot_indet), dot_temp: toN(row.dot_temp),
        dot_muj: toN(row.dot_muj), dot_hom: toN(row.dot_hom),
        pct_muj: pct(toN(row.dot_muj), d), pct_hom: pct(toN(row.dot_hom), d),
        sec_ventas: toN(row.sec_ventas), sec_log: toN(row.sec_log),
        sec_adm: toN(row.sec_adm), sec_otros: toN(row.sec_otros),
        ing_total: toN(row.ing_total), ing_indet: toN(row.ing_indet),
        ing_temp: toN(row.ing_temp), ing_muj: toN(row.ing_muj), ing_hom: toN(row.ing_hom),
        tto_total: toN(row.tto_total), tto_temp: toN(row.tto_temp),
        tto_indet: toN(row.tto_indet), tto_vol: toN(row.tto_vol),
        tto_invol: toN(row.tto_invol), tto_muj: toN(row.tto_muj), tto_hom: toN(row.tto_hom),
        pct_tto_indet: pct(toN(row.tto_indet), toN(row.dot_indet)),
        tto_indet_op: toN(row.tto_indet_op), dot_op: toN(row.dot_op),
        pct_tto_indet_op: pct(toN(row.tto_indet_op), toN(row.dot_op_indet)),
        ven_muj: toN(row.ven_muj), log_muj: toN(row.log_muj), adm_muj: toN(row.adm_muj),
        lid_total: toN(row.lid_total), lid_muj: toN(row.lid_muj),
        pct_ven_muj: pct(toN(row.ven_muj), toN(row.sec_ventas)),
        pct_log_muj: pct(toN(row.log_muj), toN(row.sec_log)),
        pct_adm_muj: pct(toN(row.adm_muj), toN(row.sec_adm)),
        pct_lid_muj: pct(toN(row.lid_muj), toN(row.lid_total)),
        gen_boomer: toN(row.gen_boomer), gen_x: toN(row.gen_x),
        gen_y: toN(row.gen_y), gen_z: toN(row.gen_z),
        pct_gen_boomer: pct(toN(row.gen_boomer), d), pct_gen_x: pct(toN(row.gen_x), d),
        pct_gen_y: pct(toN(row.gen_y), d), pct_gen_z: pct(toN(row.gen_z), d)
      };
    }

    const months = {}, prevMonths = {};
    for (let m = 1; m <= 12; m++) { months[m] = null; prevMonths[m] = null; }
    for (const row of cur.rows) months[row.mes] = buildMonth(row);
    for (const row of prev.rows) prevMonths[row.mes] = buildMonth(row);

    res.json({
      months,
      prevMonths,
      config: cfg.rows[0] || { anio, obj_tto_indeterminados: 0.0220 },
      pendientes: pend.rows[0].c
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/turnover/config', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const r = await pool.query('SELECT * FROM dpo_turnover_config WHERE anio=$1', [anio]);
    res.json(r.rows[0] || { anio, obj_tto_indeterminados: 0.0220 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/turnover/config', async (req, res) => {
  try {
    const { anio, obj_tto_indeterminados } = req.body;
    await pool.query(
      `INSERT INTO dpo_turnover_config (anio, obj_tto_indeterminados) VALUES ($1,$2)
       ON CONFLICT (anio) DO UPDATE SET obj_tto_indeterminados=$2`,
      [anio, obj_tto_indeterminados]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================== KPI AUSENTISMO — GRILLA MANUAL =====================

pool.query(`CREATE TABLE IF NOT EXISTS dpo_auskpi_empleados (
  id SERIAL PRIMARY KEY,
  legajo VARCHAR(20) NOT NULL,
  sucursal VARCHAR(100),
  sector VARCHAR(100),
  nombre VARCHAR(200),
  apellido VARCHAR(200),
  activo BOOLEAN DEFAULT true,
  UNIQUE(legajo)
)`).catch(()=>{});

pool.query(`CREATE TABLE IF NOT EXISTS dpo_auskpi_marcas (
  id SERIAL PRIMARY KEY,
  legajo VARCHAR(20) NOT NULL,
  anio INT NOT NULL,
  mes INT NOT NULL,
  dia INT NOT NULL,
  valor VARCHAR(80) NOT NULL,
  UNIQUE(legajo, anio, mes, dia)
)`).catch(()=>{});

const AUSKPI_AUSENCIAS = [
  'Lic.Enfermedad (menor a 20 dias)','Rechazo de ART','In Itineres',
  'Lic. Pedida con menos de 48hs','Dias de duelo','Faltas no programadas'
];
const AUSKPI_JUSTIFICADAS = [
  'Vacaciones','Lic. Anses','Lic.Enfermedad (mayor a 20 dias)',
  'Dias gremiales','Dias compensatorios','Tramites','Suspensión',
  'Falta con aviso (mayor a 48hs)','Lic. Por Accidente'
];

app.get('/kpi-ausentismo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'kpi-ausentismo.html')));

// Importar empleados desde Excel (hoja Info)
app.post('/api/auskpi/importar', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const wb = xlsx.read(req.file.buffer);
    const ws = wb.Sheets['Info'];
    if (!ws) return res.status(400).json({ error: 'No se encontró la hoja "Info"' });
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hIdx = rows.findIndex(r => r && String(r[0]||r[1]||r[2]||'').toLowerCase().includes('legajo'));
    if (hIdx < 0) return res.status(400).json({ error: 'No se encontró encabezado con Legajo' });
    const hdr = rows[hIdx].map(h => String(h||'').toLowerCase().trim());
    const iLeg = hdr.findIndex(h => h.includes('legajo'));
    const iSuc = hdr.findIndex(h => h.includes('sucursal'));
    const iSec = hdr.findIndex(h => h.includes('sector'));
    const iNom = hdr.findIndex(h => h.includes('nombre'));
    const iApe = hdr.findIndex(h => h.includes('apellido'));

    const seen = new Set();
    let cnt = 0;
    for (let i = hIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const leg = String(r[iLeg]||'').trim();
      if (!leg || seen.has(leg)) continue;
      seen.add(leg);
      await pool.query(
        `INSERT INTO dpo_auskpi_empleados (legajo, sucursal, sector, nombre, apellido)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (legajo) DO UPDATE
         SET sucursal=$2, sector=$3, nombre=$4, apellido=$5`,
        [leg, String(r[iSuc]||'').trim(), String(r[iSec]||'').trim(),
         String(r[iNom]||'').trim(), String(r[iApe]||'').trim()]
      );
      cnt++;
    }

    // Importar marcas de la hoja Info también
    let marcasCnt = 0;
    const mesesMap = {'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,
      'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12};
    for (let i = hIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const leg = String(r[iLeg]||'').trim();
      const mesStr = String(r[hdr.findIndex(h => h === 'mes')]||'').trim().toLowerCase();
      const anio = parseInt(r[hdr.findIndex(h => h.includes('año') || h.includes('ano'))]);
      const mes = mesesMap[mesStr];
      if (!leg || !mes || !anio) continue;
      for (let d = 1; d <= 31; d++) {
        const colIdx = hdr.findIndex(h => h === String(d));
        if (colIdx < 0) continue;
        const val = String(r[colIdx]||'').trim();
        if (!val) continue;
        await pool.query(
          `INSERT INTO dpo_auskpi_marcas (legajo, anio, mes, dia, valor)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (legajo, anio, mes, dia) DO UPDATE SET valor=$5`,
          [leg, anio, mes, d, val]
        );
        marcasCnt++;
      }
    }

    res.json({ ok: true, empleados: cnt, marcas: marcasCnt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Listar empleados
app.get('/api/auskpi/empleados', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dpo_auskpi_empleados WHERE activo=true ORDER BY sector, apellido, nombre');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Obtener marcas de un mes
app.get('/api/auskpi/marcas', async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const r = await pool.query(
      'SELECT legajo, dia, valor FROM dpo_auskpi_marcas WHERE anio=$1 AND mes=$2',
      [anio, mes]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Guardar marca individual
app.put('/api/auskpi/marcas', async (req, res) => {
  try {
    const { legajo, anio, mes, dia, valor } = req.body;
    if (!valor) {
      await pool.query('DELETE FROM dpo_auskpi_marcas WHERE legajo=$1 AND anio=$2 AND mes=$3 AND dia=$4',
        [legajo, anio, mes, dia]);
    } else {
      await pool.query(
        `INSERT INTO dpo_auskpi_marcas (legajo, anio, mes, dia, valor)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (legajo, anio, mes, dia) DO UPDATE SET valor=$5`,
        [legajo, anio, mes, dia, valor]
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Días hábiles por mes (carga manual)
pool.query(`CREATE TABLE IF NOT EXISTS dpo_auskpi_dias_habiles (
  id SERIAL PRIMARY KEY,
  anio INT NOT NULL,
  mes INT NOT NULL,
  dias INT NOT NULL,
  UNIQUE(anio, mes)
)`).catch(()=>{});

app.get('/api/auskpi/dias-habiles', async (req, res) => {
  try {
    const { anio } = req.query;
    const r = await pool.query('SELECT mes, dias FROM dpo_auskpi_dias_habiles WHERE anio=$1', [anio]);
    const result = {};
    r.rows.forEach(row => { result[row.mes] = row.dias; });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/auskpi/dias-habiles', async (req, res) => {
  try {
    const { anio, mes, dias } = req.body;
    await pool.query(
      `INSERT INTO dpo_auskpi_dias_habiles (anio, mes, dias) VALUES ($1,$2,$3)
       ON CONFLICT (anio, mes) DO UPDATE SET dias=$3`,
      [anio, mes, dias]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// KPI mensual (hoja Calculo)
app.get('/api/auskpi/calculo', async (req, res) => {
  try {
    const { anio } = req.query;
    const empR = await pool.query('SELECT COUNT(*) AS c FROM dpo_auskpi_empleados WHERE activo=true');
    const cantEmp = parseInt(empR.rows[0].c);
    const marcasR = await pool.query('SELECT mes, valor, COUNT(*)::int AS c FROM dpo_auskpi_marcas WHERE anio=$1 GROUP BY mes, valor', [anio]);
    const dhR = await pool.query('SELECT mes, dias FROM dpo_auskpi_dias_habiles WHERE anio=$1', [anio]);
    const dhByMes = {};
    dhR.rows.forEach(r => { dhByMes[r.mes] = r.dias; });

    const meses = {};
    for (let m = 1; m <= 12; m++) meses[m] = { presente: 0, ausencia: 0, justificada: 0 };
    marcasR.rows.forEach(r => {
      const m = r.mes;
      if (r.valor === 'Presente') meses[m].presente += r.c;
      else if (AUSKPI_AUSENCIAS.includes(r.valor)) meses[m].ausencia += r.c;
      else if (AUSKPI_JUSTIFICADAS.includes(r.valor)) meses[m].justificada += r.c;
    });

    const result = [];
    for (let m = 1; m <= 12; m++) {
      const diasLab = dhByMes[m] || 0;
      const pct = (cantEmp > 0 && diasLab > 0) ? meses[m].ausencia / (diasLab * cantEmp) : null;
      result.push({
        mes: m, presente: meses[m].presente, ausencia: meses[m].ausencia,
        justificada: meses[m].justificada, dias_laborales: diasLab,
        empleados: cantEmp, pct
      });
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ausencias por persona por mes (hoja Ausencias x persona)
app.get('/api/auskpi/por-persona', async (req, res) => {
  try {
    const { anio } = req.query;
    const empR = await pool.query('SELECT legajo, sector, nombre, apellido FROM dpo_auskpi_empleados WHERE activo=true ORDER BY sector, apellido');
    const marcasR = await pool.query(
      `SELECT legajo, mes, valor, COUNT(*)::int AS c FROM dpo_auskpi_marcas
       WHERE anio=$1 AND valor = ANY($2) GROUP BY legajo, mes, valor`,
      [anio, AUSKPI_AUSENCIAS]
    );
    const dhR = await pool.query('SELECT mes, dias FROM dpo_auskpi_dias_habiles WHERE anio=$1', [anio]);
    const dhByMes = {};
    dhR.rows.forEach(r => { dhByMes[r.mes] = r.dias; });

    const ausMap = {};
    marcasR.rows.forEach(r => {
      const key = r.legajo + '_' + r.mes;
      ausMap[key] = (ausMap[key] || 0) + r.c;
    });

    const personas = empR.rows.map(e => {
      const meses = {};
      for (let m = 1; m <= 12; m++) {
        const diasLab = dhByMes[m] || 0;
        const aus = ausMap[e.legajo + '_' + m] || 0;
        meses[m] = diasLab > 0 ? aus / diasLab : null;
      }
      return { legajo: e.legajo, sector: e.sector, nombre: e.nombre, apellido: e.apellido, meses };
    });
    res.json(personas);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Detalle ausencias — tabla para guardar enfermedad/motivo por bloque
pool.query(`CREATE TABLE IF NOT EXISTS dpo_auskpi_detalle (
  id SERIAL PRIMARY KEY,
  legajo VARCHAR(20) NOT NULL,
  anio INT NOT NULL,
  mes INT NOT NULL,
  dia_desde INT NOT NULL,
  dia_hasta INT NOT NULL,
  categoria VARCHAR(80),
  enfermedad VARCHAR(300),
  motivo VARCHAR(300),
  UNIQUE(legajo, anio, mes, dia_desde)
)`).catch(()=>{});

// Generar bloques de ausencia agrupando días consecutivos con misma categoría
app.get('/api/auskpi/detalle', async (req, res) => {
  try {
    const { anio } = req.query;
    const marcasR = await pool.query(
      `SELECT m.legajo, m.mes, m.dia, m.valor, e.nombre, e.apellido, e.sector
       FROM dpo_auskpi_marcas m
       JOIN dpo_auskpi_empleados e ON e.legajo = m.legajo
       WHERE m.anio=$1 AND m.valor IN ('Lic.Enfermedad (menor a 20 dias)','Rechazo de ART','In Itineres','Lic. Pedida con menos de 48hs','Dias de duelo','Faltas no programadas')
       ORDER BY m.legajo, m.mes, m.dia`,
      [anio]
    );

    // Agrupar días consecutivos del mismo empleado/mes/categoría
    const bloques = [];
    let current = null;
    marcasR.rows.forEach(r => {
      if (current && current.legajo === r.legajo && current.mes === r.mes
          && current.valor === r.valor && r.dia === current.dia_hasta + 1) {
        current.dia_hasta = r.dia;
        current.dias++;
      } else {
        if (current) bloques.push(current);
        current = {
          legajo: r.legajo, nombre: r.nombre, apellido: r.apellido, sector: r.sector,
          mes: r.mes, dia_desde: r.dia, dia_hasta: r.dia, valor: r.valor, dias: 1
        };
      }
    });
    if (current) bloques.push(current);

    // Enriquecer con detalle guardado (enfermedad/motivo)
    const detR = await pool.query('SELECT * FROM dpo_auskpi_detalle WHERE anio=$1', [anio]);
    const detMap = {};
    detR.rows.forEach(d => { detMap[d.legajo + '_' + d.mes + '_' + d.dia_desde] = d; });

    const result = bloques.map(b => {
      const det = detMap[b.legajo + '_' + b.mes + '_' + b.dia_desde];
      return {
        legajo: b.legajo, nombre: b.nombre, apellido: b.apellido, sector: b.sector,
        mes: b.mes, dia_desde: b.dia_desde, dia_hasta: b.dia_hasta,
        dias: b.dias, categoria: b.valor,
        enfermedad: det ? det.enfermedad : '',
        motivo: det ? det.motivo : ''
      };
    });

    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Guardar detalle (enfermedad/motivo) de un bloque
app.put('/api/auskpi/detalle', async (req, res) => {
  try {
    const { legajo, anio, mes, dia_desde, dia_hasta, categoria, enfermedad, motivo } = req.body;
    await pool.query(
      `INSERT INTO dpo_auskpi_detalle (legajo, anio, mes, dia_desde, dia_hasta, categoria, enfermedad, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (legajo, anio, mes, dia_desde) DO UPDATE
       SET dia_hasta=$5, categoria=$6, enfermedad=$7, motivo=$8`,
      [legajo, anio, mes, dia_desde, dia_hasta, categoria, enfermedad || '', motivo || '']
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Análisis: días perdidos por sector / motivo / enfermedad
app.get('/api/auskpi/analisis', async (req, res) => {
  try {
    const { anio } = req.query;
    const marcasR = await pool.query(
      `SELECT m.valor, e.sector, COUNT(*)::int AS dias
       FROM dpo_auskpi_marcas m
       JOIN dpo_auskpi_empleados e ON e.legajo = m.legajo
       WHERE m.anio=$1 AND m.valor IN ('Lic.Enfermedad (menor a 20 dias)','Rechazo de ART','In Itineres','Lic. Pedida con menos de 48hs','Dias de duelo','Faltas no programadas')
       GROUP BY m.valor, e.sector`,
      [anio]
    );

    const porSector = {}, porMotivo = {};
    marcasR.rows.forEach(r => {
      porSector[r.sector] = (porSector[r.sector] || 0) + r.dias;
      porMotivo[r.valor] = (porMotivo[r.valor] || 0) + r.dias;
    });

    const detR = await pool.query(
      `SELECT enfermedad, SUM(dia_hasta - dia_desde + 1)::int AS dias
       FROM dpo_auskpi_detalle WHERE anio=$1 AND enfermedad != '' GROUP BY enfermedad`,
      [anio]
    );
    const porEnfermedad = {};
    detR.rows.forEach(r => { porEnfermedad[r.enfermedad] = r.dias; });

    res.json({ porSector, porMotivo, porEnfermedad });
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


