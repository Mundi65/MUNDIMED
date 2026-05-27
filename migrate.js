// Workaround SSL proxy corporativo
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const USER_ID = 'mpn44qe5d83';
const FILE    = './medicamentos 26-5-2026.json';

const backup = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// Extraer colecciones — tolerante a nombres alternativos del export
const { P, MEDS = [], DOSES = [], MEALS = [], EX = [], VITALS = [], EXAMS = [] } = backup;

// CRÍTICO: eliminar apiKey antes de cualquier uso
const { apiKey, ...profile } = P;
if (apiKey) console.log('⚠️  apiKey excluido del perfil (no se guarda en Supabase)');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function upsertTable(table, payload) {
  const r = await supabase.from(table).upsert({ user_id: USER_ID, updated_at: new Date().toISOString(), ...payload });
  if (r.error) throw new Error(`${table}: ${r.error.message}`);
  return r.status;
}

(async () => {
  console.log(`\n📦 Migrando backup v${backup._v} del ${backup._date}`);
  console.log(`👤 user_id: ${USER_ID}\n`);

  const tasks = [
    { table: 'profiles',     payload: { data: profile },                       label: `perfil de ${profile.name}` },
    { table: 'medications',  payload: { meds: MEDS, doses: DOSES },            label: `${MEDS.length} medicamentos, ${DOSES.length} dosis` },
    { table: 'meals',        payload: { data: MEALS },                         label: `${MEALS.length} comidas` },
    { table: 'exercise',     payload: { data: EX },                            label: `${EX.length} sesiones de ejercicio` },
    { table: 'vitals',       payload: { data: VITALS },                        label: `${VITALS.length} signos vitales` },
    { table: 'exams',        payload: { data: EXAMS },                         label: `${EXAMS.length} exámenes` },
  ];

  for (const t of tasks) {
    try {
      const status = await upsertTable(t.table, t.payload);
      console.log(`  ✅ ${t.table.padEnd(12)} — ${t.label}  (HTTP ${status})`);
    } catch (err) {
      console.error(`  ❌ ${t.table.padEnd(12)} — ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\n🔍 Verificando conteos en Supabase...\n');

  const checks = ['profiles','medications','meals','exercise','vitals','exams'];
  for (const table of checks) {
    const r = await supabase.from(table).select('*').eq('user_id', USER_ID).maybeSingle();
    if (r.error) { console.error(`  ❌ ${table}: ${r.error.message}`); continue; }
    if (!r.data)  { console.log(`  ⚠️  ${table}: sin datos`); continue; }

    let count = '—';
    if (table === 'profiles')    count = `perfil: ${r.data.data?.name}`;
    if (table === 'medications') count = `${(r.data.meds||[]).length} meds, ${(r.data.doses||[]).length} dosis`;
    if (table === 'meals')       count = `${(r.data.data||[]).length} comidas`;
    if (table === 'exercise')    count = `${(r.data.data||[]).length} sesiones`;
    if (table === 'vitals')      count = `${(r.data.data||[]).length} vitales`;
    if (table === 'exams')       count = `${(r.data.data||[]).length} exámenes`;

    // Confirmar que apiKey NO está en el perfil guardado
    if (table === 'profiles' && r.data.data?.apiKey) {
      console.error('  🚨 ALERTA: apiKey encontrado en profiles — borrar manualmente');
    }

    console.log(`  ✅ ${table.padEnd(12)} — ${count}`);
  }

  console.log('\n✨ Migración completada.\n');
})();
