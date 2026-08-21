const { jsPDF } = window.jspdf;

let clipSession = { title: '', tags: '', events: [] };
let timeline, scratchpad, statusEl, noteTitle, noteTags;

document.addEventListener('DOMContentLoaded', async () => {
  timeline = document.getElementById('clipTimeline');
  scratchpad = document.getElementById('scratchpad');
  statusEl = document.getElementById('status');
  noteTitle = document.getElementById('noteTitle');
  noteTags = document.getElementById('noteTags');

  chrome.storage.local.get(['clipSession'], (result) => {
    if (result.clipSession) {
      clipSession = result.clipSession;
      noteTitle.value = clipSession.title || '';
      noteTags.value = clipSession.tags || '';
      renderTimeline();
    } else {
      autoPopulateTitle();
    }
  });

  noteTitle.addEventListener('input', (e) => { clipSession.title = e.target.value; saveSessionToStorage(); });
  noteTags.addEventListener('input', (e) => { clipSession.tags = e.target.value; saveSessionToStorage(); });

  document.getElementById('snapBtn').addEventListener('click', startCropping);
  document.getElementById('resetBtn').addEventListener('click', resetSession);
  document.getElementById('addNoteBtn').addEventListener('click', addScratchpadNote);
  document.getElementById('saveBtn').addEventListener('click', downloadSessionAsPDF);
  document.getElementById('gitBtn').addEventListener('click', pushToGitHub);
  document.getElementById('aiBtn').addEventListener('click', generateAIInsights);
  
  const optionsBtn = document.getElementById('optionsBtn');
  if (optionsBtn) optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', handleHighlightAction);
  });
});

async function autoPopulateTitle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.title && !clipSession.title) {
    noteTitle.value = tab.title;
    clipSession.title = tab.title;
    saveSessionToStorage();
  }
}

function saveSessionToStorage() {
  chrome.storage.local.set({ clipSession });
}

function renderTimeline() {
  timeline.innerHTML = '';
  if (!clipSession.events || clipSession.events.length === 0) {
    timeline.style.display = 'none'; return;
  }
  timeline.style.display = 'flex';

  clipSession.events.forEach(event => {
    const itemDiv = document.createElement('div');
    itemDiv.className = `timeline-item timeline-${event.type}`;

    if (event.type === 'screenshot') {
      const img = document.createElement('img');
      img.src = event.data;
      img.style.width = '100%';
      img.style.borderRadius = '4px';
      itemDiv.appendChild(img);
    } else if (event.type === 'text') {
      const textDiv = document.createElement('div');
      textDiv.className = 'timeline-text';
      if (event.color) {
        textDiv.style.borderLeft = `4px solid ${event.color}`;
        textDiv.style.paddingLeft = '8px';
      }
      textDiv.textContent = `• ${event.data}`;
      itemDiv.appendChild(textDiv);
    }

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'timeline-delete';
    deleteBtn.innerHTML = '&#10005;';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.title = 'Delete this item';
    deleteBtn.addEventListener('click', () => deleteTimelineItem(event.id));
    itemDiv.appendChild(deleteBtn);
    timeline.appendChild(itemDiv);
  });
  timeline.scrollTop = timeline.scrollHeight;
}

function deleteTimelineItem(id) {
  clipSession.events = clipSession.events.filter(event => event.id !== id);
  saveSessionToStorage();
  renderTimeline();
}

async function ensureScriptInjected(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] });
  } catch (err) {}
}

async function startCropping() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith("chrome://")) {
    setStatus("Cannot screenshot system pages.", "error"); return;
  }
  await ensureScriptInjected(tab.id);
  chrome.tabs.sendMessage(tab.id, { action: "START_CROP" }, () => {
    if (chrome.runtime.lastError) {
      setStatus("Please refresh the page first.", "error"); return;
    }
    window.close();
  });
}

