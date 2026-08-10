// State management
let activeScreenshots = []; // Array of { id: timestamp, base64: dataUrl }

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('title').value = tab.title || 'Untitled Session';

  // Extract highlighted text on active tab
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString()
  }, (results) => {
    if (results?.[0]?.result) {
      document.getElementById('content').value = `> ${results[0].result}\n\n`;
    }
  });

  // Highlight color buttons
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
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (dataUrl) {
        // Add to active state array with a unique timestamp ID
        activeScreenshots.push({
          id: Date.now(),
          base64: dataUrl
        });
        // Redraw gallery with new screenshot
        renderGallery();
      }
    });
  });

  document.getElementById('saveBtn').addEventListener('click', () => saveNoteSession(tab.url));
});

// =========================================
// NEW: Rendering and State Functions
// =========================================

function renderGallery() {
  const gallery = document.getElementById('screenshotGallery');
  
  // Clear existing items
  gallery.innerHTML = '';

  if (activeScreenshots.length === 0) {
    gallery.style.display = 'none'; // Hide when empty
    return;
  }

  gallery.style.display = 'flex'; // Show gallery

  activeScreenshots.forEach((item, index) => {
    // 1. Container
    const itemDiv = document.createElement('div');
    itemDiv.className = 'gallery-item';

    // 2. Image Thumbnail
    const img = document.createElement('img');
    img.src = item.base64;
    img.alt = `Screenshot thumbnail ${index + 1}`;
    img.className = 'screenshot-thumbnail';

    // 3. Delete 'X' icon
    const deleteIcon = document.createElement('span');
    deleteIcon.innerHTML = '&#10005;'; // HTML code for X
    deleteIcon.className = 'delete-icon';
    deleteIcon.title = 'Delete screenshot from session';
    
    // Deletion Logic
    deleteIcon.addEventListener('click', () => deleteScreenshot(item.id));

    // Combine and append
    itemDiv.appendChild(img);
    itemDiv.appendChild(deleteIcon);
    gallery.appendChild(itemDiv);
  });
}

function deleteScreenshot(idToDelete) {
  // Filter the state array based on timestamp ID
  activeScreenshots = activeScreenshots.filter(item => item.id !== idToDelete);
  // Redraw gallery without the deleted item
  renderGallery();
}

// =========================================
// Modified: Batch Upload and Construct Logic
// =========================================

async function saveNoteSession(pageUrl) {
  const status = document.getElementById('status');
  status.className = 'status';
  status.textContent = 'Committing Session...';
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Uploading...';

  const { githubToken, repoOwner, repoName, folderPath } = await chrome.storage.local.get(['githubToken', 'repoOwner', 'repoName', 'folderPath']);
  
  if (!githubToken) {
    status.className = 'status error';
    status.textContent = 'Configure options first!';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Commit Session to GitHub';
    return;
  }

  const title = document.getElementById('title').value.trim();
  const tags = document.getElementById('tags').value.trim().split(',').filter(t => t).map(t => `"${t.trim()}"`).join(', ');
  let content = document.getElementById('content').value;
  
  const dateStr = new Date().toISOString().split('T')[0];
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  // status tracking
  let markdownImageLinks = '\n\n### Session Screenshots\n\n';
  const totalScreenshots = activeScreenshots.length;
  let hasScreenshots = totalScreenshots > 0;

  // 1. Process and upload all images using Promise.all()
  if (hasScreenshots) {
    status.textContent = `Uploading ${totalScreenshots} screenshots...`;
    
    // Create an array of Promises for each parallel image upload
    const uploadPromises = activeScreenshots.map(async (item, index) => {
      
      const imageFilename = `${dateStr}-${safeTitle}-screen-${index + 1}.png`;
      
      // Sanitization: Remove the data URL header (data:image/png;base64,) required for GitHub commit content
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

        if (!imgResponse.ok) {
          throw new Error(`GitHub image API error ${imgResponse.status}`);
        }

        // Return the Markdown image tag to append to the final note
        // Using images/ subfolder organizes the repo neatly
        const imageRelPath = `images/${imageFilename}`;
        return `![Screenshot ${index + 1}](${imageRelPath})\n\n`;

      } catch (err) {
        console.error('Failed to upload session image', err);
        throw err; // Ensure Promise.all fails if one image fails
      }
    });

    try {
      // Execute all image uploads in parallel and wait for all to succeed
      const results = await Promise.all(uploadPromises);
      markdownImageLinks += results.join(''); // combine image tags
    } catch (err) {
      status.className = 'status error';
      status.textContent = `Error uploading screenshots: ${err.message}`;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Commit Session to GitHub';
      return; // Stop execution if images fail
    }
  }

  // 2. Construct and upload final Markdown Note
  status.textContent = 'Saving session note...';
  
  // Append image references to body if they exist
  if (hasScreenshots) {
    content += markdownImageLinks;
  }

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
      status.textContent = 'Session committed successfully!';
      setTimeout(() => window.close(), 1000);
    } else {
      const errData = await res.json();
      throw new Error(errData.message || `GitHub Note API error ${res.status}`);
    }
  } catch (err) {
    status.className = 'status error';
    status.textContent = `Error committing note file: ${err.message}`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Commit Session to GitHub';
  }
}