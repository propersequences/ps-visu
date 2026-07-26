# Changelog

All notable changes to **ProperS | Audio Visualizer** are documented here.  
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [XO.3BAND] — 2026-07-26

Single-file build focused on mastering diagnostics: 3-band crossover listening, phase tension on the low end, per-band correlation, and a stable audio graph.

### 🇬🇧 English

#### Added
- **3-band crossover engine** (Web Audio API)
  - Low: lowpass @ 150 Hz
  - Mid: bandpass @ 1.5 kHz
  - High: highpass @ 3 kHz
  - Each band has its own GainNode + L/R Analysers
- **Listening modes** — Bypass / Low / Mid / High  
  Instant solo of any band via `setTargetAtTime` (no clicks)
- **Low-end phase tension** — real-time waveform of the Low band (visual phase/energy reading of the sub)
- **Per-band correlation** — Pearson L/R correlation for Low, Mid and High (−1 … +1)
- **JSON session export** — `maxPeak` (dBFS), approximate integrated LUFS, clipping flag
- **Host Grotesk Light 300** as primary UI typeface
- Recovered full feature set: logo, footer, Spectrum / EQ Bars / Radial / Waterfall / Waveform, Mono (audible), Bass Mono UI + red goniometer, crest, clip count, centroid, phase & width bars

#### Fixed
- **Mono volume doubling** — permanent audio graph; mono averages L+R at 0.5 and re-upmixes without stacking paths to destination
- **UI freeze after last track** — clean `onended` handling, state reset, play button returns to EXECUTE
- **Node leak on every play** — crossover + analysers built once (`ensureGraph`); only the BufferSource is reconnected
- Seek / pause / resume no longer leave the graph in an inconsistent state

#### Technical notes
- Zero dependencies, single HTML file
- Mono path: ChannelSplitter → 0.5+0.5 sum → ChannelMerger stereo upmix → masterGain → bus
- Crossover runs in parallel with the dry bus; listening modes only change gain values
- Export is a plain downloadable `.json` blob from the browser

---

### 🇪🇸 Español

#### Añadido
- **Motor de crossover de 3 bandas** (Web Audio API)
  - Low: lowpass @ 150 Hz
  - Mid: bandpass @ 1.5 kHz
  - High: highpass @ 3 kHz
  - Cada banda con su GainNode + Analysers L/R
- **Modos de escucha** — Bypass / Low / Mid / High  
  Solo instantáneo de cualquier banda con `setTargetAtTime` (sin clicks)
- **Tensión de fase del low-end** — waveform en tiempo real de la banda Low (lectura visual de fase/energía del sub)
- **Correlación por banda** — Pearson L/R para Low, Mid y High (−1 … +1)
- **Exportación JSON de sesión** — `maxPeak` (dBFS), LUFS integrado aproximado, flag de clipping
- **Host Grotesk Light 300** como tipografía principal de la UI
- Set completo recuperado: logo, footer, Spectrum / EQ Bars / Radial / Waterfall / Waveform, Mono (audible), Bass Mono UI + goniometer en rojo, crest, clip count, centroid, barras de phase y width

#### Corregido
- **Mono duplicaba el volumen** — grafo permanente; mono promedia L+R a 0.5 y re-upmixa sin apilar rutas al destination
- **UI muerta al terminar el último tema** — `onended` limpio, reset de estado, botón vuelve a EXECUTE
- **Fuga de nodos en cada play** — crossover + analysers se construyen una sola vez (`ensureGraph`); solo se reconecta el BufferSource
- Seek / pause / resume ya no dejan el grafo inconsistente

#### Notas técnicas
- Cero dependencias, un solo archivo HTML
- Ruta mono: ChannelSplitter → suma 0.5+0.5 → ChannelMerger stereo → masterGain → bus
- El crossover corre en paralelo al bus dry; los modos solo cambian gains
- El export es un `.json` descargable desde el navegador

---

### 🇳🇱 Nederlands

#### Toegevoegd
- **3-bands crossover-motor** (Web Audio API)
  - Low: lowpass @ 150 Hz
  - Mid: bandpass @ 1.5 kHz
  - High: highpass @ 3 kHz
  - Elke band met eigen GainNode + L/R Analysers
- **Luistermodi** — Bypass / Low / Mid / High  
  Direct solo van elke band via `setTargetAtTime` (geen clicks)
- **Low-end phase tension** — real-time waveform van de Low-band (visuele fase-/energielezing van de sub)
- **Correlatie per band** — Pearson L/R voor Low, Mid en High (−1 … +1)
- **JSON-sessie-export** — `maxPeak` (dBFS), benaderde geïntegreerde LUFS, clipping-flag
- **Host Grotesk Light 300** als primaire UI-lettertype
- Volledige feature-set hersteld: logo, footer, Spectrum / EQ Bars / Radial / Waterfall / Waveform, Mono (hoorbaar), Bass Mono UI + rode goniometer, crest, clip count, centroid, phase- & width-balken

