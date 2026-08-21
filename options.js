document.addEventListener('DOMContentLoaded', () => {
  const ghToken = document.getElementById('ghToken');
  const ghOwner = document.getElementById('ghOwner');
  const ghRepo = document.getElementById('ghRepo');
  const ghPath = document.getElementById('ghPath');
  const saveBtn = document.getElementById('saveOptions');
  const status = document.getElementById('status');

  // Load existing settings
  chrome.storage.sync.get(['ghToken', 'ghOwner', 'ghRepo', 'ghPath'], (data) => {
    if (data.ghToken) ghToken.value = data.ghToken;
    if (data.ghOwner) ghOwner.value = data.ghOwner;
    if (data.ghRepo) ghRepo.value = data.ghRepo;
    if (data.ghPath) ghPath.value = data.ghPath;
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const config = {
      ghToken: ghToken.value.trim(),
      ghOwner: ghOwner.value.trim(),
      ghRepo: ghRepo.value.trim(),
      ghPath: ghPath.value.trim().replace(/^\/+|\/+$/g, '') // Clean up slashes
    };

    chrome.storage.sync.set(config, () => {
      status.textContent = 'GitHub Settings saved successfully!';
      status.style.color = '#3fb950';
      setTimeout(() => { status.textContent = ''; }, 2500);
    });
  });
});