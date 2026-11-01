// HistoLens AI - Manifest V3 Background Service Worker (Exam-Aligned GI Tract Edition)
// Uses exact Histology Guide Chapter 14 & CUMEDi GI Histology Exam Taxonomy

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const existing = await chrome.storage.local.get(['geminiModel', 'lensEnabled', 'quizScore', 'quizStreak']);
  if (!existing.geminiModel) {
    await chrome.storage.local.set({
      geminiModel: 'gemini-3.8-flash',
      lensEnabled: true,
      quizScore: 0,
      quizStreak: 0
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-lens') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_HUD' });
      } catch (err) {
        console.warn('Could not message tab:', err);
      }
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    const winId = sender.tab?.windowId;
    if (winId) {
      chrome.sidePanel.open({ windowId: winId }).catch((e) => console.warn(e));
    }
    sendResponse({ ok: true });
    return false;
  }

  (async () => {
    try {
      if (message.type === 'CAPTURE_VIEWPORT') {
        const winId = sender.tab?.windowId ?? null;
        const dataUrl = await chrome.tabs.captureVisibleTab(winId, {
          format: 'jpeg',
          quality: 85
        });
        sendResponse({ ok: true, dataUrl });
        return;
      }

      if (message.type === 'ANALYZE_CURSOR_POINT') {
        const result = await analyzeCursorPoint(message.payload);
        await chrome.storage.session.set({ lastCursorInspection: result });
        chrome.runtime.sendMessage({ type: 'CURSOR_INSPECTION_UPDATED', data: result }).catch(() => {});
        sendResponse({ ok: true, data: result });
        return;
      }

      if (message.type === 'SCAN_FULL_VIEWPORT') {
        const result = await scanFullViewport(message.payload);
        await chrome.storage.session.set({ lastViewportScan: result });
        chrome.runtime.sendMessage({ type: 'VIEWPORT_SCAN_UPDATED', data: result }).catch(() => {});
        sendResponse({ ok: true, data: result });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      console.error('Service worker error:', err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();

  return true;
});

function extractInteractionsText(json) {
  if (typeof json?.output_text === 'string' && json.output_text.trim()) {
    return json.output_text;
  }
  if (Array.isArray(json?.steps)) {
    const modelOutputs = json.steps.filter((s) => s.type === 'model_output');
    if (modelOutputs.length > 0) {
      const last = modelOutputs[modelOutputs.length - 1];
      if (Array.isArray(last.content)) {
        return last.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('');
      }
    }
  }
  return '';
}

async function analyzeCursorPoint(payload) {
  const { patchBase64, fullBase64, normX, normY, stainProfile, pageContext } = payload;
  const { geminiApiKey, geminiModel = 'gemini-3.8-flash' } = await chrome.storage.local.get([
    'geminiApiKey',
    'geminiModel'
  ]);

  if (geminiApiKey && geminiApiKey.trim()) {
    try {
      const cleanPatch = (patchBase64 || fullBase64 || '').replace(/^data:image\/\w+;base64,/, '');
      const schema = {
        type: 'object',
        properties: {
          layerTunic: {
            type: 'string',
            description: 'One of the 4 main GI wall layers: 1. Mucosa, 2. Submucosa, 3. Muscularis Externa, or 4. Adventitia / Serosa.'
          },
          structureName: {
            type: 'string',
            description: 'Exact exam sub-layer or structure (e.g., Stratified Squamous Non-Keratinized Epithelium, Lamina Propria, Muscularis Mucosae, Submucosal Mucus Glands, Gland Ducts, Inner Circular Muscle Layer, Outer Longitudinal Muscle Layer, Adventitia, Intestinal Villi, Crypts of Lieberkühn).'
          },
          epitheliumOrTissueType: {
            type: 'string',
            description: 'Exact tissue/epithelium classification tested on exams (e.g., Simple columnar epithelium, Simple/stratified cuboidal epithelium, Dense irregular connective tissue, Smooth muscle, Loose connective tissue).'
          },
          startStopBoundary: {
            type: 'string',
            description: 'Clear 1-sentence description of where this layer/cell starts and where it stops visually.'
          },
          explanation: {
            type: 'string',
            description: 'Concise exam-focused explanation matching Histology Guide Chapter 14.'
          },
          examTip: {
            type: 'string',
            description: 'High-yield practical spotting rule.'
          }
        },
        required: ['layerTunic', 'structureName', 'epitheliumOrTissueType', 'startStopBoundary', 'explanation', 'examTip']
      };

      const promptText = `You are a medical histology exam grader using the Histology Guide Chapter 14 (GI Tract) rubric.
Page context: Title="${pageContext?.title || ''}", URL="${pageContext?.url || ''}", Sidebar text="${pageContext?.slideText || ''}".
Cursor normalized position: X=${(normX * 100).toFixed(1)}%, Y=${(normY * 100).toFixed(1)}%.
Use the exact 4-layer GI tract exam terminology:
- Mucosa: Epithelium (e.g., Stratified Squamous Non-Keratinized in esophagus; Simple Columnar in stomach/intestine), Lamina Propria (thin layer of connective tissue), Muscularis Mucosae (smooth muscle)
- Submucosa: Dense irregular connective tissue, Mucus Glands (simple columnar epithelium), Ducts (simple cuboidal, simple columnar, stratified cuboidal epithelia)
- Muscularis Externa: Inner Layer (circular muscle), Outer Layer (longitudinal muscle), smooth vs skeletal muscle ratio
- Adventitia or Serosa
Identify the exact structure at the center crosshair and explain where it starts and stops.`;

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiApiKey.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: geminiModel,
          input: [
            { type: 'text', text: promptText },
            { type: 'image', data: cleanPatch, mime_type: 'image/jpeg' }
          ],
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema
          }
        })
      });

      if (response.ok) {
        const resJson = await response.json();
        const rawText = extractInteractionsText(resJson);
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return { ...parsed, source: `Gemini (${geminiModel})`, normX, normY };
        }
      }
    } catch (apiErr) {
      console.warn('Gemini API cursor call fallback:', apiErr);
    }
  }

  return buildExamAlignedIdentification(normX, normY, stainProfile, pageContext);
}

