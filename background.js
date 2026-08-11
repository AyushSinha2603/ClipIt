// background.js

// Function to crop an image using an offscreen canvas
async function cropImage(dataUrl, rect) {
    return new Promise((resolve) => {
        // Since Manifest V3 service workers don't have a DOM, we use OffscreenCanvas
        // However, for simplicity and compatibility in MV3 without extra setup, 
        // we will fetch the image and crop it.
        fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => createImageBitmap(blob))
            .then(imageBitmap => {
                
                // Handle device pixel ratio (retina displays)
                // We'll assume a standard pixel ratio of 1 here, but this might need 
                // adjustment if you find crops are misaligned on high-res screens.
                // A more robust solution requires passing window.devicePixelRatio from content.js
                
                const canvas = new OffscreenCanvas(rect.width, rect.height);
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(
                    imageBitmap,
                    rect.left, rect.top, rect.width, rect.height, // Source rectangle
                    0, 0, rect.width, rect.height // Destination rectangle
                );
                
                canvas.convertToBlob({ type: "image/png" })
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = function() {
                        resolve(reader.result); // This is the base64 cropped image
                    }
                    reader.readAsDataURL(blob);
                });
            });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "CROP_COMPLETED") {
        
        // 1. Capture the visible tab
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, async (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }

            // 2. Crop the image based on the coordinates received
            const croppedDataUrl = await cropImage(dataUrl, request.rect);

            // 3. Save to storage
            chrome.storage.local.get(['clipSession'], (result) => {
                let session = result.clipSession || { title: '', tags: '', events: [] };
                if (!session.events) session.events = [];
                
                session.events.push({
                    id: Date.now(),
                    type: 'screenshot',
                    data: croppedDataUrl
                });

                chrome.storage.local.set({ clipSession: session }, () => {
                    // Send a message back to the popup (if it's still open) to refresh
                    chrome.runtime.sendMessage({ action: "REFRESH_TIMELINE" });
                });
            });
        });
    }
});