function addScratchpadNote() {
  const content = scratchpad.value.trim();
  if (!content) return;
  if (!clipSession.events) clipSession.events = [];
  clipSession.events.push({ id: Date.now(), type: 'text', data: content });
  saveSessionToStorage(); renderTimeline();
  scratchpad.value = '';
}

async function resetSession() {
  if (!confirm('Discard all screenshots and notes in this session?')) return;
  await chrome.storage.local.remove('clipSession');
  clipSession = { title: '', tags: '', events: [] };
  noteTitle.value = ''; noteTags.value = ''; scratchpad.value = '';
  renderTimeline(); setStatus('Session cleared.', 'success'); autoPopulateTitle();
}

async function handleHighlightAction(e) {
  const color = e.target.dataset.color || e.target.style.backgroundColor;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || tab.url.startsWith("chrome://")) {
    setStatus("Cannot highlight on system pages.", "error"); return;
  }

  await ensureScriptInjected(tab.id);

  chrome.tabs.sendMessage(tab.id, { action: "GET_SELECTION", color: color }, (response) => {
    if (chrome.runtime.lastError || !response || !response.text) {
      setStatus("Select text on page first!", "error"); return;
    }
    if (!clipSession.events) clipSession.events = [];
    clipSession.events.push({ id: Date.now(), type: 'text', data: response.text, color: color });
    saveSessionToStorage(); renderTimeline();
    setStatus("Text captured!", "success");
  });
}

