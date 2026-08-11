// content.js

// Function to apply a span with a background color around the selected text
function highlightSelection(color) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();

    if (!selectedText) return null;

    // Create a span element to wrap the text
    const span = document.createElement('span');
    span.style.backgroundColor = color;
    span.style.color = '#000'; // Ensure text is readable on light highlights

    try {
        // Surround the selected content with the span
        range.surroundContents(span);
        // Clear the selection so the user sees the new highlight
        selection.removeAllRanges();
    } catch (e) {
        console.warn("Could not apply highlight to complex DOM structure.", e);
        // Even if we can't wrap it (e.g., selection crosses paragraphs), 
        // we still want to return the text so it saves to the notes.
    }

    return selectedText;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_SELECTION") {
        // If a color was passed, attempt to highlight the text on the page
        let text = "";
        if (request.color) {
            text = highlightSelection(request.color);
        } else {
            text = window.getSelection().toString().trim();
        }

        sendResponse({ text: text });
    }
    return true; // Keep the message channel open for async response
});