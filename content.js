// content.js

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_SELECTION") {
    // Get currently selected text on the page
    const selection = window.getSelection().toString();
    // Send it back to the popup
    sendResponse({ text: selection });
  }
  // Return true to indicate we will send a response asynchronously
  return true; 
});