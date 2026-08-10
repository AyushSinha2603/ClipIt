document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('title').value = tab.title || 'Untitled';

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString()
  }, (results) => {
    if (results?.[0]?.result) {
      document.getElementById('content').value = `> ${results[0].result}\n\n`;
    }
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
  const content = document.getElementById('content').value;
  
  const md = `---\ntitle: "${title}"\nurl: "${pageUrl}"\ndate: "${new Date().toISOString()}"\ntags: [${tags}]\n---\n\n# ${title}\n\n**Source:** ${pageUrl}\n\n${content}`;
  
  const filename = `${new Date().toISOString().split('T')[0]}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
  const path = folderPath ? `${folderPath}/${filename}` : filename;
  
  try {
    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `add ${filename}`,
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