// popup.js

const { jsPDF } = window.jspdf;

// --- Persistent State Variables ---
let clipSession = {
  title: '',
  tags: '',
  events: [] // Master list: array of { id: timestamp, type: 'screenshot'|'text', data: '...', color?: 'string' }
};

// --- DOM Elements ---
const timeline = document.getElementById('clipTimeline');
const scratchpad = document.getElementById('scratchpad');
const status = document.getElementById('status'); // Get status element

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
  // Connects color buttons to the function that gets selected text from the page
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', handleHighlightAction);
  });
});

// Helper: Auto-populate title if session draft is new
async function autoPopulateTitle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Check if tab exists before trying to access title
  if (tab && tab.title && !clipSession.title) {
    document.getElementById('noteTitle').value = tab.title;
    clipSession.title = tab.title;
    saveSessionToStorage();
  }
}

// Write Master State to Persistent Storage
function saveSessionToStorage() {
  chrome.storage.local.set({ clipSession });
}

// Rendering the Unified Chronological Timeline in the Popup
function renderTimeline() {
  timeline.innerHTML = ''; // Clear existing DOM
  
  if (!clipSession.events || clipSession.events.length === 0) {
    timeline.style.display = 'none'; // Hide container when empty
    return;
  }
  
  timeline.style.display = 'flex'; // Show container

  // Iterate through events in order
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
      // Apply background color if stored (visual cue in popup)
      if (event.color) {
          textDiv.style.borderLeft = `5px solid ${event.color}`;
          textDiv.style.paddingLeft = '10px';
      }
      textDiv.textContent = event.data; 
      itemDiv.appendChild(textDiv);
    }

    // 2. Create deletion button 'X' icon
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

// Helper: Delete item from unified timeline Master array and redraw
function deleteTimelineItem(idToDelete) {
  clipSession.events = clipSession.events.filter(event => event.id !== idToDelete);
  saveSessionToStorage();
  renderTimeline();
}

// --- Action: Take Screenshot ---
function takeScreenshot() {
  // Slight delay to avoid capturing the popup opening animation
  setTimeout(() => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (dataUrl) {
        if (!clipSession.events) clipSession.events = []; // Ensure array exists
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

  if (!clipSession.events) clipSession.events = []; // Ensure array exists
  clipSession.events.push({
    id: Date.now(),
    type: 'text',
    data: content 
  });
  saveSessionToStorage();
  renderTimeline();
  scratchpad.value = ''; // Clear scratchpad
}

// --- Action: Reset Session ---
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
  status.textContent = 'Session draft cleared.';
  setTimeout(() => status.textContent = '', 1500);
  
  autoPopulateTitle(); // populate title for new session
}

// =========================================
// NEW: handleHighlightAction
// Requests selected text from the web page
// =========================================
async function handleHighlightAction(event) {
  const color = event.target.style.backgroundColor || event.target.dataset.color; // Get color from button

  status.textContent = "Capturing selection...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Safety check to prevent errors on chrome:// pages
  if (!tab.url || tab.url.startsWith("chrome://")) {
      status.textContent = "Cannot capture text from Chrome system pages.";
      setTimeout(() => status.textContent = "", 2500);
      return;
  }

  // Send message to the content script running in the web page tab
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_SELECTION" });

    if (response && response.text) {
      const selectedText = response.text.trim();

      if (selectedText) {
        if (!clipSession.events) clipSession.events = []; // Ensure array exists
        
        // Add to the master timeline list as a "text" event
        clipSession.events.push({
          id: Date.now(),
          type: 'text',
          data: selectedText,
          color: color // Store the color used
        });

        saveSessionToStorage();
        renderTimeline();
        status.textContent = "Highlighted text captured!";
        setTimeout(() => status.textContent = "", 1500);
      } else {
         status.textContent = "No text selected on page. Select text first.";
         setTimeout(() => status.textContent = "", 2500);
      }
    } else {
        // Handle case where content script is not loaded or didn't respond
        status.textContent = "Error: Refresh the web page and try again.";
        setTimeout(() => status.textContent = "", 2500);
    }
  } catch (error) {
    console.error("Error communicating with content script:", error);
    status.textContent = "Error: Refresh the web page and try again.";
    setTimeout(() => status.textContent = "", 2500);
  }
}

