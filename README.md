# PROPER v-SUALIZER v2

### // MASTERING AUDIO VISUALIZER — MULTI-FILE + AUDIOWORKLET + R128 APPROX

**LABEL //** [Proper Sequences](https://www.instagram.com/propersequences/)

`propermastering@gmail.com`

---

## Qué cambió en v2

- **Arquitectura multi-archivo** (HTML + CSS + JS modules + AudioWorklet)
- **AudioWorklet** para el análisis pesado (main thread solo render + UI)
- **LUFS** Momentary / Short-term / Integrated con K-weighting + gating absoluto
- **True Peak** (oversampling aproximado)
- **Mid/Side ratio** real
- **Mic input**
- **A/B** de buffers
- **Atajos de teclado** (Space, ←/→, 1-5, F, M, E, A)
- **Export PNG** del visualizer
- Estética brutalista industrial mantenida

> **Nota realista**: El R128 implementado es una aproximación sólida y usable (K-weighting + ventanas + gating). No es un medidor certificado de laboratorio. Para decisiones finales de mastering se recomienda contrastar con un medidor de referencia.

---

## Estructura

```
ps-visu/
├── ps-v.html                 ← entry point
├── css/main.css
├── js/
│   ├── main.js
│   ├── audio-engine.js
│   ├── meters.js
│   ├── visualizers.js
│   └── ui.js
├── worklet/
│   └── analysis-processor.js
└── README.md
```

## Cómo usar

1. Servir la carpeta con un servidor local (necesario por ES modules + Worklet):
   ```bash
   npx serve .
   # o python -m http.server
   ```
2. Abrir `ps-v.html`
3. Load archivos o usar MIC

### Atajos

| Tecla | Acción          |
|-------|-----------------|
| Space | Play / Pause    |
| ← / → | Prev / Next     |
| 1-5   | Cambiar vista   |
| F     | Fullscreen      |
| M     | Mute toggle     |
| E     | Export PNG      |
| A     | Switch A/B      |

---

## Deployment

Cero dependencias externas. Solo browser moderno con soporte de AudioWorklet y ES modules.

---

**v1** (single-file) se mantiene en el historial / backup.  
**v2** es la rama de trabajo actual.
