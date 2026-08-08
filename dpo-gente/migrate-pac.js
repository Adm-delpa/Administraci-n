// Correr una sola vez: DATABASE_URL=... node migrate-pac.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false, checkServerIdentity: () => undefined } : false
});

const CAPS = [
  // Almacén
  { pilar: 'Almacén', nombre: 'ABC + FEFO', responsable: '', fecha_programada: '2026-06-24' },
  { pilar: 'Almacén', nombre: 'Semana de Calidad en Almacén', responsable: '', fecha_programada: '2026-09-16' },
  { pilar: 'Almacén', nombre: 'Calidad de Marketplace', responsable: '', fecha_programada: '2026-09-16' },
  { pilar: 'Almacén', nombre: 'Reempaque de Productos', responsable: '', fecha_programada: '2026-06-10' },
  { pilar: 'Almacén', nombre: 'Políticas de Calidad - PRI - Disposición Final de Residuos', responsable: '', fecha_programada: '2026-07-22' },
  { pilar: 'Almacén', nombre: 'Políticas de Calidad - Devoluciones', responsable: '', fecha_programada: '2026-07-22' },
  { pilar: 'Almacén', nombre: 'Clasificacion de activos - MKPLACE', responsable: '', fecha_programada: '2026-09-16' },
  { pilar: 'Almacén', nombre: 'Rotura en Almacén', responsable: '', fecha_programada: '2026-06-10' },
  { pilar: 'Almacén', nombre: 'Picking montaje + Reabastecimiento', responsable: '', fecha_programada: '2026-06-24' },
  { pilar: 'Almacén', nombre: 'Carga y descarga de camiones', responsable: '', fecha_programada: '2026-04-22' },
  // Gente
  { pilar: 'Gente', nombre: 'Princípios de Cultura del Distribuidor', responsable: 'Interno Distribuidor', fecha_programada: '2026-06-02' },
  { pilar: 'Gente', nombre: 'Código de Conducta y Compliance', responsable: 'Interno Distribuidor', fecha_programada: '2026-06-16' },
  { pilar: 'Gente', nombre: 'Política, respeto y anti-discriminación', responsable: 'Interno Distribuidor', fecha_programada: '2026-07-20' },
  { pilar: 'Gente', nombre: 'Remuneración & Beneficios', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Gente', nombre: 'SKAP para Lideres', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Gente', nombre: 'Gestión de indicadores de Gente - Ausentismo', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Gente', nombre: 'Pilar Gente DPO - 3R', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Gente', nombre: 'Train the Trainer', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Gente', nombre: 'Seguridad Psicologica', responsable: 'Interno Distribuidor', fecha_programada: '2026-07-16' },
  { pilar: 'Gente', nombre: 'Encuesta de Engagement (Bajada de resultados)', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Gente', nombre: 'Equipos Autónomos para lideres', responsable: 'EQUIPO DPO', fecha_programada: null },
  // Flota
  { pilar: 'Flota', nombre: 'Gestión de Flota', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Flota', nombre: 'Documentación, Telemetría & Multas', responsable: 'Interno Distribuidor', fecha_programada: '2026-06-04' },
  { pilar: 'Flota', nombre: 'Checklist de Flota', responsable: 'Interno Distribuidor', fecha_programada: '2026-06-04' },
  { pilar: 'Flota', nombre: 'Política de Combustible & Neumáticos', responsable: 'Interno Distribuidor', fecha_programada: '2026-08-15' },
  { pilar: 'Flota', nombre: 'Mantenimiento (taller, piezas, resudios)', responsable: 'Interno Distribuidor', fecha_programada: '2026-09-19' },
  // Entrega
  { pilar: 'Entrega', nombre: 'Ejecución de la Rutina Básica (Delivery Team Journey)', responsable: 'Interno Distribuidor', fecha_programada: '2026-04-30' },
  { pilar: 'Entrega', nombre: 'Ejecución de entrega', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-02' },
  { pilar: 'Entrega', nombre: 'Herramientas digitales', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-29' },
  { pilar: 'Entrega', nombre: 'Semana de Calidad en Distribución', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Entrega', nombre: 'Feedback de choferes', responsable: 'Interno Distribuidor', fecha_programada: '2026-04-23' },
  { pilar: 'Entrega', nombre: 'Satisfacción del cliente (RMD & NPS)', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-09' },
  { pilar: 'Entrega', nombre: 'Rechazo (Modulación & Refacturaciones)', responsable: 'Interno Distribuidor', fecha_programada: '2026-04-22' },
  // Gestion
  { pilar: 'Gestion', nombre: 'Línea Ética', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-16' },
  { pilar: 'Gestion', nombre: 'La importancia del 5 S', responsable: 'Interno Distribuidor', fecha_programada: '2026-04-25' },
  { pilar: 'Gestion', nombre: 'Team Room (Del & WH)', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Gestion', nombre: 'Ciclo de Gestión', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Gestion', nombre: 'Herramientas de Gestión', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Gestion', nombre: 'Sueño', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-23' },
  { pilar: 'Gestion', nombre: 'Tarea Critica', responsable: 'Interno Distribuidor', fecha_programada: '2026-06-13' },
  { pilar: 'Gestion', nombre: '5XQ', responsable: 'Interno Distribuidor', fecha_programada: '2026-07-11' },
  { pilar: 'Gestion', nombre: 'DPO para Líderes', responsable: 'EQUIPO DPO', fecha_programada: null },
  // Planeamiento
  { pilar: 'Planeamiento', nombre: 'Dimensionamiento de la Instalación', responsable: 'Interno Distribuidor', fecha_programada: '2026-09-12' },
  { pilar: 'Planeamiento', nombre: 'Gestión de Riesgos Externos', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-06' },
  { pilar: 'Planeamiento', nombre: 'Costos (VLC-Capex-Champions)', responsable: 'Interno Distribuidor', fecha_programada: '2026-08-28' },
  { pilar: 'Planeamiento', nombre: 'Proceso de Ruterización + Planner', responsable: 'EQUIPO DPO', fecha_programada: null },
  // Seguridad
  { pilar: 'Seguridad', nombre: '1, 2 y 9. REPORTE DE LESIONES- DEFINCION DE SIF E INVESTIGACION DE INCIDENTES- IN ITINERE (COMMUTING)', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-05' },
  { pilar: 'Seguridad', nombre: '3. TRANSPORTE SEGURO EN EL LUGAR DE TRABAJO', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '4 y 10. MANEJO MANUAL DE CARGAS (teorico y práctico)', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '5. SUSTANCIAS PELIGROSAS', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-28' },
  { pilar: 'Seguridad', nombre: '6. ESPACIOS CONFINADOS- CONOCIMIENTO GENERAL', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-28' },
  { pilar: 'Seguridad', nombre: '7. PREVENCION DE VIOLENCIA', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-26' },
  { pilar: 'Seguridad', nombre: '8. CONDUCCION SEGURA/ MANEJO DEFENSIVO- CONOCIMIENTO GENERAL', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '10. TRABAJO EN ALTURA- CONOCIMIENTO GENERAL', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '11. SAM/ LOTOTO - CONOCIMIENTO GENERAL', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '13. MONITOREOS (OWD) / COACHING (GESTION ENFOCADA)', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '13. CONOCIMIENTO DE LOS FUNDAMENTOS BASICOS (GESTION ENFOCADA)- DPO PARA LIDERES', responsable: 'EQUIPO DPO', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '15. RESPUESTA A EMERGENCIAS - CONOCIMIENTO GENERAL', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '1, 3, 10 y 4. OPERACIÓN DE AUTOELEVADOR, MANEJO DEFENSIVO TEORICO/PRACTICO Y CARGA DE GLP', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '1, 10 y 4. OPERACION DE EQUIPO MOTORIZADO Y MANEJO DEFENSIVO, CARGA DE BATERIA / CARGA DIESEL', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '2, 10 y 4. OPERACIÓN DE EQUIPO DE ELEVACION, MANEJO DEFENSIVO y CARGA DE BATERIA (ZORRA)', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-12' },
  { pilar: 'Seguridad', nombre: '5. CARGA DE DIESEL (GENERADOR ELECTRICO)- TEORICO PRACTICO', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '6. MANEJO DE GAS COMPRIMIDO (TUBOS CO2)', responsable: 'Interno Distribuidor', fecha_programada: '2026-06-15' },
  { pilar: 'Seguridad', nombre: '7 y 8. ENTRADA Y RESCATE EN ESPACIO CONFINADO - TEORICA/PRACTICA', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '9. MANEJO DE EFECTIVO', responsable: 'Interno Distribuidor', fecha_programada: '2026-05-07' },
  { pilar: 'Seguridad', nombre: '10. MANEJO DEFENSIVO TEORICO/PRACTICO MOTO (IN ITINERE)', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '10. MANEJO DEFENSIVO TEORICO AUTO (IN ITINERE)', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '11. TRABAJO EN ALTURA- TEORICO PRACTICO PARA HABILITAR EMPLEADOS', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '13. SAM PARA HABILITAR EMPLEADOS', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '13. LOTOTO PARA HABILITAR EMPLEADOS', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '15. BRIGADA DE EMERGENCIA - TEORICO PRACTICO', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '16. PERMISOS DE TRABAJO (EMISION, VERIFICACION) PARA HABILITAR EMPLEADOS', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: 'ER del puesto de trabajo, Procedimiento de trabajo / SOPs de Seguridad, ER rutas criticas', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '16.2 Entrenamiento de Liderazgo en seguridad: OLT (NIVEL I). Para Líderes nuevos.', responsable: 'HSMA CMQ', fecha_programada: null },
  { pilar: 'Seguridad', nombre: '16.2 SAFE TOGETHER: Entrenamiento para Distribuidores que recibieron el OLT previamente.', responsable: 'HSMA CMQ', fecha_programada: null },
  { pilar: 'Seguridad', nombre: 'Riesgos Eléctricos CONOCIMIENTO GENERAL', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: 'SALUD OCUPACIONAL', responsable: 'Interno Distribuidor', fecha_programada: null },
  { pilar: 'Seguridad', nombre: 'MANDATORIO Corte con Vidrio', responsable: 'Interno Distribuidor', fecha_programada: '2026-06-08' },
  { pilar: 'Seguridad', nombre: 'Ejecución del proceso Carga y Descarga', responsable: 'Interno Distribuidor', fecha_programada: null },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
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
      CREATE TABLE IF NOT EXISTS dpo_pac_asistentes (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER REFERENCES dpo_pac_capacitaciones(id) ON DELETE CASCADE,
        nombre VARCHAR(200) NOT NULL,
        asistio BOOLEAN DEFAULT false,
        aprobado BOOLEAN DEFAULT false
      );
    `);
    const existing = await client.query('SELECT COUNT(*)::int AS c FROM dpo_pac_capacitaciones');
    if (existing.rows[0].c > 0) {
      console.log('Ya hay', existing.rows[0].c, 'capacitaciones en la DB. Saliendo sin insertar para evitar duplicados.');
      console.log('Si querés re-cargar, primero corré: DELETE FROM dpo_pac_capacitaciones;');
      return;
    }

    let ok = 0;
    for (const c of CAPS) {
      await client.query(
        'INSERT INTO dpo_pac_capacitaciones (pilar, nombre, responsable, fecha_programada) VALUES ($1,$2,$3,$4)',
        [c.pilar, c.nombre, c.responsable || null, c.fecha_programada || null]
      );
      ok++;
    }
    console.log(`✓ Insertadas ${ok} capacitaciones.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
