# 📚 CU-MEDi Gastrointestinal System Course (GI 2026) Learning Hub

**Student**: Mr. Tunn Patong (ID: 12)  
**Track**: IMS (Theory & Written), BCC (Clinical & OSCE), Humanistic  
**Personalized Groups**: Shark Tank Group **A1** · 4G Lab Group **4** · 5G Group **1**  

---

## ☁️ Cloud Hosting & Google Sites Deployment Options

The entire course web application is designed to be **100% offline-first and static cloud-ready**. You can run it on your Mac, access it over Wi-Fi on iPhone/iPad, host it in the cloud, or embed it in Google Sites:

### Option 1: Google Sites (Easiest to Embed)
1. In your **Google Site**, click **Insert** > **Embed** (`< >`).
2. You can either:
   - **Embed by URL**: Host on GitHub Pages (Option 2 below) and paste your public URL (e.g. `https://your-username.github.io/gi-cumed/`).
   - **Embed Code directly**: Upload `GI_CUMEDi_Standalone_App.html` to Google Drive or paste the code into Google Sites' HTML embed box.
3. Resize the embed container to full width and height on your page.

### Option 2: GitHub Pages (Recommended — Automatic Daily Git Updates)
This repository is initialized and ready to push to GitHub:
```bash
# 1. Create a repository on GitHub (e.g. named "gi-cumed-2026")
# 2. Link your local repo to GitHub:
git remote add origin https://github.com/YOUR_USERNAME/gi-cumed-2026.git
git branch -M main
git push -u origin main

# 3. Enable GitHub Pages:
# Go to your repo Settings > Pages > Source: "Deploy from a branch" > Branch: "main" / Root > Save!
# Your app is live at: https://YOUR_USERNAME.github.io/gi-cumed-2026/
```

### Option 3: 1-Click Drag-and-Drop Cloud (Cloudflare Pages / Netlify)
- Simply drag and drop the folder (or upload `GI_CUMEDi_Standalone_App.html`) to **[Netlify Drop](https://app.netlify.com/drop)** or **Cloudflare Pages**.
- Gives you an instant SSL URL with global CDN in under 10 seconds.

---

## 📱 iPhone & iPad Pro Optimization (PWA Home Screen)

The web app is optimized for mobile touch:
- **Card Swipe**: On iPhone or iPad, swipe left on any flashcard for **🔴 Again**, or swipe right for **🔵 Good**.
- **Mobile Bottom Navigation**: Quick dock for Schedule, Anki, MCQs, Studio, Groups, and Dark/Light Mode.
- **Add to Home Screen (Full App Experience)**:
  1. Open the app URL in **Safari** on your iPhone or iPad.
  2. Tap the **Share** button (`⬆️`).
  3. Scroll down and tap **"Add to Home Screen"**.
  4. It launches in standalone fullscreen mode without browser URL bars!
- **Local Wi-Fi Real-Time Sync**:
  To sync live annotations, notes, and progress between Mac, iPhone, and iPad over local Wi-Fi:
  ```bash
  python3 automation/serve_mobile.py
  ```
  Scan the QR code or open the displayed LAN IP on your phone/tablet.

---

## 🤖 Daily Automated Updates Workflow

After any lecture, tutorial, or lab, update notes and pearls with one simple command:

```bash
# 1. List all 57 sessions and status
python3 automation/update_daily_notes.py --list

# 2. View any session by syllabus number or topic keyword
python3 automation/update_daily_notes.py --show 16
python3 automation/update_daily_notes.py --show "nausea"

# 3. Update pearls, notes, and slides (with automatic standalone rebuild + optional git push)
python3 automation/update_daily_notes.py --session 16 \
  --pearls "Area postrema lacks BBB | 5-HT3 antagonists block vagal afferents" \
  --notes "Dr. Varalee highlighted Boerhaave vs Mallory-Weiss distinction for IMS-III." \
  --slides "https://drive.google.com/your-lecture-slides-link" \
  --push
```
*Note: The script automatically resolves syllabus session numbers (e.g., `--session 16` automatically targets Syllabus Session 16 `session_17`), rebuilds `GI_CUMEDi_Standalone_App.html`, and can auto-commit/push to Git.*

---

## 📁 Workspace Architecture

| Directory / File | Description |
| :--- | :--- |
| **[`index.html`](index.html)** | **🌟 Master Web Application** — Interactive schedule, attendance tracker (`✓AC`), 223 Active Recall Flashcards (computer-clock Anki engine), 106 5-Option Board MCQs (IMS-III spec), and Histology Markup Studio. |
| **[`GI_CUMEDi_Standalone_App.html`](GI_CUMEDi_Standalone_App.html)** | **📦 100% Inlined Standalone HTML** — Embeds all curriculum data, notes, and photos in a single file for 1-click cloud hosting or offline AirDrop sharing. |
| **[`data/gi_daily_learning_data.js`](data/gi_daily_learning_data.js)** | Master curriculum database: 57 sessions, behavioral objectives, verified clinical case study guides, 223 flashcards, and 106 MCQs. |
| **[`data/user_sync_state.json`](data/user_sync_state.json)** | Persistent user progress state (checklist, Anki ratings/schedule, MCQ answers, notes, transcripts, photos). |
| **[`automation/update_daily_notes.py`](automation/update_daily_notes.py)** | CLI tool to update daily lecture notes, clinical pearls, and auto-sync with Git. |
| **[`automation/serve_mobile.py`](automation/serve_mobile.py)** | Local LAN server providing real-time 2-way Wi-Fi synchronization across Mac, iPhone, and iPad. |
| **[`automation/build_standalone.py`](automation/build_standalone.py)** | Bundle generator compiling `index.html` + `data/` into `GI_CUMEDi_Standalone_App.html`. |
| **[`Calendar/`](Calendar/)** | Apple Calendar / iCloud `.ics` import files with alarm notifications. |
| **[`Course_Guides_and_Policies/`](Course_Guides_and_Policies/)** | Faculty student guide, group rosters, and course policies. |

