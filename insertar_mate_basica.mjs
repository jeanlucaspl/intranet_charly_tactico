/**
 * insertar_mate_basica.mjs
 * Lee mate_basica.txt e inserta las preguntas en banco_preguntas para MA-01.
 * El enunciado_texto se guarda tal como está en el archivo: [[expr],[resp]]
 * El código del frontend agrega $...$ en tiempo de render.
 *
 * Requisitos:
 *   node >= 18
 *   npm install @supabase/supabase-js  (ya instalado)
 *
 * Ejecutar:
 *   node insertar_mate_basica.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL     = 'https://jfczouzgikqxcnotukag.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3pvdXpnaWtxeGNub3R1a2FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI4NTU2OCwiZXhwIjoyMDg4ODYxNTY4fQ.IHLY5WAveyfLZMUZzJlAwspEOWZ0cYXF4hBk5K8t_h0';

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. Leer y parsear el archivo ────────────────────────────────
const filePath = '/home/jeanlucas/Desktop/preuniversitario/charly/banco_de_preguntas/mate_basica.txt';
const lines = readFileSync(filePath, 'utf-8').split('\n');

const QUESTION_RE = /^\[\[(.+)\],\s*\[(.+)\]\]\s*$/;

let currentSubtema = 'General';
const preguntas = [];

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  // Cabecera de subtema (ej: "enteros:", "exponentes:")
  if (/^[a-záéíóúñA-ZÁÉÍÓÚÑ_].*:$/.test(line)) {
    currentSubtema = line.replace(/:$/, '');
    continue;
  }

  const m = line.match(QUESTION_RE);
  if (m) {
    preguntas.push({
      subtema:         currentSubtema,
      enunciado_texto: line,   // guardamos la línea completa [[q],[a]]
    });
  }
}

console.log(`Preguntas parseadas: ${preguntas.length}`);

// ── 2. Obtener el ID de la materia MA-01 ────────────────────────
const { data: mats, error: matError } = await sb
  .from('materias')
  .select('id,nombre,codigo');

if (matError) { console.error('Error cargando materias:', matError); process.exit(1); }

const mat = (mats || []).find(m => m.codigo === 'MA-01' || m.nombre === 'Matematica');
if (!mat) {
  console.error('Materia MA-01 no encontrada. Verifica que exista en la tabla materias.');
  console.log('Materias disponibles:', mats?.map(m => `${m.codigo} - ${m.nombre}`));
  process.exit(1);
}

console.log(`Materia encontrada: ${mat.nombre} (${mat.codigo}) → id: ${mat.id}`);

// ── 3. Verificar si ya hay preguntas de mate básica ─────────────
const { count } = await sb
  .from('banco_preguntas')
  .select('id', { count: 'exact', head: true })
  .eq('materia_id', mat.id)
  .like('enunciado_texto', '[[%');

if (count > 0) {
  console.log(`\n⚠️  Ya existen ${count} preguntas de mate básica para MA-01.`);
  console.log('Eliminando las existentes antes de reinsertar...');
  const { error: delError } = await sb
    .from('banco_preguntas')
    .delete()
    .eq('materia_id', mat.id)
    .like('enunciado_texto', '[[%');
  if (delError) { console.error('Error al eliminar:', delError); process.exit(1); }
  console.log('Eliminadas correctamente.');
}

// ── 4. Insertar en lotes de 100 ─────────────────────────────────
const BATCH = 100;
let insertadas = 0;

for (let i = 0; i < preguntas.length; i += BATCH) {
  const lote = preguntas.slice(i, i + BATCH).map(p => ({
    materia_id:      mat.id,
    subtema:         p.subtema,
    tipo:            'simple',
    enunciado_texto: p.enunciado_texto,
  }));

  const { error } = await sb.from('banco_preguntas').insert(lote);
  if (error) {
    console.error(`Error en lote ${i}-${i + BATCH}:`, error);
    process.exit(1);
  }
  insertadas += lote.length;
  process.stdout.write(`\rInsertadas: ${insertadas}/${preguntas.length}`);
}

console.log(`\n✅ Listo. ${insertadas} preguntas de mate básica insertadas para MA-01.`);
