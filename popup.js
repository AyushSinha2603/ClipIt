let screenshotDataUrl = null; // Store captured screenshot string

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('title').value = tab.title || 'Untitled';

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
        screenshotDataUrl = dataUrl;
        const img = document.getElementById('previewImg');
        img.src = dataUrl;
        img.style.display = 'block';
      }
    });
  });

  document.getElementById('saveBtn').addEventListener('click', () => saveNote(tab.url));
});

async function saveNote(pageUrl) {
  const status = document.getElementById('status');
  status.textContent = 'Committing...';
  
  const { githubToken, repoOwner, repoName, folderPath } = await chrome.storage.local.get(['githubToken', 'repoOwner', 'repoName', 'folderPath']);
  if (!githubToken) return status.textContent = 'Configure options first!';

  const title = document.getElementById('title').value.trim();
  const tags = document.getElementById('tags').value.trim().split(',').filter(t => t).map(t => `"${t.trim()}"`).join(', ');
  let content = document.getElementById('content').value;
  
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const dateStr = new Date().toISOString().split('T')[0];
  const imageFilename = `${dateStr}-${safeTitle}-screen.png`;

  // 1. Upload screenshot image if available
  if (screenshotDataUrl) {
    status.textContent = 'Uploading screenshot...';
    // Remove the data URL header (data:image/png;base64,)
    const base64Image = screenshotDataUrl.replace(/^data:image\/png;base64,/, "");
    const imgPath = folderPath ? `${folderPath}/images/${imageFilename}` : `images/${imageFilename}`;

    try {
      await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imgPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `upload screenshot ${imageFilename}`,
          content: base64Image
        })
      });

      // Insert markdown image tag into the content
      const imageRelPath = `images/${imageFilename}`;
      content += `\n\n![Screenshot](${imageRelPath})\n`;
    } catch (err) {
      console.error('Failed to upload image', err);
    }
  }

  // 2. Upload Markdown Note
  status.textContent = 'Saving note...';
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
        message: `add ${noteFilename}`,
        content: btoa(unescape(encodeURIComponent(md)))
      })
    });
    
    if (res.ok) {
      status.textContent = 'Success!';
      setTimeout(() => window.close(), 1000);
    } else throw new Error();
  } catch {
    status.textContent = 'Error committing file.';
  }
}