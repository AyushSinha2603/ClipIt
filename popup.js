// popup.js

const { jsPDF } = window.jspdf;

// --- Persistent State Variables ---
let clipSession = {
  title: '',
  tags: '',
  events: [] // Master list: array of { id: timestamp, type: 'screenshot'|'text', data: '...' }
};

// --- DOM Elements ---
const timeline = document.getElementById('clipTimeline');
const scratchpad = document.getElementById('scratchpad');

// --- Initialization: Load and Restore Persistent Session Draft ---
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Fetch entire session draft from storage
  chrome.storage.local.get(['clipSession'], (result) => {
    if (result.clipSession) {
      clipSession = result.clipSession;

      // 2. Restore form fields
      document.getElementById('noteTitle').value = clipSession.title || '';
      document.getElementById('noteTags').value = clipSession.tags || '';

      // 3. Redraw the unified chronological timeline
      renderTimeline();
    } else {
      // If empty session, handle title auto-population
      autoPopulateTitle();
    }
  });

  // --- Add Persistence Listeners to Title/Tags ---
  document.getElementById('noteTitle').addEventListener('input', (e) => {
    clipSession.title = e.target.value;
    saveSessionToStorage();
  });
  document.getElementById('noteTags').addEventListener('input', (e) => {
    clipSession.tags = e.target.value;
    saveSessionToStorage();
  });

  // --- Action Listeners ---
  document.getElementById('snapBtn').addEventListener('click', takeScreenshot);
  document.getElementById('resetBtn').addEventListener('click', resetSession);
  document.getElementById('addNoteBtn').addEventListener('click', addScratchpadNote);
  document.getElementById('saveBtn').addEventListener('click', downloadSessionAsPDF);

  // --- Highlight Color Listeners ---
  // Clicking a color highlights on page AND adds text as bullet
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', handleHighlightAction);
  });
});

// Helper: Auto-populate title if session draft is new
async function autoPopulateTitle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.title && !clipSession.title) {
    document.getElementById('noteTitle').value = tab.title;
    clipSession.title = tab.title;
    saveSessionToStorage();
  }
}

// --- Write Master State to Persistent Storage ---
function saveSessionToStorage() {
  chrome.storage.local.set({ clipSession });
}

// --- Rendering the Unified Chronological Timeline ---
function renderTimeline() {
  timeline.innerHTML = ''; // Clear existing DOM

  if (clipSession.events.length === 0) {
    timeline.style.display = 'none'; // Hide container when empty
    return;
  }

  timeline.style.display = 'flex'; // Show container

  clipSession.events.forEach(event => {
    const itemDiv = document.createElement('div');
    itemDiv.className = `timeline-item timeline-${event.type}`;
    itemDiv.id = `event-${event.id}`;

    // 1. Create content based on type
    if (event.type === 'screenshot') {
      const img = document.createElement('img');
      img.src = event.data;
      img.alt = `Screenshot event ${event.id}`;
      itemDiv.appendChild(img);
    } else if (event.type === 'text') {
      const textDiv = document.createElement('div');
      textDiv.className = 'timeline-text';
      textDiv.textContent = event.data;
      itemDiv.appendChild(textDiv);
    }

    // 2. Create deletion 'X' button (delete specific screenshot/note)
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'timeline-delete';
    deleteBtn.innerHTML = '&#10005;';
    deleteBtn.title = 'Delete this item from session';
    deleteBtn.addEventListener('click', () => deleteTimelineItem(event.id));
    itemDiv.appendChild(deleteBtn);

    timeline.appendChild(itemDiv);
  });

  // Autoscroll to bottom
  timeline.scrollTop = timeline.scrollHeight;
}

// Helper: Delete item from unified timeline, then redraw
function deleteTimelineItem(idToDelete) {
  clipSession.events = clipSession.events.filter(event => event.id !== idToDelete);
  saveSessionToStorage();
  renderTimeline();
}

