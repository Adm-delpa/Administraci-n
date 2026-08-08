// node migrate-nomina.js
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined }
});

const NOMINA = [
  { apellido: 'AGUIRRE',  nombre: 'LEANDRO NICOLAS', sector: 'LOGÍSTICA', posicion: 'CHOFER' },
  { apellido: 'BAIGORRIA',nombre: 'SERGIO DAVID',    sector: 'LOGÍSTICA', posicion: 'CHOFER' },
  { apellido: 'CORDOBA',  nombre: 'CARLOS GUSTAVO',  sector: 'LOGÍSTICA', posicion: 'CHOFER' },
  { apellido: 'ESPINOLA', nombre: 'DANIEL OMAR',     sector: 'LOGÍSTICA', posicion: 'CHOFER' },
  { apellido: 'GIMENEZ',  nombre: 'EDGARDO ISMAEL',  sector: 'LOGÍSTICA', posicion: 'SUPERVISOR/A' },
  { apellido: 'GOMEZ',    nombre: 'JONATAN JOSUE',   sector: 'LOGÍSTICA', posicion: 'AYUDANTE' },
  { apellido: 'GONZALEZ', nombre: 'GUSTAVO ARIEL',   sector: 'LOGÍSTICA', posicion: 'AYUDANTE' },
  { apellido: 'MORAN',    nombre: 'FRANCO',          sector: 'LOGÍSTICA', posicion: 'AYUDANTE' },
  { apellido: 'MORAN',    nombre: 'JUAN FRANCISCO',  sector: 'LOGÍSTICA', posicion: 'OPERARIO/A' },
  { apellido: 'PAEZ',     nombre: 'SERGIO DAMIAN',   sector: 'LOGÍSTICA', posicion: 'CHOFER' },
  { apellido: 'PORTELA',  nombre: 'GUILLERMO JOSE',  sector: 'LOGÍSTICA', posicion: 'CHOFER' },
  { apellido: 'ROCHA',    nombre: 'NICOLAS',         sector: 'LOGÍSTICA', posicion: 'SUPERVISOR/A' },
  { apellido: 'ROMERO',   nombre: 'PABLO ANDRÉS',    sector: 'LOGÍSTICA', posicion: 'CHOFER' },
  { apellido: 'ROMERO',   nombre: 'RICARDO MARIANO', sector: 'LOGÍSTICA', posicion: 'CHOFER' },
];

async function run() {
  const client = await pool.connect();
  try {
    // Crear tablas si no existen
    await client.query(`
      CREATE TABLE IF NOT EXISTS dpo_pac_nomina (
        id SERIAL PRIMARY KEY,
        apellido VARCHAR(100) NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        sector VARCHAR(100) DEFAULT '',
        posicion VARCHAR(100) DEFAULT '',
        activo BOOLEAN DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS dpo_pac_asistentes_new (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER REFERENCES dpo_pac_capacitaciones(id) ON DELETE CASCADE,
        nomina_id INTEGER REFERENCES dpo_pac_nomina(id) ON DELETE CASCADE,
        aplica BOOLEAN DEFAULT true,
        asistio BOOLEAN DEFAULT false,
        aprobado BOOLEAN DEFAULT false,
        UNIQUE(capacitacion_id, nomina_id)
      );
    `);

    // Cargar nómina si está vacía
    const existing = await client.query('SELECT COUNT(*)::int AS c FROM dpo_pac_nomina');
    if (existing.rows[0].c === 0) {
      for (const p of NOMINA) {
        await client.query(
          'INSERT INTO dpo_pac_nomina (apellido,nombre,sector,posicion) VALUES ($1,$2,$3,$4)',
          [p.apellido, p.nombre, p.sector, p.posicion]
        );
      }
      console.log(`✓ Nómina cargada: ${NOMINA.length} personas`);
    } else {
      console.log(`Nómina ya tiene ${existing.rows[0].c} registros, no se insertó.`);
    }

    // Reemplazar tabla asistentes por la nueva (con nomina_id)
    await client.query('DROP TABLE IF EXISTS dpo_pac_asistentes CASCADE');
    await client.query('ALTER TABLE dpo_pac_asistentes_new RENAME TO dpo_pac_asistentes');
    console.log('✓ Tabla dpo_pac_asistentes actualizada con nomina_id + aplica');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
