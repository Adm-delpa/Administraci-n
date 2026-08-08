// node migrate-pc.js
const XLSX = require('xlsx');

const FILE = 'C:/Users/aryps/OneDrive/Desktop/Plan Comunicaciones .xlsx';
const BASE = 'https://dpo-gente-production.up.railway.app';
const ANIO = 2026;

const wb = XLSX.readFile(FILE);
const ws = wb.Sheets['Del Palacio S.A'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Header row is index 1, data from index 2
// Columns: 0=Tipo, 1=Contenido, 2=Emisor, 3=Frecuencia, 4=Medio, 5=Destinatarios,
//          6=E(1), 7=F(2), 8=M(3), 9=A(4), 10=M(5), 11=J(6), 12=J(7), 13=A(8),
//          14=S(9), 15=O(10), 16=N(11), 17=D(12)

const MONTH_COLS = [6,7,8,9,10,11,12,13,14,15,16,17];

const comunicaciones = [];
let currentTipo = null;

for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[1]) continue; // skip empty rows (need at least contenido)

  if (r[0]) currentTipo = String(r[0]).trim();

  const meses = {};
  MONTH_COLS.forEach((col, idx) => {
    if (r[col] && r[col] != null && r[col] !== 0 && r[col] !== '' && r[col] !== 'No') {
      meses[String(idx + 1)] = true;
    }
  });

  comunicaciones.push({
    anio: ANIO,
    tipo: currentTipo || 'Institucional',
    contenido: String(r[1] || '').trim(),
    emisor: String(r[2] || '').trim() || null,
    frecuencia: String(r[3] || '').trim() || null,
    medio: String(r[4] || '').trim() || null,
    destinatarios: String(r[5] || '').trim() || null,
    por_que: null,
    meses
  });
}

console.log(`Filas a insertar: ${comunicaciones.length}`);

async function run() {
  let ok = 0, err = 0;
  for (const c of comunicaciones) {
    try {
      const res = await fetch(`${BASE}/api/pc/comunicaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c)
      });
      const j = await res.json();
      if (j.ok) { ok++; process.stdout.write('.'); }
      else { err++; console.error('\nERROR:', j.error, c.contenido); }
    } catch(e) {
      err++;
      console.error('\nFAIL:', e.message, c.contenido);
    }
  }
  console.log(`\nListo: ${ok} ok, ${err} errores`);
}

run();