function setStatus(msg, type) {
  statusEl.textContent = msg; 
  statusEl.style.color = type === 'error' ? '#cf222e' : '#57ab5a';
  if (msg) setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

// =========================================
// FEATURE 1: AI SUMMARY (Local window.ai)
// =========================================
async function generateAIInsights() {
  const aiBtn = document.getElementById('aiBtn');
  
  if (!window.ai || !window.ai.languageModel) {
    setStatus("Local AI not enabled in Chrome flags.", "error");
    scratchpad.value = "Enable Chrome's Prompt API in chrome://flags/#prompt-api-for-extension-models";
    return;
  }

  const textEvents = clipSession.events.filter(e => e.type === 'text').map(e => e.data);
  if (textEvents.length === 0) {
    setStatus("No text notes to summarize.", "error"); return;
  }

  aiBtn.disabled = true;
  setStatus("✨ AI is analyzing...", "");

  try {
    const session = await window.ai.languageModel.create();
    const combinedText = textEvents.join('\n\n');

    const summary = await session.prompt(`Summarize the following notes in 2-3 concise bullet points:\n${combinedText}`);
    const tags = await session.prompt(`Suggest 3-5 comma-separated single-word tags for this content:\n${combinedText}`);

    scratchpad.value = `### AI Summary\n${summary}`;
    
    let existingTags = noteTags.value.split(',').map(t => t.trim()).filter(Boolean);
    let newTags = tags.split(',').map(t => t.trim().replace(/^[#\-*\s]+/, '')).filter(Boolean);
    noteTags.value = Array.from(new Set([...existingTags, ...newTags])).join(', ');
    
    clipSession.tags = noteTags.value;
    saveSessionToStorage();
    setStatus("AI Analysis complete!", "success");
  } catch (err) {
    console.error(err);
    setStatus("AI execution failed.", "error");
  } finally {
    aiBtn.disabled = false;
  }
}

// =========================================
// FEATURE 2: GITHUB PUSH
// =========================================
async function pushToGitHub() {
  const gitBtn = document.getElementById('gitBtn');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!clipSession.title && (!clipSession.events || clipSession.events.length === 0)) {
    setStatus("Session is empty.", "error"); return;
  }

  chrome.storage.sync.get(['ghToken', 'ghOwner', 'ghRepo', 'ghPath'], async (config) => {
    if (!config.ghToken || !config.ghOwner || !config.ghRepo) {
      setStatus("Configure GitHub in settings first.", "error");
      chrome.runtime.openOptionsPage();
      return;
    }

    gitBtn.disabled = true;
    setStatus("Pushing to GitHub...", "");

    const sanitizedTitle = (clipSession.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `${sanitizedTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`;
    const targetPath = config.ghPath ? `${config.ghPath}/${fileName}` : fileName;

    let md = `# ${clipSession.title || 'Untitled Research Session'}\n\n`;
    md += `- **Date:** ${new Date().toLocaleString()}\n`;
    if (tab && tab.url) md += `- **Source:** [${tab.url}](${tab.url})\n`;
    if (clipSession.tags) md += `- **Tags:** \`${clipSession.tags}\`\n\n---\n\n## Timeline Notes\n\n`;

    clipSession.events.forEach((item, idx) => {
      if (item.type === 'text') {
        md += `* ${item.data}\n\n`;
      } else if (item.type === 'screenshot') {
        md += `* **Screenshot ${idx + 1}:**\n\n<img src="${item.data}" width="600" />\n\n`;
      }
    });

    const utf8Bytes = new TextEncoder().encode(md);
    const base64Content = btoa(String.fromCharCode(...utf8Bytes));

    try {
      const res = await fetch(`https://api.github.com/repos/${config.ghOwner}/${config.ghRepo}/contents/${targetPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.ghToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Add note: ${clipSession.title || 'Untitled'}`,
          content: base64Content
        })
      });

      if (!res.ok) throw new Error('GitHub API error');
      setStatus("Synced to GitHub!", "success");
    } catch (err) {
      console.error(err);
      setStatus("Git Push Failed.", "error");
    } finally {
      gitBtn.disabled = false;
    }
  });
}

// =========================================
// FEATURE 3: PDF EXPORT
// =========================================
async function downloadSessionAsPDF() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const saveBtn = document.getElementById('saveBtn');
  
  if (!clipSession.title && (!clipSession.events || clipSession.events.length === 0)) {
    setStatus('Nothing to download.', 'error'); return;
  }

  saveBtn.disabled = true; setStatus('Generating PDF...', '');
  const doc = new jsPDF('p', 'mm', 'a4');
  let y = 20; const margin = 15;
  const contentWidth = doc.internal.pageSize.getWidth() - (margin * 2);
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(18); doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(clipSession.title || 'Untitled Session Note', contentWidth);
  doc.text(titleLines, margin, y); y += (titleLines.length * 8) + 4;

  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
  doc.text(`Date: ${new Date().toLocaleString()}`, margin, y); y += 4;
  if (tab && tab.url) {
    const urlLines = doc.splitTextToSize(`Source: ${tab.url}`, contentWidth);
    doc.text(urlLines, margin, y); y += (urlLines.length * 4);
  }
  if (clipSession.tags) doc.text(`Tags: ${clipSession.tags}`, margin, y);
  y += 6; doc.setDrawColor(200); doc.line(margin, y, margin + contentWidth, y); y += 10;

  doc.setTextColor(0);
  if (clipSession.events) {
    for (const event of clipSession.events) {
      if (y > pageHeight - 25) { doc.addPage(); y = 20; }

      if (event.type === 'text') {
        doc.setFontSize(11); doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(event.data, contentWidth - 6);
        doc.setFont("helvetica", "bold"); doc.text("•", margin, y);
        doc.setFont("helvetica", "normal"); doc.text(lines, margin + 6, y);
        y += (lines.length * 6) + 6;
      } else if (event.type === 'screenshot') {
        try {
          const tempImg = new Image();
          tempImg.src = event.data;
          const scale = Math.min(contentWidth / tempImg.width, 1); 
          const imgWidth = tempImg.width * scale;
          const imgHeight = tempImg.height * scale;

          if (y + imgHeight > pageHeight - 20) { doc.addPage(); y = 20; }
          doc.addImage(event.data, 'PNG', margin, y, imgWidth, imgHeight);
          y += imgHeight + 8;
        } catch (err) { console.error(err); }
      }
    }
  }

  const filename = (clipSession.title || 'session_note').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';
  doc.save(filename);
  saveBtn.disabled = false; setStatus('PDF downloaded!', 'success');
}