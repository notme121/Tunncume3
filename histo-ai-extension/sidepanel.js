// HistoLens AI - Side Panel Controller

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('sp-api-key');
  const modelSelect = document.getElementById('sp-model');
  const saveBtn = document.getElementById('sp-save-settings');
  const saveStatus = document.getElementById('sp-save-status');
  const scoreBadge = document.getElementById('sp-score-badge');
  const regionsList = document.getElementById('sp-regions-list');

  // Load saved settings
  const stored = await chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'quizScore']);
  if (stored.geminiApiKey) apiKeyInput.value = stored.geminiApiKey;
  if (stored.geminiModel) modelSelect.value = stored.geminiModel;
  if (typeof stored.quizScore === 'number') {
    scoreBadge.textContent = `Quiz: ${stored.quizScore} pts`;
  }

  // Load session state
  const session = await chrome.storage.session.get(['lastCursorInspection', 'lastViewportScan']);
  if (session.lastCursorInspection) {
    renderInspection(session.lastCursorInspection);
  }
  if (session.lastViewportScan?.regions) {
    renderRegionsList(session.lastViewportScan.regions);
  }

  saveBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      geminiApiKey: apiKeyInput.value.trim(),
      geminiModel: modelSelect.value
    });
    saveStatus.style.display = 'block';
    setTimeout(() => {
      saveStatus.style.display = 'none';
    }, 2000);
  });

  async function sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (err) {
        console.warn('Could not message active tab:', err);
      }
    }
  }

  document.getElementById('sp-btn-lens').addEventListener('click', () => {
    sendToActiveTab({ type: 'SET_MODE', mode: 'lens' });
  });
  document.getElementById('sp-btn-quiz').addEventListener('click', () => {
    sendToActiveTab({ type: 'SET_MODE', mode: 'quiz' });
  });
  document.getElementById('sp-btn-map').addEventListener('click', () => {
    sendToActiveTab({ type: 'SET_MODE', mode: 'map' });
  });
  document.getElementById('sp-btn-scan').addEventListener('click', () => {
    sendToActiveTab({ type: 'TRIGGER_SCAN' });
  });

  function renderInspection(data) {
    if (!data) return;
    document.getElementById('sp-layer').textContent = data.layerTunic || 'Tissue Layer';
    document.getElementById('sp-title').textContent = data.structureName || 'Identified Structure';
    document.getElementById('sp-desc').textContent = data.explanation || '';
    document.getElementById('sp-tip').innerHTML = `🎯 <strong>Exam Tip:</strong> ${data.examTip || ''}`;
  }

  function renderRegionsList(regions) {
    regionsList.innerHTML = '';
    regions.forEach((reg) => {
      const div = document.createElement('div');
      div.className = 'struct-item';
      div.style.cursor = 'pointer';
      div.innerHTML = `
        <strong>${reg.name}</strong>
        <span>${reg.layer} — ${reg.description}</span>
      `;
      div.addEventListener('click', () => {
        renderInspection({
          structureName: reg.name,
          layerTunic: reg.layer,
          explanation: reg.description,
          examTip: reg.examTip
        });
      });
      regionsList.appendChild(div);
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CURSOR_INSPECTION_UPDATED') {
      renderInspection(msg.data);
    } else if (msg.type === 'VIEWPORT_SCAN_UPDATED' && msg.data?.regions) {
      renderRegionsList(msg.data.regions);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.quizScore) {
      scoreBadge.textContent = `Quiz: ${changes.quizScore.newValue} pts`;
    }
  });
});
