// Migración de R.2.1.6 Vacantes.xlsx → dpo_vacantes + dpo_vacantes_candidatos
// Ejecutar: node migrate-vacantes.js
const xlsx = require('./dpo-gente/node_modules/xlsx');
const { Pool } = require('./dpo-gente/node_modules/pg');
require('dotenv').config({ path: './dpo-gente/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const FILE = 'C:/Users/aryps/OneDrive/Desktop/R.2.1.6 Vacantes.xlsx';

const toDate = (v) => {
  if (!v || v === '') return null;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
  return null;
};

const statusMap = (s) => {
  if (!s) return 'En curso';
  const u = String(s).trim().toLowerCase();
  if (u === 'ok') return 'Ok';
  if (u === 'no ok' || u === 'no aplica') return 'No ok';
  return 'En curso';
};

async function run() {
  const wb = xlsx.readFile(FILE, { cellDates: true });
  const ws = wb.Sheets['2. Vacancy Fulfillment'];
  const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find header row (contains "Posición")
  const hdrIdx = raw.findIndex(r => r.some(c => String(c).includes('Posición') || String(c).includes('Posicion')));
  if (hdrIdx < 0) { console.error('No se encontró la fila de headers'); process.exit(1); }
  const hdrs = raw[hdrIdx].map(h => String(h).trim());

  const col = (name) => hdrs.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const iMes    = col('Mes');
  const iAnio   = col('Año');
  const iPos    = col('Posición') >= 0 ? col('Posición') : col('Posicion');
  const iSec    = col('Sector');
  const iTipo   = col('Tipo de Contratación') >= 0 ? col('Tipo de Contratación') : col('Tipo de Contratacion');
  const iAper   = col('Apertura de Vacante');
  const iInicio = col('Fecha de Inicio');
  const iCierre = col('Fecha de Cierre');
  const iIngr   = col('Fecha de Ingreso');
  const iStatus = col('Status');
  const iNom    = col('Nombre');
  const iApell  = col('Apellido');
  const iCel    = col('Celular');
  const iMail   = col('Mail');
  const iFuente = col('Fuente de Reclutamiento');
  const iEntLid = col('Entrevista Lider');
  const iEntRRH = col('Entrevista RRHH');
  const iEntDue = col('Entrevista Dueño');
  const iComent = col('Comentarios');
  const iAccion = col('Acción') >= 0 ? col('Acción') : col('Accion');
  const iFeedba = col('Feedback');
  const iPool   = col('Pool');
  const iNuevo  = col('Nuevo ingreso');

  const dataRows = raw.slice(hdrIdx + 1).filter(r => r[iPos] && String(r[iPos]).trim());

  // Group rows by (Mes, Año, Posición, Sector, Tipo, Apertura) → one vacante per group
  const vacMap = new Map();
  for (const row of dataRows) {
    const pos   = String(row[iPos] || '').trim();
    const mes   = String(row[iMes] || '').trim();
    const anio  = parseInt(row[iAnio]) || null;
    const sec   = String(row[iSec] || '').trim();
    const tipo  = String(row[iTipo] || '').trim();
    const aper  = toDate(row[iAper]);
    const key   = `${mes}|${anio}|${pos}|${sec}|${tipo}|${aper}`;
    if (!vacMap.has(key)) {
      vacMap.set(key, {
        mes, anio, posicion: pos, sector: sec,
        tipo_contratacion: tipo,
        apertura: aper,
        fecha_inicio: toDate(row[iInicio]),
        status: statusMap(row[iStatus]),
        nuevo_ingreso: String(row[iNuevo]||'').toLowerCase() === 'no ok' ? false : String(row[iNuevo]||'').trim() !== '',
        sede: 'Dolores',
        candidatos: []
      });
    }
    const vac = vacMap.get(key);
    // Update status if this row has a definitive one
    if (row[iStatus]) vac.status = statusMap(row[iStatus]);

    const nombre = String(row[iNom] || '').trim();
    const apellido = String(row[iApell] || '').trim();
    if (nombre || apellido) {
      vac.candidatos.push({
        nombre, apellido,
        celular: String(row[iCel] || '').trim(),
        mail: String(row[iMail] || '').trim(),
        fuente: String(row[iFuente] || '').trim(),
        fecha_entrevista_lider: toDate(row[iEntLid]),
        fecha_entrevista_rrhh: toDate(row[iEntRRH]),
        fecha_entrevista_dueno: toDate(row[iEntDue]),
        comentarios: String(row[iComent] || '').trim(),
        accion: String(row[iAccion] || '').trim(),
        feedback: String(row[iFeedba] || '').trim(),
        pool_posicion: String(row[iPool] || '').trim(),
        fecha_cierre: toDate(row[iCierre]),
        fecha_ingreso: toDate(row[iIngr]),
      });
    }
  }

  const client = await pool.connect();
  try {
    let vacCount = 0, candCount = 0;
    for (const [, v] of vacMap) {
      const r = await client.query(
        `INSERT INTO dpo_vacantes (sede,mes,anio,posicion,sector,tipo_contratacion,apertura,fecha_inicio,status,nuevo_ingreso)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [v.sede, v.mes, v.anio, v.posicion, v.sector, v.tipo_contratacion, v.apertura, v.fecha_inicio, v.status, v.nuevo_ingreso]
      );
      const vacId = r.rows[0].id;
      vacCount++;
      for (const c of v.candidatos) {
        await client.query(
          `INSERT INTO dpo_vacantes_candidatos (vacante_id,nombre,apellido,celular,mail,fuente,fecha_entrevista_lider,fecha_entrevista_rrhh,fecha_entrevista_dueno,comentarios,accion,feedback,pool_posicion,fecha_cierre,fecha_ingreso)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [vacId, c.nombre, c.apellido, c.celular, c.mail, c.fuente, c.fecha_entrevista_lider, c.fecha_entrevista_rrhh, c.fecha_entrevista_dueno, c.comentarios, c.accion, c.feedback, c.pool_posicion, c.fecha_cierre, c.fecha_ingreso]
        );
        candCount++;
      }
    }
    console.log(`✓ Migradas ${vacCount} vacantes y ${candCount} candidatos.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
