# HistoLens AI — Universal Real-Time Histology Cursor Lens & Quiz Extension

A Manifest V3 Chrome Extension that runs on **any website** — including [Histology Guide (Chapter 14: Gastrointestinal Tract)](https://histologyguide.com/slidebox/14-gastrointestinal-tract.html), University of Michigan Virtual Microscopy, WebPath, and any web-based slide viewer.

## Features

1. **🔬 Real-Time Cursor-Following Lens ("What is my cursor covering?")**
   - Follows your mouse smoothly across any virtual microscope slide with a circular optical reticle and a **2.5× Magnifying Loupe**.
   - Samples the rendered viewport via `chrome.tabs.captureVisibleTab` (bypassing cross-origin `<canvas>` and tiled viewer restrictions on `histologyguide.com`).
   - Performs **0ms real-time H&E colorimetric & region sensing** as you move your cursor, and supports **Deep AI Point-Identification (`Shift + Click`)** powered by `gemini-3.8-flash` (with an instant built-in GI Histology Engine fallback when no API key is entered).

2. **🎯 Interactive Quiz Mode (2 Modes)**
   - **Spot & Click Target Hunt:** Prompts you to find a specific histological structure (e.g., *Submucosal Core of Plica Circularis*, *Crypts of Lieberkühn*, *Muscularis Mucosae*) and **click directly on it** with your cursor. Grades your spatial accuracy and reveals the target landmark.
   - **Mystery Pin (4-Choice Quiz):** Drops a pulsing `?` pin onto a structure on the slide and gives 4 multiple-choice options with exam spotting explanations.

3. **🗺️ Pin Map & Chrome Side Panel**
   - Displays clickable anatomical pins across the viewport and syncs with the Chrome Side Panel (`sidepanel.html`), which includes a high-yield **GI Tract Chapter 14 Spotting Cheat Sheet**.

---

## How to Load in Google Chrome (30 Seconds)

1. Open Google Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner).
3. Click **Load unpacked** (top-left button).
4. Select this folder:
   `/Users/tunnpatong/Desktop/GI CUMEDi/histo-ai-extension`
5. Open [https://histologyguide.com/slidebox/14-gastrointestinal-tract.html](https://histologyguide.com/slidebox/14-gastrointestinal-tract.html) (or click any slide like **MH 120 Ileum**).
6. Use the floating **HistoLens AI** dock in the bottom-right corner (or press `Alt + H` to toggle) to switch between **🔬 Cursor Lens**, **🎯 Quiz Mode**, and **🗺️ Pin Map**!