#### Opgelost
- **Mono verdubbelde het volume** — permanente audiograaf; mono midelt L+R op 0.5 en upmixt opnieuw zonder paden naar destination te stapelen
- **UI bevroor na laatste track** — schone `onended`, state-reset, knop terug naar EXECUTE
- **Node-lek bij elke play** — crossover + analysers één keer gebouwd (`ensureGraph`); alleen BufferSource wordt herverbonden
- Seek / pause / resume laten de graaf niet meer inconsistent achter

#### Technische notities
- Geen afhankelijkheden, enkel HTML-bestand
- Mono-pad: ChannelSplitter → 0.5+0.5 som → ChannelMerger stereo → masterGain → bus
- Crossover parallel aan dry bus; luistermodi wijzigen alleen gains
- Export is een downloadbare `.json` vanuit de browser

---

### 🇫🇷 Français

#### Ajouté
- **Moteur de crossover 3 bandes** (Web Audio API)
  - Low : lowpass @ 150 Hz
  - Mid : bandpass @ 1,5 kHz
  - High : highpass @ 3 kHz
  - Chaque bande avec son GainNode + Analysers L/R
- **Modes d'écoute** — Bypass / Low / Mid / High  
  Solo instantané de n'importe quelle bande via `setTargetAtTime` (sans clics)
- **Tension de phase du low-end** — waveform en temps réel de la bande Low (lecture visuelle phase/énergie du sub)
- **Corrélation par bande** — Pearson L/R pour Low, Mid et High (−1 … +1)
- **Export JSON de session** — `maxPeak` (dBFS), LUFS intégré approximatif, flag de clipping
- **Host Grotesk Light 300** comme typographie principale de l'UI
- Ensemble complet restauré : logo, footer, Spectrum / EQ Bars / Radial / Waterfall / Waveform, Mono (audible), Bass Mono UI + goniomètre rouge, crest, clip count, centroid, barres phase & width

#### Corrigé
- **Le Mono doublait le volume** — graphe audio permanent ; mono moyenne L+R à 0,5 et re-upmix sans empiler de chemins vers destination
- **UI bloquée après le dernier titre** — `onended` propre, reset d'état, bouton revient à EXECUTE
- **Fuite de nœuds à chaque play** — crossover + analysers construits une seule fois (`ensureGraph`) ; seul le BufferSource est reconnecté
- Seek / pause / resume ne laissent plus le graphe incohérent

#### Notes techniques
- Zéro dépendance, un seul fichier HTML
- Chemin mono : ChannelSplitter → somme 0,5+0,5 → ChannelMerger stéréo → masterGain → bus
- Le crossover tourne en parallèle du bus dry ; les modes ne changent que les gains
- L'export est un `.json` téléchargeable depuis le navigateur

---

### 🇩🇪 Deutsch

#### Hinzugefügt
- **3-Band-Crossover-Engine** (Web Audio API)
  - Low: Lowpass @ 150 Hz
  - Mid: Bandpass @ 1,5 kHz
  - High: Highpass @ 3 kHz
  - Jedes Band mit eigenem GainNode + L/R-Analysers
- **Hörmodi** — Bypass / Low / Mid / High  
  Sofortiges Solo jedes Bands über `setTargetAtTime` (ohne Klicks)
- **Low-End Phase Tension** — Echtzeit-Wellenform des Low-Bands (visuelle Phasen-/Energieablesung des Subs)
- **Korrelation pro Band** — Pearson L/R für Low, Mid und High (−1 … +1)
- **JSON-Session-Export** — `maxPeak` (dBFS), angenähertes integriertes LUFS, Clipping-Flag
- **Host Grotesk Light 300** als primäre UI-Schrift
- Vollständiger Feature-Satz wiederhergestellt: Logo, Footer, Spectrum / EQ Bars / Radial / Waterfall / Waveform, Mono (hörbar), Bass Mono UI + roter Goniometer, Crest, Clip Count, Centroid, Phase- & Width-Balken

#### Behoben
- **Mono verdoppelte die Lautstärke** — permanenter Audio-Graph; Mono mittelt L+R bei 0,5 und upmixt neu, ohne Pfade zum Destination zu stapeln
- **UI einfroren nach dem letzten Track** — sauberes `onended`, State-Reset, Button zurück auf EXECUTE
- **Node-Leak bei jedem Play** — Crossover + Analysers einmal gebaut (`ensureGraph`); nur BufferSource wird neu verbunden
- Seek / Pause / Resume hinterlassen den Graphen nicht mehr inkonsistent

#### Technische Hinweise
- Keine Abhängigkeiten, einzelne HTML-Datei
- Mono-Pfad: ChannelSplitter → 0,5+0,5 Summe → ChannelMerger Stereo → masterGain → Bus
- Crossover läuft parallel zum Dry-Bus; Hörmodi ändern nur Gains
- Export ist eine herunterladbare `.json` aus dem Browser