async function scanFullViewport(payload) {
  const { pageContext } = payload;
  return buildExamViewportRegions(pageContext);
}

function detectSlideType(pageContext) {
  const text = `${pageContext?.title || ''} ${pageContext?.url || ''} ${pageContext?.slideText || ''}`.toLowerCase();
  if (text.includes('esophagus') || text.includes('mhs 234') || text.includes('mhs-234') || text.includes('mh 109') || text.includes('mh-109') || text.includes('stratified squamous')) {
    return 'esophagus';
  }
  if (text.includes('stomach') || text.includes('fundic') || text.includes('pyloric') || text.includes('cardiac') || text.includes('mh 111') || text.includes('mh 112') || text.includes('mh 113') || text.includes('mh 115')) {
    return 'stomach';
  }
  if (text.includes('colon') || text.includes('large intestine') || text.includes('appendix') || text.includes('mh 126') || text.includes('mh 125')) {
    return 'colon';
  }
  return 'small_intestine';
}

function buildExamAlignedIdentification(normX, normY, stain, pageContext) {
  const slideType = detectSlideType(pageContext);
  const regions = buildExamViewportRegions(pageContext).regions;
  const pctX = normX * 100;
  const pctY = normY * 100;

  let closest = regions[0];
  let bestDist = Infinity;
  for (const r of regions) {
    const d = Math.hypot(pctX - r.x, pctY - r.y);
    if (d < bestDist) {
      bestDist = d;
      closest = r;
    }
  }

  return {
    layerTunic: closest.layer,
    structureName: closest.name,
    epitheliumOrTissueType: closest.tissueType,
    startStopBoundary: closest.startStop,
    explanation: closest.description,
    examTip: closest.examTip,
    source: `Exam Rubric (${slideType.toUpperCase()})`,
    normX,
    normY
  };
}

