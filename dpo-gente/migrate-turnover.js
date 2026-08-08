// Migración: lee el Excel del dashboard y carga meses 1-5 en Railway
// Uso: node migrate-turnover.js

const xlsx = require('xlsx');

const FILE = 'C:\\Users\\aryps\\OneDrive\\Desktop\\TURNOVER_DASHBOARD_2026_DelPalacio (2) (1).xlsx';
const API  = 'https://dpo-gente-production.up.railway.app';
const ANIO = 2026;
const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CARGAR  = [1,2,3,4,5,6];

// Columnas 0-based del archivo TURNOVER_DASHBOARD (layout estándar)
const C_STD  = { suc:2, nom:3, ape:4, dni:6, gen:7, fnac:8, sec:9, pos:10, cont:12, fing:13, fsal:16, tsal:17, ftes:28, lid:38 };
// Layout alternativo donde el DNI está primero (ej: Abril 2026)
const C_ALT  = { suc:2, nom:4, ape:5, dni:3, gen:7, fnac:8, sec:9, pos:10, cont:12, fing:13, fsal:16, tsal:17, ftes:28, lid:38 };

function detectarColumnas(rows) {
  // Si la primera fila de datos tiene un número en col 3, es el layout alternativo (DNI primero)
  for (let i = 2; i < rows.length; i++) {
    const v = rows[i][3];
    if (v == null || v === '') continue;
    return (typeof v === 'number' || /^\d{6,}$/.test(v.toString().trim())) ? C_ALT : C_STD;
  }
  return C_STD;
}

function dateFromObj(val) {
  if (!val || isNaN(val)) return null;
  const y  = val.getFullYear();
  const mo = String(val.getMonth() + 1).padStart(2,'0');
  const d  = String(val.getDate()).padStart(2,'0');
  return `${y}-${mo}-${d}`;
}

// Fechas de ingreso/salida: el Excel las guarda en MM/DD/YYYY
function parseDateMDY(val) {
  if (!val) return null;
  if (val instanceof Date) return dateFromObj(val);
  const s = val.toString().trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  return s;
}

// Fecha de nacimiento: formato argentino DD/MM/YYYY cuando viene como texto
function parseDateDMY(val) {
  if (!val) return null;
  if (val instanceof Date) return dateFromObj(val);
  const s = val.toString().trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '19' + m[3] : m[3];
    return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return s;
}

async function main() {
  console.log('Leyendo archivo:', FILE);
  const wb = xlsx.readFile(FILE, { cellDates: true, raw: false });
  console.log('Hojas encontradas:', wb.SheetNames.join(', '));

  for (const mes of MESES_CARGAR) {
    const sheetName = `📅 ${MESES_NOMBRES[mes-1]}`;
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.log(`  [SKIP] Hoja "${sheetName}" no encontrada`);
      continue;
    }

    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const C = detectarColumnas(rows);
    const registros = [];

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      const nombre = (r[C.nom] != null ? r[C.nom].toString() : '').trim();
      if (!nombre) continue;

      const fecha_salida = parseDateMDY(r[C.fsal]);
      const ftes = (r[C.ftes] || '').toString().toLowerCase().trim() || (fecha_salida ? 'no' : 'si');
      // Solo incluir bajas cuya fecha_salida corresponde exactamente al mes que se está importando
      if (ftes === 'no') {
        if (!fecha_salida) continue; // baja sin fecha: no se puede asignar a ningún mes
        const [fy, fm] = fecha_salida.split('-').map(Number);
        if (fy !== ANIO || fm !== mes) continue;
      }

      registros.push({
        dni:              r[C.dni] ? parseInt(r[C.dni]) : null,
        nombre,
        apellido:         (r[C.ape]  || '').trim(),
        genero:           (r[C.gen]  || '').trim().toUpperCase(),
        sucursal:         (r[C.suc]  || '').trim().toUpperCase() || null,
        sector:           (r[C.sec]  || '').trim().toUpperCase(),
        posicion:         (r[C.pos]  || '').trim().toUpperCase(),
        tipo_contrato:    (r[C.cont] || '').trim().toUpperCase(),
        fecha_nacimiento: parseDateDMY(r[C.fnac]),
        fecha_ingreso:    parseDateMDY(r[C.fing]),
        fecha_salida,
        ftes,
        tipo_salida:      (r[C.tsal] || '').trim() || null,
        es_lider:         (r[C.lid] || '').toString().toLowerCase().trim() === 'si'
      });
    }

    process.stdout.write(`Mes ${mes} (${MESES_NOMBRES[mes-1]}): ${registros.length} registros → `);

    const resp = await fetch(`${API}/api/turnover/importar-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anio: ANIO, mes, registros })
    });
    const data = await resp.json();

    if (data.ok) {
      console.log(`✓ ${data.insertados} insertados, ${data.bajas_indeterminadas?.length || 0} bajas indeterminadas pendientes`);
    } else {
      console.log(`✗ Error: ${data.error || JSON.stringify(data)} (HTTP ${resp.status})`);
    }
  }

  console.log('\nListo. Las bajas indeterminadas pendientes las podés confirmar desde el módulo KPI Turnover → Pendientes.');
}

main().catch(console.error);
