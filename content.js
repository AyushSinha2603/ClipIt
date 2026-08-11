// content.js

// Function to visually highlight selected text on the webpage
function highlightSelection(color) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return "";

  const selectedText = selection.toString().trim();
  if (!selectedText) return "";

  // The fallback color if none is provided
  const highlightColor = color || 'yellow';

  // Use the execCommand approach. It is an older API but it handles 
  // highlighting across different HTML elements much better than manual DOM manipulation.
  try {
    // We must temporarily enable designMode to use execCommand in some contexts
    const previousDesignMode = document.designMode;
    document.designMode = "on";
    
    // Apply the highlight
    document.execCommand("hiliteColor", false, highlightColor);
    
    // Restore the previous state
    document.designMode = previousDesignMode;
    
    // Clear the selection so the user can see the new highlight color
    selection.removeAllRanges();
  } catch (e) {
    console.warn("ClipIt: Could not apply visual highlight.", e);
  }

  return selectedText;
}

// Listen for messages sent from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_SELECTION") {
    const text = highlightSelection(request.color);
    sendResponse({ text: text });
  }
  // Return true to keep the message channel open for the async response
  return true; 
});