function buildExamViewportRegions(pageContext) {
  const slideType = detectSlideType(pageContext);

  if (slideType === 'esophagus') {
    return {
      slideTitle: 'Esophagus (MHS 234 Lower 1/3 & MH 109)',
      summary: 'Four-layer GI wall featuring Stratified Squamous Non-Keratinized Epithelium, Submucosal Mucus Glands & Ducts, Muscularis Externa (Inner Circular + Outer Longitudinal), and Adventitia.',
      source: 'Histology Guide Ch. 14 Exam Syllabus',
      regions: [
        {
          id: 'esoph_epithelium',
          name: 'Stratified Squamous Non-Keratinized Epithelium',
          layer: '1. Mucosa (Mucous Membrane)',
          tissueType: 'Stratified Squamous Non-Keratinized Epithelium',
          x: 48,
          y: 16,
          radius: 14,
          startStop: 'STARTS at the white luminal surface (top) and STOPS at the wavy dark-purple basal cell layer / basement membrane.',
          description: 'Thick multi-layered squamous epithelium protecting against bolus abrasion. Nuclei remain visible up to the superficial layers (non-keratinized).',
          examTip: 'Look for tall connective tissue dermal papillae indenting the bottom of this purple epithelial band.',
          quizPrompt: 'Click on the Stratified Squamous Non-Keratinized Epithelium of the Mucosa.'
        },
        {
          id: 'esoph_lamina_propria',
          name: 'Lamina Propria',
          layer: '1. Mucosa (Mucous Membrane)',
          tissueType: 'Thin Layer of Loose Connective Tissue',
          x: 42,
          y: 23,
          radius: 9,
          startStop: 'STARTS directly underneath the basal layer of the stratified squamous epithelium and STOPS at the smooth muscle bundles of the muscularis mucosae.',
          description: 'Thin layer of loose connective tissue sending finger-like dermal papillae upward into the epithelium and housing small blood vessels and lymphocytes.',
          examTip: 'Directly under the purple epithelium; much thinner and looser than the submucosa.',
          quizPrompt: 'Click on the Lamina Propria (thin layer of connective tissue directly beneath the epithelium).'
        },
        {
          id: 'esoph_muscularis_mucosae',
          name: 'Muscularis Mucosae',
          layer: '1. Mucosa (Deepest Layer)',
          tissueType: 'Smooth Muscle',
          x: 36,
          y: 27,
          radius: 8,
          startStop: 'STARTS below the lamina propria and STOPS at the dense irregular connective tissue of the submucosa (just above the mucus glands).',
          description: 'Thin longitudinal band of smooth muscle marking the exact boundary between the Mucosa above and Submucosa below.',
          examTip: 'Functions for local mucosal motility; always smooth muscle even in the upper esophagus.',
          quizPrompt: 'Click on the Muscularis Mucosae (smooth muscle layer at the base of the mucosa).'
        },
        {
          id: 'esoph_mucus_glands',
          name: 'Submucosal Mucus Glands (Esophageal Glands Proper)',
          layer: '2. Submucosa',
          tissueType: 'Simple Columnar Epithelium (Mucus-Secreting Acini)',
          x: 57,
          y: 30,
          radius: 10,
          startStop: 'Each gland lobule STARTS and STOPS within the pink submucosa as a discrete cluster of pale, foamy mucous acini with flattened basal nuclei.',
          description: 'Tubulo-acinar mucus glands embedded in the dense irregular connective tissue of the submucosa. Lined by simple columnar mucus-secreting epithelium to lubricate the lumen.',
          examTip: 'ONLY the Esophagus and Duodenum have glands inside the Submucosa!',
          quizPrompt: 'Click on the Mucus Glands (simple columnar epithelium) located inside the Submucosa.'
        },
        {
          id: 'esoph_ducts',
          name: 'Submucosal Gland Ducts',
          layer: '2. Submucosa',
          tissueType: 'Simple Cuboidal, Simple Columnar & Stratified Cuboidal Epithelia',
          x: 48,
          y: 31,
          radius: 8,
          startStop: 'STARTS at the mucus gland acini and forms a distinct dark-rimmed ring around a clear lumen, STOPPING where it pierces the mucosa.',
          description: 'Excretory ducts carrying mucus from the submucosal glands to the esophageal lumen. Lined by simple cuboidal, simple columnar, or stratified cuboidal epithelium.',
          examTip: 'Spot it as a sharp ring of cuboidal cells surrounding an open white lumen right next to the foamy mucus glands.',
          quizPrompt: 'Click on a Submucosal Gland Duct (lined by simple cuboidal, simple columnar, or stratified cuboidal epithelium).'
        },
        {
          id: 'esoph_submucosa_ct',
          name: 'Submucosa (Connective Tissue)',
          layer: '2. Submucosa',
          tissueType: 'Dense Irregular Connective Tissue',
          x: 38,
          y: 34,
          radius: 10,
          startStop: 'STARTS below the muscularis mucosae and STOPS at the top edge of the thick muscularis externa.',
          description: 'Broad layer of dense irregular connective tissue with coarse pink collagen fibers, larger blood vessels, and submucosal mucus glands.',
          examTip: 'Houses Meissner’s submucosal plexus and esophageal mucus glands.',
          quizPrompt: 'Click on the Dense Irregular Connective Tissue of the Submucosa.'
        },
        {
          id: 'esoph_inner_circular',
          name: 'Muscularis Externa — Inner Circular Layer',
          layer: '3. Muscularis Externa',
          tissueType: 'Mostly Smooth Muscle (Final 1/3 of Esophagus)',
          x: 48,
          y: 44,
          radius: 12,
          startStop: 'STARTS immediately beneath the submucosa (Y ~38%) and STOPS at the thin connective tissue septum / Auerbach’s plexus (Y ~53%).',
          description: 'Inner circular layer of muscle cells. Because this specimen contains mostly smooth muscle with very few skeletal muscle fibers, it comes from the final (lower) third of the esophagus.',
          examTip: 'Upper 1/3 = skeletal; Middle 1/3 = mixed; Final 1/3 = mostly smooth muscle!',
          quizPrompt: 'Click on the Inner Circular Layer of the Muscularis Externa.'
        },
        {
          id: 'esoph_outer_longitudinal',
          name: 'Muscularis Externa — Outer Longitudinal Layer',
          layer: '3. Muscularis Externa',
          tissueType: 'Mostly Smooth Muscle (Cut in Cross-Section Bundles)',
          x: 45,
          y: 63,
          radius: 14,
          startStop: 'STARTS below the inner circular layer / myenteric plexus (Y ~53%) and STOPS at the pale loose connective tissue of the adventitia (Y ~75%).',
          description: 'Outer longitudinal layer of muscle cells arranged in large fascicles separated by connective tissue septa. Auerbach’s (myenteric) plexus sits between the inner and outer layers.',
          examTip: 'Notice how the fibers are cut across their bundles, contrasting with the horizontal ribbons of the inner circular layer above it.',
          quizPrompt: 'Click on the Outer Longitudinal Layer of the Muscularis Externa.'
        },
        {
          id: 'esoph_adventitia',
          name: 'Adventitia',
          layer: '4. Adventitia (Outermost Layer)',
          tissueType: 'Loose Connective Tissue (No Mesothelium)',
          x: 46,
          y: 84,
          radius: 11,
          startStop: 'STARTS below the outer longitudinal muscle layer (Y ~75%) and extends to the outermost bottom margin of the specimen.',
          description: 'Outermost coat of loose connective tissue containing blood vessels, nerves, and adipose tissue that anchors the esophagus to surrounding mediastinal structures.',
          examTip: 'The thoracic esophagus is covered by Adventitia (loose CT only), whereas intraperitoneal GI organs are covered by Serosa (CT + simple squamous mesothelium).',
          quizPrompt: 'Click on the Adventitia at the bottom outer edge of the esophageal wall.'
        }
      ]
    };
  }

  // Default: Small Intestine (Ileum MH 120 / Duodenum / Jejunum) using exact 4-layer exam format
  return {
    slideTitle: 'Small Intestine: Ileum (MH 120)',
    summary: 'Four-layer GI wall showing Plica Circularis (Submucosal core), Mucosa (Villi with Simple Columnar Epithelium + Goblet cells, Lamina Propria, Crypts of Lieberkühn, Muscularis Mucosae), Submucosa, and Muscularis Externa.',
    source: 'Histology Guide Ch. 14 Exam Syllabus',
    regions: [
      {
        id: 'plica_core',
        name: 'Submucosa (Core of Plica Circularis)',
        layer: '2. Submucosa',
        tissueType: 'Dense Irregular Connective Tissue',
        x: 29,
        y: 48,
        radius: 11,
        startStop: 'STARTS at the horizontal submucosal base and extends vertically up the center of the fold, STOPPING at the muscularis mucosae on either flank.',
        description: 'Dense irregular connective tissue core inside the permanent circular fold (plica circularis / valve of Kerckring), carrying blood vessels and lymphatics.',
        examTip: 'Plica circularis = Mucosa + Submucosa core. Villus = Mucosa only (Lamina propria core).',
        quizPrompt: 'Click on the Submucosa (dense irregular connective tissue core of the plica circularis).'
      },
      {
        id: 'villi_epithelium',
        name: 'Mucosa — Simple Columnar Epithelium (Villi)',
        layer: '1. Mucosa (Mucous Membrane)',
        tissueType: 'Simple Columnar Epithelium (Enterocytes + Goblet Cells)',
        x: 80,
        y: 62,
        radius: 13,
        startStop: 'STARTS at the apical microvilli brush border facing the lumen and STOPS at the basement membrane bordering the lamina propria core.',
        description: 'Surface lining of finger-like villi composed of tall absorptive enterocytes (with brush border) and numerous mucus-secreting goblet cells.',
        examTip: 'Shorter villi + abundant clear goblet cells + Peyer’s patches = Ileum.',
        quizPrompt: 'Click on the Simple Columnar Epithelium (with Goblet cells) covering the Intestinal Villi.'
      },
      {
        id: 'lamina_propria_villus',
        name: 'Mucosa — Lamina Propria (Villus Core & Central Lacteal)',
        layer: '1. Mucosa (Mucous Membrane)',
        tissueType: 'Loose Connective Tissue (with Central Lacteal)',
        x: 85,
        y: 68,
        radius: 9,
        startStop: 'Occupies the central core inside each villus and the space between crypts, STOPPING at the muscularis mucosae below.',
        description: 'Loose areolar connective tissue inside the core of each villus and surrounding the intestinal glands. Contains capillaries, lymphocytes, plasma cells, and a central lymphatic lacteal.',
        examTip: 'Exam Trap: Lamina propria forms the core of VILLI (not microvilli!).',
        quizPrompt: 'Click on the Lamina Propria (loose connective tissue core inside the villi).'
      },
      {
        id: 'crypts_glands',
        name: 'Mucosa — Crypts of Lieberkühn (Intestinal Glands)',
        layer: '1. Mucosa (Mucous Membrane)',
        tissueType: 'Simple Tubular Glands (Enterocytes, Goblet, Paneth, Stem & Endocrine Cells)',
        x: 68,
        y: 82,
        radius: 10,
        startStop: 'STARTS at the base between adjacent villi and invaginates downward, STOPPING right at the muscularis mucosae.',
        description: 'Simple tubular intestinal glands surrounded by lamina propria. Base contains Paneth cells (bright eosinophilic apical AMP granules) and intestinal stem cells (ISCs).',
        examTip: 'Paneth cells sit at the base of the crypts and secrete antimicrobial proteins (AMPs) into the mucus blanket.',
        quizPrompt: 'Click on the Crypts of Lieberkühn (intestinal glands) at the base of the mucosa.'
      },
      {
        id: 'muscularis_mucosae_ileum',
        name: 'Mucosa — Muscularis Mucosae',
        layer: '1. Mucosa (Deepest Layer)',
        tissueType: 'Smooth Muscle',
        x: 60,
        y: 88,
        radius: 8,
        startStop: 'Thin pink horizontal band that STARTS directly beneath the base of the crypts and STOPS at the loose/dense collagen of the submucosa.',
        description: 'Thin ribbon of smooth muscle separating the lamina propria and crypts of the mucosa from the underlying submucosa. Functions for local mucosal motility.',
        examTip: 'Contracts for mucosal motility (whereas muscularis externa contracts to reduce the lumen / drive peristalsis).',
        quizPrompt: 'Click on the Muscularis Mucosae (smooth muscle layer at the base of the mucosa).'
      },
      {
        id: 'submucosa_base',
        name: 'Submucosa & Blood Vessels',
        layer: '2. Submucosa',
        tissueType: 'Dense Irregular Connective Tissue',
        x: 31,
        y: 88,
        radius: 9,
        startStop: 'STARTS beneath the muscularis mucosae and STOPS at the top edge of the thick inner circular layer of muscularis externa.',
        description: 'Dense irregular connective tissue housing large arterioles, venules, lymphatics, and Meissner’s submucosal nerve plexus.',
        examTip: 'Unlike Esophagus and Duodenum, the Jejunum and Ileum have NO submucosal mucus glands.',
        quizPrompt: 'Click on the Submucosa (dense irregular connective tissue with blood vessels) at the base of the fold.'
      },
      {
        id: 'muscularis_externa_ileum',
        name: 'Muscularis Externa — Inner Circular Layer',
        layer: '3. Muscularis Externa',
        tissueType: 'Smooth Muscle (Inner Circular Layer)',
        x: 52,
        y: 96,
        radius: 12,
        startStop: 'STARTS below the submucosa (Y ~91%) and forms the thick continuous smooth muscle band along the bottom edge.',
        description: 'Inner circular layer of smooth muscle cells responsible for segmentation and peristaltic movement of intestinal contents.',
        examTip: 'Auerbach’s (myenteric) plexus lies between this inner circular layer and the outer longitudinal layer.',
        quizPrompt: 'Click on the Inner Circular Layer of the Muscularis Externa at the bottom of the slide.'
      }
    ]
  };
}
