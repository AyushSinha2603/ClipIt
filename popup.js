// popup.js

const { jsPDF } = window.jspdf;

// --- Persistent State Variables ---
let clipSession = {
  title: '',
  tags: '',
  events: [] // Master list: array of { id, type: 'screenshot'|'text', data: '...', color?: 'hex' }
};

// --- DOM Elements ---
let timeline, scratchpad, status, noteTitle, noteTags;

document.addEventListener('DOMContentLoaded', async () => {
  timeline = document.getElementById('clipTimeline');
  scratchpad = document.getElementById('scratchpad');
  status = document.getElementById('status');
  noteTitle = document.getElementById('noteTitle');
  noteTags = document.getElementById('noteTags');

  // 1. Fetch entire session draft from local storage
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

  // 2. Auto-save title and tags
  noteTitle.addEventListener('input', (e) => {
    clipSession.title = e.target.value;
    saveSessionToStorage();
  });
  noteTags.addEventListener('input', (e) => {
    clipSession.tags = e.target.value;
    saveSessionToStorage();
  });

  // 3. Action Listeners
  document.getElementById('snapBtn').addEventListener('click', takeScreenshot);
  document.getElementById('resetBtn').addEventListener('click', resetSession);
  document.getElementById('addNoteBtn').addEventListener('click', addScratchpadNote);
  document.getElementById('saveBtn').addEventListener('click', downloadSessionAsPDF);

  // 4. Highlight Color Listeners
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
    timeline.style.display = 'none';
    return;
  }
  
  timeline.style.display = 'flex';

  clipSession.events.forEach(event => {
    const itemDiv = document.createElement('div');
    itemDiv.className = `timeline-item timeline-${event.type}`;

    if (event.type === 'screenshot') {
      const img = document.createElement('img');
      img.src = event.data;
      itemDiv.appendChild(img);
    } else if (event.type === 'text') {
      const textDiv = document.createElement('div');
      textDiv.className = 'timeline-text';
      if (event.color) {
        textDiv.style.borderLeft = `4px solid ${event.color}`;
        textDiv.style.paddingLeft = '6px';
      }
      textDiv.textContent = `• ${event.data}`;
      itemDiv.appendChild(textDiv);
    }

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'timeline-delete';
    deleteBtn.innerHTML = '&#10005;';
    deleteBtn.title = 'Delete this item';
    deleteBtn.addEventListener('click', () => deleteTimelineItem(event.id));
    itemDiv.appendChild(deleteBtn);

    timeline.appendChild(itemDiv);
  });

  timeline.scrollTop = timeline.scrollHeight;
}

function deleteTimelineItem(idToDelete) {
  clipSession.events = clipSession.events.filter(event => event.id !== idToDelete);
  saveSessionToStorage();
  renderTimeline();
}

// --- Action: Take Screenshot (Now Starts Crop Mode) ---
async function takeScreenshot() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id || !tab.url || tab.url.startsWith("chrome://")) {
        setStatus("Cannot screenshot system pages.", "error");
        return;
    }

    setStatus("Draw a box on the page...", "");
    
    // Tell the content script to start crop mode
    chrome.tabs.sendMessage(tab.id, { action: "START_CROP" });
    
    // Close the popup so the user can interact with the page
    window.close();
}

function addScratchpadNote() {
  const content = scratchpad.value.trim();
  if (!content) return;

  if (!clipSession.events) clipSession.events = [];
  clipSession.events.push({
    id: Date.now(),
    type: 'text',
    data: content
  });
  saveSessionToStorage();
  renderTimeline();
  scratchpad.value = '';
}

async function resetSession() {
  if (!confirm('Discard all screenshots and notes in this session?')) return;

  await chrome.storage.local.remove('clipSession');
  clipSession = { title: '', tags: '', events: [] };
  noteTitle.value = '';
  noteTags.value = '';
  scratchpad.value = '';
  renderTimeline();
  setStatus('Session cleared.', 'success');
  autoPopulateTitle();
}

async function handleHighlightAction(e) {
  const color = e.target.dataset.color;
  setStatus("Capturing text...", "");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    setStatus("Cannot highlight on system pages.", "error");
    return;
  }

  // Inject content script on the fly if not already injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (err) {
    // Ignore if already injected
  }

  // Send message to content script
  chrome.tabs.sendMessage(tab.id, { action: "GET_SELECTION", color: color }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("Refresh the webpage and try again.", "error");
      return;
    }

    if (response && response.text) {
      if (!clipSession.events) clipSession.events = [];
      clipSession.events.push({
        id: Date.now(),
        type: 'text',
        data: response.text,
        color: color
      });
      saveSessionToStorage();
      renderTimeline();
      setStatus("Highlighted text captured!", "success");
    } else {
      setStatus("No text selected on page. Highlight text first!", "error");
    }
  });
}

function setStatus(msg, type) {
  status.textContent = msg;
  status.className = `status ${type}`;
  if (msg) setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 2500);
}

// --- Download Chronological PDF ---
async function downloadSessionAsPDF() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  setStatus('Generating PDF...', '');

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;

  if (!clipSession.title && (!clipSession.events || clipSession.events.length === 0)) {
    setStatus('Nothing to download.', 'error');
    saveBtn.disabled = false;
    return;
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  let y = 20;
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (margin * 2);

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(clipSession.title || 'Untitled Session Note', contentWidth);
  doc.text(titleLines, margin, y);
  y += (titleLines.length * 8) + 4;

  // Metadata
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Date: ${new Date().toLocaleString()}`, margin, y);
  y += 4;
  if (tab && tab.url) {
    const urlLines = doc.splitTextToSize(`Source: ${tab.url}`, contentWidth);
    doc.text(urlLines, margin, y);
    y += (urlLines.length * 4);
  }
  if (clipSession.tags) {
    doc.text(`Tags: ${clipSession.tags}`, margin, y);
    y += 4;
  }
  y += 6;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Render Interleaved Events
  doc.setTextColor(0);
  if (clipSession.events) {
    for (const event of clipSession.events) {
      if (y > pageHeight - 25) {
        doc.addPage();
        y = 20;
      }

      if (event.type === 'text') {
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");

        const textX = margin + 6;
        const textWidth = contentWidth - 6;
        const lines = doc.splitTextToSize(event.data, textWidth);

        // Draw bullet point
        doc.setFont("helvetica", "bold");
        doc.text("•", margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(lines, textX, y);

        y += (lines.length * 6) + 6;

      } else if (event.type === 'screenshot') {
        try {
          const imgWidth = contentWidth;
          const imgHeight = (imgWidth * 9) / 16;

          if (y + imgHeight > pageHeight - 20) {
            doc.addPage();
            y = 20;
          }

          doc.addImage(event.data, 'PNG', margin, y, imgWidth, imgHeight);
          y += imgHeight + 8;
        } catch (err) {
          console.error("PDF image error:", err);
        }
      }
    }
  }

  const filename = (clipSession.title || 'session_note').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';
  doc.save(filename);

  saveBtn.disabled = false;
  setStatus('PDF downloaded!', 'success');
}
// Listen for updates from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "REFRESH_TIMELINE") {
        // Reload data from storage and re-render
        chrome.storage.local.get(['clipSession'], (result) => {
            if (result.clipSession) {
                clipSession = result.clipSession;
                renderTimeline();
                setStatus("Screenshot captured!", "success");
            }
        });
    }
});