// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "CROP_COMPLETED") {
        
        // 1. Take a screenshot of the entire visible tab
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, async (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }

            // Prevent errors if user just clicked without dragging
            if (request.rect.width <= 0 || request.rect.height <= 0) return;

            try {
                // 2. Load the screenshot into memory
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                const imageBitmap = await createImageBitmap(blob);
                
                // 3. Create an invisible canvas to crop the image
                const canvas = new OffscreenCanvas(request.rect.width, request.rect.height);
                const ctx = canvas.getContext('2d');
                
                // Draw only the cropped portion onto our canvas
                ctx.drawImage(
                    imageBitmap,
                    request.rect.left, request.rect.top, request.rect.width, request.rect.height,
                    0, 0, request.rect.width, request.rect.height
                );
                
                // 4. Convert cropped canvas back to a base64 image string
                const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
                const reader = new FileReader();
                reader.onloadend = function() {
                    const base64data = reader.result;
                    
                    // 5. Save the cropped image to our timeline storage
                    chrome.storage.local.get(['clipSession'], (res) => {
                        let session = res.clipSession || { title: '', tags: '', events: [] };
                        if (!session.events) session.events = [];
                        
                        session.events.push({
                            id: Date.now(),
                            type: 'screenshot',
                            data: base64data
                        });
                        
                        chrome.storage.local.set({ clipSession: session });
                    });
                }
                reader.readAsDataURL(croppedBlob);
            } catch (err) {
                console.error("Error cropping image:", err);
            }
        });
    }
});