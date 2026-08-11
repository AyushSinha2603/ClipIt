// content.js

// Function to visually highlight selected text on the webpage
function highlightSelection(color) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return "";

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString().trim();

  if (!selectedText) return "";

  // Create a span element to wrap the highlighted text
  const span = document.createElement('span');
  span.style.backgroundColor = color || 'yellow';
  span.style.color = '#000'; // Keep text dark for legibility
  span.className = 'clipit-highlight';

  try {
    range.surroundContents(span);
    selection.removeAllRanges();
  } catch (e) {
    // If the selection spans multiple HTML tags, surroundContents might fail.
    // Fall back to extracting text without visual wrapper on page.
    console.warn("ClipIt: Could not wrap selection across complex tags, capturing text anyway.", e);
  }

  return selectedText;
}

// Listen for messages sent from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_SELECTION") {
    const text = highlightSelection(request.color);
    sendResponse({ text: text });
  }
  return true; // Keep message channel open for async response
});