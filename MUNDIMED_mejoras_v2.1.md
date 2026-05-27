# MUNDIMED v2.1 - Especificaciones de mejoras

## 1. FIX URGENTE - UNDEFINED EN AGENTE
En `buildAgentSystem()` en index.html, corrige la lectura de vitales.
Los vitales vienen de Supabase como `vitalsRow.data` = array de objetos
con campos `bp_sys`, `bp_dia`, `glucose`, `weight`, `pulse` como strings.
El mensaje de bienvenida debe mostrar la presión real del último vital.

---

## 2. SIGNOS VITALES - AGREGAR PULSACIONES
- Agrega campo **"Pulso (lpm)"** en el formulario de registro de vitales
- Mostrar pulso junto a presión y glucosa en la visualización
- Rangos de alerta: normal 60-100 lpm, bajo <60, alto >100
- Actualizar informes de especialistas para incluir pulso
- El cardiólogo debe ver evolución del pulso en sus gráficos Chart.js

---

## 3. REGISTRO DE SUEÑO - NUEVA PESTAÑA 🌙

### Tabla Supabase (generar SQL para ejecutar en SQL Editor)
```sql
CREATE TABLE IF NOT EXISTS sleep (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Formulario de registro diario
- Fecha
- Hora inicio / Hora fin del sueño
- Sueño total (horas y minutos)
- Sueño profundo (horas y minutos)
- Sueño ligero (horas y minutos)
- Interrupciones/despertares (número)
- Calidad subjetiva (1-5 estrellas)
- Notas (campo libre, ej: "apnea fuerte", "me levanté 3 veces")

### Visualización
- Resumen del día con comparación vs objetivos:
  - Sueño total recomendado: 7-8 horas
  - Sueño profundo recomendado: 1.5-2 horas
- Gráfico Chart.js: barras apiladas últimos 7 días
  (sueño profundo + ligero + despierto)
- Alerta si sueño total < 6h o sueño profundo < 1h

### Estructura JSON por registro
```json
{
  "id": "uid",
  "date": "2026-05-26",
  "start_time": "23:00",
  "end_time": "06:30",
  "total_minutes": 450,
  "deep_minutes": 90,
  "light_minutes": 280,
  "interruptions": 3,
  "quality": 3,
  "notes": "apnea fuerte"
}
```

---

## 4. COMIDAS CON FOTO 📷

En el formulario de registro de comida agregar opción **"Analizar foto"**:
1. Botón que abre selector de imagen (galería o cámara)
2. Muestra preview de la imagen seleccionada
3. Envía imagen a Claude Vision via `/api/chat` con este prompt:

```
Analiza esta comida y devuelve SOLO JSON válido sin texto extra:
{
  "description": "descripción breve",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "fiber": 0,
  "sodium": 0,
  "potassium": 0,
  "phosphorus": 0,
  "cholesterol": 0,
  "saturatedFat": 0
}
Considera: paciente con insuficiencia renal moderada,
límites: sodio 1200mg, potasio 2500mg, fósforo 800mg/día.
```

4. Pre-rellena automáticamente todos los campos nutricionales
5. Usuario puede editar valores antes de guardar

---

## 5. ENTRADA DE VOZ PARA COMIDAS 🎤

En el formulario de comida agregar botón de micrófono:
- Usar **Web Speech API** nativa del browser (sin costo, sin API externa)
- Mantener presionado para grabar, soltar para transcribir
- Texto transcrito va al campo descripción
- Dispara automáticamente el análisis nutricional con IA
- Fallback: si el browser no soporta Web Speech API, mostrar mensaje

---

## 6. ACTUALIZAR SYSTEM PROMPT DEL AGENTE

En `buildAgentSystem()` incluir datos de sueño:

```
SUEÑO ÚLTIMAS 2 SEMANAS:
- Promedio sueño total: X horas
- Promedio sueño profundo: X horas
- Noches con menos de 6h: X de 14
- Condición conocida: Apnea del sueño diagnosticada

NOTA CLÍNICA: La apnea del sueño del paciente está relacionada
con hipertensión, resistencia a insulina y fatiga. Considerar
esto al dar recomendaciones de ejercicio, alimentación y horarios.
```

---

## NOTAS TÉCNICAS
- Guardar sleep en Supabase igual que vitals (upsert por user_id)
- Web Speech API: usar `window.SpeechRecognition || window.webkitSpeechRecognition`
- Análisis de foto: el backend ya acepta imágenes en base64 via `/api/chat`
- Mantener el estilo visual existente (colores, cards, nav)
- Mostrar SQL de nueva tabla para que usuario lo ejecute en Supabase

