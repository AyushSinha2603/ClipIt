// Persistent State management
let activeScreenshots = []; // Master list: array of { id: timestamp, base64: dataUrl }

// Keys for persistent storage
const STORAGE_KEYS = {
  SCREENSHOTS: 'session_draft_screenshots',
  TITLE: 'session_draft_title',
  TAGS: 'session_draft_tags',
  CONTENT: 'session_draft_content'
};

document.addEventListener('DOMContentLoaded', async () => {
  // --- 1. First, Load Persistent State ---
  await loadSessionState();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Only auto-populate title from tab if persistent draft title is empty
  const titleInput = document.getElementById('noteTitle');
  if (!titleInput.value.trim()) {
    titleInput.value = tab.title || 'Untitled Session';
    // Immediately save this initial auto-title
    saveSessionState();
  }

  // standard behavior: Extract highlighted text on active tab on open
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString()
  }, (results) => {
    if (results?.[0]?.result) {
      const existingContent = document.getElementById('noteContent').value;
      const highlighted = `> ${results[0].result}\n\n`;
      document.getElementById('noteContent').value = highlighted + existingContent;
      // Immediately save content change
      saveSessionState();
    }
  });

  // --- 2. Add Persistent Auto-Save Listeners to Inputs ---
  const persistentInputs = ['noteTitle', 'noteTags', 'noteContent'];
  persistentInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      // Any input change saves the whole form state
      saveSessionState();
    });
  });

  // --- 3. standard UI Listeners (Modified for persistence) ---

  // Highlight color buttons (unchanged behavior)
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const color = e.target.getAttribute('data-color');
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [color],
        func: (highlightColor) => {
          if (!window.getSelection().isCollapsed) {
            document.designMode = "on";
            document.execCommand("hiliteColor", false, highlightColor);
            document.designMode = "off";
          }
        }
      });
    });
  });

  // Take Screenshot Button
  document.getElementById('snapBtn').addEventListener('click', () => {
    // Force popup to minimize slightly to capture page, not popup itself
    setTimeout(() => {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (dataUrl) {
          // Add to active state master list array
          activeScreenshots.push({
            id: Date.now(),
            base64: dataUrl
          });
          // CRITICAL: Immediately write master array to persistent storage
          saveSessionState();
          // Then redraw
          renderGallery();
        }
      });
    }, 50); // slight delay
  });

  // Reset Session Button
  document.getElementById('resetBtn').addEventListener('click', resetSession);

  // Commit Button
  document.getElementById('saveBtn').addEventListener('click', () => saveNoteSession(tab.url));
});

// =========================================
// NEW: Rendering and State Persistence Functions
// =========================================

async function loadSessionState() {
  // Read all session keys parallel from local storage
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.SCREENSHOTS,
    STORAGE_KEYS.TITLE,
    STORAGE_KEYS.TAGS,
    STORAGE_KEYS.CONTENT
  ]);

  // 1. Restore Screenshots Array Master List
  activeScreenshots = data[STORAGE_KEYS.SCREENSHOTS] || [];
  renderGallery(); // Draw gallery based on saved master list

  // 2. Restore Form Fields
  if (data[STORAGE_KEYS.TITLE]) document.getElementById('noteTitle').value = data[STORAGE_KEYS.TITLE];
  if (data[STORAGE_KEYS.TAGS]) document.getElementById('noteTags').value = data[STORAGE_KEYS.TAGS];
  if (data[STORAGE_KEYS.CONTENT]) document.getElementById('noteContent').value = data[STORAGE_KEYS.CONTENT];
}

function saveSessionState() {
  // Gather master state array and current DOM values
  const stateToSave = {
    [STORAGE_KEYS.SCREENSHOTS]: activeScreenshots,
    [STORAGE_KEYS.TITLE]: document.getElementById('noteTitle').value,
    [STORAGE_KEYS.TAGS]: document.getElementById('noteTags').value,
    [STORAGE_KEYS.CONTENT]: document.getElementById('noteContent').value
  };

  // Write parallel to local persistent storage (overwrite previous draft)
  chrome.storage.local.set(stateToSave);
}

async function resetSession() {
  if (!confirm('Are you sure you want to discard this draft note and all session screenshots?')) return;

  // 1. Clear Master Array
  activeScreenshots = [];

  // 2. Clear Form DOM
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteTags').value = '';
  document.getElementById('noteContent').value = '';

  // 3. CRITICAL: Clear persistent keys from storage
  await chrome.storage.local.remove([
    STORAGE_KEYS.SCREENSHOTS,
    STORAGE_KEYS.TITLE,
    STORAGE_KEYS.TAGS,
    STORAGE_KEYS.CONTENT
  ]);

  // 4. Redraw UI (will result in empty gallery)
  renderGallery();
  document.getElementById('status').textContent = 'Draft cleared.';
  setTimeout(() => document.getElementById('status').textContent = '', 1500);
}