// --- Action: Take Screenshot ---
function takeScreenshot() {
  // Slight delay to avoid capturing the popup opening
  setTimeout(() => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (dataUrl) {
        clipSession.events.push({
          id: Date.now(),
          type: 'screenshot',
          data: dataUrl
        });
        saveSessionToStorage();
        renderTimeline();
      }
    });
  }, 50);
}

// --- Action: Add Scratchpad Note ---
function addScratchpadNote() {
  const content = scratchpad.value.trim();
  if (!content) return;

  clipSession.events.push({
    id: Date.now(),
    type: 'text',
    data: content
  });
  saveSessionToStorage();
  renderTimeline();
  scratchpad.value = ''; // Clear scratchpad
}

// --- Action: Reset Session (clear storage, state, and UI) ---
async function resetSession() {
  if (!confirm('Are you sure you want to discard this entire draft note session? All screenshots and notes will be deleted.')) return;

  // 1. Clear storage
  await chrome.storage.local.remove('clipSession');

  // 2. Clear state
  clipSession = { title: '', tags: '', events: [] };

  // 3. Clear UI
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteTags').value = '';
  renderTimeline();
  scratchpad.value = '';
  document.getElementById('status').textContent = 'Session draft cleared.';
  setTimeout(() => document.getElementById('status').textContent = '', 1500);

  autoPopulateTitle(); // populate title for new session
}

// =========================================
// CHRONOLOGICAL PDF DOWNLOAD
// =========================================
async function downloadSessionAsPDF() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = document.getElementById('status');
  status.className = 'status';
  status.textContent = 'Generating PDF...';

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Downloading...';

  if (!clipSession.title && clipSession.events.length === 0) {
    status.className = 'status error';
    status.textContent = 'Nothing to download.';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save as PDF';
    return;
  }

  try {
    // Initialize jsPDF (A4 size)
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let yPosition = margin;

    // Helper: add a new page if we're about to overflow
    const ensureSpace = (neededHeight) => {
      if (yPosition + neededHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
    };

    // 1. Add Title
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(clipSession.title || 'Untitled Session Note', margin, yPosition);
    yPosition += 12;

    // 2. Add Meta info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Source: ${tab.url}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Tags: ${clipSession.tags || '(none)'}`, margin, yPosition);
    yPosition += 12;

    // 3. Process events chronologically
    for (const event of clipSession.events) {
      if (event.type === 'text') {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(`• ${event.data}`, pageWidth - margin * 2);
        ensureSpace(lines.length * 6);
        doc.text(lines, margin, yPosition);
        yPosition += lines.length * 6 + 4;
      } else if (event.type === 'screenshot') {
        // Get image dimensions to preserve aspect ratio
        const imgProps = doc.getImageProperties(event.data);
        const maxImgWidth = pageWidth - margin * 2;
        const imgWidth = maxImgWidth;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

        ensureSpace(imgHeight);
        doc.addImage(event.data, 'PNG', margin, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 8;
      }
    }

    // 4. Save the PDF
    const safeTitle = (clipSession.title || 'session-note').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'session-note';
    doc.save(`${safeTitle}.pdf`);

    status.className = 'status success';
    status.textContent = 'PDF downloaded!';
  } catch (err) {
    console.error('PDF generation failed:', err);
    status.className = 'status error';
    status.textContent = 'Failed to generate PDF.';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save as PDF';
    setTimeout(() => { status.textContent = ''; }, 2500);
  }
}

// --- Action: Highlight color click -> highlight on page + add bullet note ---
async function handleHighlightAction(e) {
  const color = e.currentTarget.dataset.color || e.currentTarget.getAttribute('data-color');
  if (!color) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Ask the content script to highlight the current selection and return its text
  chrome.tabs.sendMessage(tab.id, { action: 'highlight', color }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    if (response && response.text) {
      clipSession.events.push({
        id: Date.now(),
        type: 'text',
        data: response.text
      });
      saveSessionToStorage();
      renderTimeline();
    }
  });
}