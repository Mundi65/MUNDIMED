

require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────
// POST /api/sync — recibe todos los datos del usuario y los guarda
// ─────────────────────────────────────────────────────────────
app.post('/api/sync', async (req, res) => {
  const { userId, profile, medications, doses, meals, exercise, vitals, exams, sleep } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

  console.log(`[SYNC] userId=${userId} vitals=${(vitals||[]).length} meals=${(meals||[]).length} sleep=${(sleep||[]).length}`);

  const ts = new Date().toISOString();
  const tables = ['profiles','medications','meals','exercise','vitals','exams','sleep'];
  try {
    const results = await Promise.all([
      supabase.from('profiles').upsert({ user_id: userId, data: profile ?? {}, updated_at: ts }),
      supabase.from('medications').upsert({ user_id: userId, meds: medications ?? [], doses: doses ?? [], updated_at: ts }),
      supabase.from('meals').upsert({ user_id: userId, data: meals ?? [], updated_at: ts }),
      supabase.from('exercise').upsert({ user_id: userId, data: exercise ?? [], updated_at: ts }),
      supabase.from('vitals').upsert({ user_id: userId, data: vitals ?? [], updated_at: ts }),
      supabase.from('exams').upsert({ user_id: userId, data: exams ?? [], updated_at: ts }),
      supabase.from('sleep').upsert({ user_id: userId, data: sleep ?? [], updated_at: ts }),
    ]);

    const errors = results
      .map((r, i) => r.error ? `${tables[i]}: ${r.error.message}` : null)
      .filter(Boolean);

    if (errors.length) {
      console.error('[SYNC] Supabase errors:', errors.join(' | '));
      return res.status(500).json({ error: errors.join('; ') });
    }

    console.log('[SYNC] OK');
    res.json({ ok: true });
  } catch (err) {
    console.error('[SYNC] Exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/data — devuelve todos los datos del usuario
// ─────────────────────────────────────────────────────────────
app.get('/api/data', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

  console.log(`[LOAD] userId=${userId}`);
  try {
    const [prof, meds, mealsRow, exRow, vitRow, examsRow, sleepRow] = await Promise.all([
      supabase.from('profiles').select('data').eq('user_id', userId).maybeSingle(),
      supabase.from('medications').select('meds, doses').eq('user_id', userId).maybeSingle(),
      supabase.from('meals').select('data').eq('user_id', userId).maybeSingle(),
      supabase.from('exercise').select('data').eq('user_id', userId).maybeSingle(),
      supabase.from('vitals').select('data').eq('user_id', userId).maybeSingle(),
      supabase.from('exams').select('data').eq('user_id', userId).maybeSingle(),
      supabase.from('sleep').select('data').eq('user_id', userId).maybeSingle(),
    ]);

    const sbError = [prof, meds, mealsRow, exRow, vitRow, examsRow, sleepRow]
      .map(r => r.error?.message).filter(Boolean)[0];
    if (sbError) {
      console.error('[LOAD] Supabase error:', sbError);
      return res.status(500).json({ error: sbError });
    }

    console.log(`[LOAD] OK — vitals=${(vitRow.data?.data||[]).length} sleep=${(sleepRow.data?.data||[]).length}`);
    res.json({
      profile:     prof.data?.data      ?? {},
      medications: meds.data?.meds      ?? [],
      doses:       meds.data?.doses     ?? [],
      meals:       mealsRow.data?.data  ?? [],
      exercise:    exRow.data?.data     ?? [],
      vitals:      vitRow.data?.data    ?? [],
      exams:       examsRow.data?.data  ?? [],
      sleep:       sleepRow.data?.data  ?? [],
    });
  } catch (err) {
    console.error('[LOAD] Exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/chat — llama a Claude Sonnet con contexto del usuario
// Soporta modo single-turn (message+images) y multi-turn (messages[])
// ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { system, message, images, isPDF, pdfB64, messages, max_tokens } = req.body;

  let apiMessages;

  if (messages && Array.isArray(messages)) {
    // Multi-turn: usar el array de mensajes directamente
    apiMessages = messages;
  } else {
    // Single-turn: construir desde message + attachments
    if (!message) return res.status(400).json({ error: 'message requerido' });
    let content = [];
    if (isPDF && pdfB64) {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
        { type: 'text', text: message },
      ];
    } else if (images && images.length) {
      content = images.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mime, data: img.b64 },
      }));
      content.push({ type: 'text', text: message });
    } else {
      content = [{ type: 'text', text: message }];
    }
    apiMessages = [{ role: 'user', content }];
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: max_tokens || 3000,
      system: system || '',
      messages: apiMessages,
    });
    res.json({ text: response.content[0].text });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MUNDIMED backend corriendo en http://localhost:${PORT}`));