// =========================================
// NEW: COMPLETED CHRONOLOGICAL PDF DOWNLOAD
// =========================================
async function downloadSessionAsPDF() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  status.className = 'status';
  status.textContent = 'Generating PDF...';
  
  const saveBtn = document.getElementById('saveBtn');
  const originalBtnText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Downloading...';

  if (!clipSession.title && (!clipSession.events || clipSession.events.length === 0)) {
    status.className = 'status error';
    status.textContent = 'Nothing to download.';
    saveBtn.disabled = false;
    saveBtn.textContent = originalBtnText;
    return;
  }

  // Initialize jsPDF (A4 size, units in mm)
  const doc = new jsPDF('p', 'mm', 'a4');
  let yPosition = 20; // Track vertical position (top margin)
  const xMargin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (xMargin * 2);

  // 1. Add Title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  // Basic text wrap for long titles
  const titleLines = doc.splitTextToSize(clipSession.title || 'Untitled Session Note', contentWidth);
  doc.text(titleLines, xMargin, yPosition);
  yPosition += (titleLines.length * 9); // Adjust Y based on title lines

  // 2. Add Meta info
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  yPosition += 5;
  doc.text(`Date: ${new Date().toLocaleString()}`, xMargin, yPosition);
  yPosition += 5;
  // Handle long URLs
  const urlLines = doc.splitTextToSize(`Source: ${tab.url}`, contentWidth);
  doc.text(urlLines, xMargin, yPosition);
  yPosition += (urlLines.length * 5); // Adjust Y

  doc.text(`Tags: ${clipSession.tags || '(none)'}`, xMargin, yPosition);
  yPosition += 15; // Space before events

  // 3. Process Events Chronologically
  if (clipSession.events) {
      for (const event of clipSession.events) {
          // Check for page overflow (simple buffer)
          if (yPosition > pageHeight - 30) {
              doc.addPage();
              yPosition = 20;
          }

          if (event.type === 'text') {
              doc.setFontSize(12);
              doc.setFont("helvetica", "normal");
              
              // Set color based on highlight (optional, PDF text will be black, 
              // but we can add a small colored rectangle next to it)
              if (event.color) {
                  // doc.setTextColor(event.color); // makes text hard to read in PDF
                  // Draw a vertical line matching the highlight color
                  doc.setDrawColor(event.color);
                  doc.setLineWidth(1);
                  // We'll calculate height after splitting text
              } else {
                  doc.setDrawColor(0); // black default
                  doc.setLineWidth(0.1);
              }

              // Word wrap: split text to fit content width minus bullet space
              const textX = xMargin + 7;
              const textWidth = contentWidth - 7;
              const lines = doc.splitTextToSize(event.data, textWidth);
              
              // Draw text and bullet
              doc.text("•", xMargin, yPosition);
              doc.text(lines, textX, yPosition);

              // Draw color indicator line if color exists
              if (event.color) {
                  const textHeight = lines.length * 6; // approximate line height
                  doc.line(xMargin - 2, yPosition - 4, xMargin - 2, yPosition + textHeight - 4);
              }

              yPosition += (lines.length * 6); // Adjust Y based on lines added
              yPosition += 8; // Extra spacing after the note

          } else if (event.type === 'screenshot') {
              try {
                  // Add Image: dataUrl, format, x, y, width, height
                  // We need to scale standard image (16:9) to fit width
                  const imgWidth = contentWidth; 
                  const imgHeight = (imgWidth * 9) / 16; // Assuming 16:9 aspect ratio

                  // Check if image fits on current page
                  if (yPosition + imgHeight > pageHeight - 20) {
                      doc.addPage();
                      yPosition = 20;
                  }

                  doc.addImage(event.data, 'PNG', xMargin, yPosition, imgWidth, imgHeight);
                  yPosition += imgHeight + 10; // Spacing after image
              } catch (imgError) {
                  console.error("Error adding image to PDF:", imgError);
                  doc.setFont("helvetica", "italic");
                  doc.text("[Error adding screenshot]", xMargin, yPosition);
                  yPosition += 10;
              }
          }
      }
  }

  // Final status update and save file
  status.textContent = 'Downloading PDF...';
  // Use a clean filename
  const filename = (clipSession.title || 'session_note').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';
  doc.save(filename);

  // Reset UI button state
  saveBtn.disabled = false;
  saveBtn.textContent = originalBtnText;
  status.textContent = 'PDF downloaded successfully!';
  setTimeout(() => status.textContent = '', 2500);
}