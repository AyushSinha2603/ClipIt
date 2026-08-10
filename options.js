document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['githubToken', 'repoOwner', 'repoName', 'folderPath'], (data) => {
    if (data.githubToken) document.getElementById('token').value = data.githubToken;
    if (data.repoOwner) document.getElementById('owner').value = data.repoOwner;
    if (data.repoName) document.getElementById('repo').value = data.repoName;
    if (data.folderPath) document.getElementById('folder').value = data.folderPath;
  });

  document.getElementById('save').addEventListener('click', () => {
    chrome.storage.local.set({
      githubToken: document.getElementById('token').value.trim(),
      repoOwner: document.getElementById('owner').value.trim(),
      repoName: document.getElementById('repo').value.trim(),
      folderPath: document.getElementById('folder').value.trim()
    }, () => {
      document.getElementById('status').textContent = 'Saved!';
      setTimeout(() => { document.getElementById('status').textContent = ''; }, 2000);
    });
  });
});