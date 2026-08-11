// content.js (Append this to your existing code)

// --- Cropping Overlay Logic ---
let isCropping = false;
let startX, startY;
let overlay, cropBox;

function startCropMode() {
    if (isCropping) return;
    isCropping = true;

    // Create the dark overlay
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '999999';
    overlay.style.cursor = 'crosshair';

    // Create the selection box
    cropBox = document.createElement('div');
    cropBox.style.position = 'fixed';
    cropBox.style.border = '2px dashed #fff';
    cropBox.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    cropBox.style.display = 'none'; // Hide initially
    cropBox.style.zIndex = '1000000';
    cropBox.style.pointerEvents = 'none'; // Let clicks pass through to the overlay

    document.body.appendChild(overlay);
    document.body.appendChild(cropBox);

    // Event Listeners for drawing the box
    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
}

function stopCropMode() {
    if (!isCropping) return;
    isCropping = false;
    
    if (overlay) document.body.removeChild(overlay);
    if (cropBox) document.body.removeChild(cropBox);
    
    overlay = null;
    cropBox = null;
}

function onMouseDown(e) {
    startX = e.clientX;
    startY = e.clientY;
    
    cropBox.style.left = startX + 'px';
    cropBox.style.top = startY + 'px';
    cropBox.style.width = '0px';
    cropBox.style.height = '0px';
    cropBox.style.display = 'block';
}

function onMouseMove(e) {
    if (!isCropping || cropBox.style.display === 'none') return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    cropBox.style.width = width + 'px';
    cropBox.style.height = height + 'px';
    cropBox.style.left = left + 'px';
    cropBox.style.top = top + 'px';
}

function onMouseUp(e) {
    if (!isCropping || cropBox.style.display === 'none') return;

    const rect = cropBox.getBoundingClientRect();
    
    // Adjust for device pixel ratio for accurate cropping later
    const dpr = window.devicePixelRatio || 1;
    const cropData = {
        left: rect.left * dpr,
        top: rect.top * dpr,
        width: rect.width * dpr,
        height: rect.height * dpr
    };

    // Remove the overlay BEFORE sending the message, so the screenshot is clean
    stopCropMode();

    // Small delay to ensure DOM is updated (overlay gone) before screenshot
    setTimeout(() => {
        // Send the coordinates to the background script
        chrome.runtime.sendMessage({ action: "CROP_COMPLETED", rect: cropData });
    }, 100);
}


// Modify the existing message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_SELECTION") {
        const text = highlightSelection(request.color);
        sendResponse({ text: text });
    } else if (request.action === "START_CROP") {
        startCropMode();
        sendResponse({ status: "started" });
    }
    return true; 
});