function renderGallery() {
  const gallery = document.getElementById('screenshotGallery');
  
  // Clear existing items
  gallery.innerHTML = '';

  // Draw from Master array `activeScreenshots`
  if (activeScreenshots.length === 0) {
    gallery.style.display = 'none'; // Hide container when empty
    return;
  }

  gallery.style.display = 'flex'; // Show container

  activeScreenshots.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = item.base64;
    img.alt = `Screenshot thumbnail ${index + 1}`;
    img.className = 'screenshot-thumbnail';

    const deleteIcon = document.createElement('span');
    deleteIcon.innerHTML = '&#10005;'; 
    deleteIcon.className = 'delete-icon';
    deleteIcon.title = 'Delete from persistent session';
    
    // Modification logic: Modify master list array $\rightarrow$ modify persistent storage $\rightarrow$ redraw
    deleteIcon.addEventListener('click', () => {
      activeScreenshots = activeScreenshots.filter(sc => sc.id !== item.id);
      saveSessionState(); // Immediately save deletion
      renderGallery(); // Redraw gallery
    });

    itemDiv.appendChild(img);
    itemDiv.appendChild(deleteIcon);
    gallery.appendChild(itemDiv);
  });
}

// =========================================
// standard: Batch Upload Logic (unchanged behavior)
// =========================================

async function saveNoteSession(pageUrl) {
  const status = document.getElementById('status');
  status.className = 'status';
  status.textContent = 'Committing Session...';
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Uploading...';

  // Read GitHub credentials parallel (storage API)
  const { githubToken, repoOwner, repoName, folderPath } = await chrome.storage.local.get(['githubToken', 'repoOwner', 'repoName', 'folderPath']);
  
  if (!githubToken) {
    status.className = 'status error';
    status.textContent = 'Configure options first!';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Commit Session to GitHub';
    return;
  }

  const title = document.getElementById('noteTitle').value.trim();
  const tags = document.getElementById('noteTags').value.trim().split(',').filter(t => t).map(t => `"${t.trim()}"`).join(', ');
  let content = document.getElementById('noteContent').value;
  
  const dateStr = new Date().toISOString().split('T')[0];
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  let markdownImageLinks = '\n\n### Session Screenshots\n\n';
  // Use active screenshots array
  const totalScreenshots = activeScreenshots.length;
  let hasScreenshots = totalScreenshots > 0;

  // 1. standard standard Process and upload images using standard standard Parallel uploads Promise.all()
  if (hasScreenshots) {
    status.textContent = `Uploading ${totalScreenshots} screenshots...`;
    
    // standard standard Array standard of parallel promises
    const uploadPromises = activeScreenshots.map(async (item, index) => {
      const imageFilename = `${dateStr}-${safeTitle}-screen-${index + 1}.png`;
      const base64Image = item.base64.replace(/^data:image\/png;base64,/, "");
      const imgPath = folderPath ? `${folderPath}/images/${imageFilename}` : `images/${imageFilename}`;

      try {
        const imgResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imgPath}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `upload session screenshot ${index + 1}/${totalScreenshots}: ${imageFilename}`,
            content: base64Image
          })
        });

        if (!imgResponse.ok) throw new Error();
        return `![Screenshot ${index + 1}](images/${imageFilename})\n\n`;

      } catch (err) {
        throw new Error(`Failed screenshot ${index + 1}`);
      }
    });

    try {
      // Executing in parallel standard Promises.all() standard parallel standard Promise standard parallel standard Parallel Promise standard Parallel standard Promise standard standard standard standard standard standard standard standard Parallel Parallel standard standard standard standard parallel Promise.all()
      const results = await Promise.all(uploadPromises);
      markdownImageLinks += results.join(''); // standard Combining outputs from parallel executions
    } catch (err) {
      status.className = 'status error';
      status.textContent = `Error uploading screenshots: ${err.message}`;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Commit Session to GitHub';
      return; 
    }
  }

  // 2. final Final Markdown Note construction parallel upload parallel Parallel Parallel upload Parallel Parallel standard standard Final Parallel upload
  status.textContent = 'Saving session note...';
  if (hasScreenshots) content += markdownImageLinks;

  const md = `---\ntitle: "${title}"\nurl: "${pageUrl}"\ndate: "${new Date().toISOString()}"\ntags: [${tags}]\n---\n\n# ${title}\n\n**Source:** ${pageUrl}\n\n${content}`;
  
  const noteFilename = `${dateStr}-${safeTitle}.md`;
  const notePath = folderPath ? `${folderPath}/${noteFilename}` : noteFilename;
  
  try {
    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${notePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `add session note ${noteFilename} with ${totalScreenshots} screenshots`,
        content: btoa(unescape(encodeURIComponent(md)))
      })
    });
    
    if (res.ok) {
      status.className = 'status success';
      status.textContent = 'Session committed! Draft cleared.';
      
      // standard SUCCESS standard reset master list array reset persistent standard standard storage clearing keys reset UI
      activeScreenshots = [];
      await chrome.storage.local.remove([
        STORAGE_KEYS.SCREENSHOTS,
        STORAGE_KEYS.TITLE,
        STORAGE_KEYS.TAGS,
        STORAGE_KEYS.CONTENT
      ]);
      renderGallery();
      document.getElementById('noteTitle').value = '';
      document.getElementById('noteTags').value = '';
      document.getElementById('noteContent').value = '';

      setTimeout(() => window.close(), 1500);
    } else throw new Error();
  } catch (err) {
    status.className = 'status error';
    status.textContent = `Error committing note.`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Commit Session to GitHub';
  }
}