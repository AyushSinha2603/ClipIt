// content.js

// Prevent duplicate injection errors
if (typeof window.clipItLoaded === 'undefined') {
    window.clipItLoaded = true;

    // --- 1. HIGHLIGHTING LOGIC ---
    function highlightSelection(color) {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return "";

        const selectedText = selection.toString().trim();
        if (!selectedText) return "";

        const highlightColor = color || 'yellow';

        // Method 1: Wrap in a Mark element (Cleanest)
        try {
            const range = selection.getRangeAt(0);
            const mark = document.createElement('mark');
            mark.style.backgroundColor = highlightColor;
            mark.style.color = '#000';
            range.surroundContents(mark);
            selection.removeAllRanges();
        } catch (e) {
            // Method 2: Fallback for complex HTML selections
            try {
                document.designMode = "on";
                document.execCommand("hiliteColor", false, highlightColor);
                document.designMode = "off";
                selection.removeAllRanges();
            } catch (fallbackErr) {
                console.warn("ClipIt: Could not apply visual highlight.");
            }
        }
        return selectedText;
    }

    // --- 2. CROPPING OVERLAY LOGIC ---
    let isCropping = false;
    let startX, startY;
    let overlay, cropBox;

    function startCropMode() {
        if (isCropping) return;
        isCropping = true;

        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);z-index:2147483646;cursor:crosshair;';
        
        cropBox = document.createElement('div');
        cropBox.style.cssText = 'position:fixed;border:2px dashed #fff;background:rgba(255,255,255,0.1);z-index:2147483647;display:none;pointer-events:none;';

        document.body.appendChild(overlay);
        document.body.appendChild(cropBox);

        overlay.addEventListener('mousedown', onMouseDown);
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
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
        cropBox.style.width = Math.abs(currentX - startX) + 'px';
        cropBox.style.height = Math.abs(currentY - startY) + 'px';
        cropBox.style.left = Math.min(currentX, startX) + 'px';
        cropBox.style.top = Math.min(currentY, startY) + 'px';
    }

    function onMouseUp(e) {
        if (!isCropping || cropBox.style.display === 'none') return;

        const rect = cropBox.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        const cropData = {
            left: rect.left * dpr,
            top: rect.top * dpr,
            width: rect.width * dpr,
            height: rect.height * dpr
        };

        if (overlay) overlay.remove();
        if (cropBox) cropBox.remove();
        overlay = null; cropBox = null;
        isCropping = false;

        setTimeout(() => {
            chrome.runtime.sendMessage({ action: "CROP_COMPLETED", rect: cropData });
        }, 150); // slight delay to ensure UI updates before screenshot
    }

    // --- 3. MESSAGE LISTENER ---
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
}