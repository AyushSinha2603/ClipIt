# 📝 ClipIt - Web Research to PDF

ClipIt is a lightweight, privacy-focused Chrome extension designed for students, researchers, and professionals. It allows you to seamlessly capture cropped screenshots, highlight text on web pages, and add manual notes while browsing. 

Everything is saved into a persistent, chronological timeline and can be exported into a clean, formatted PDF with a single click. **100% local, no servers, no sign-ups.**

## ✨ Features

* **✂️ Drag-to-Crop Screenshots:** Don't capture the whole screen. Draw a box to save exactly what you need.
* **🖍️ Web Text Highlighting:** Select text on any webpage, choose a color, and it instantly saves to your timeline as a bullet point.
* **📝 Quick Scratchpad:** Add your own thoughts, context, or summaries manually at any time.
* **⏳ Chronological Timeline:** Your screenshots and notes are interleaved in the exact order you captured them, making your thought process easy to follow.
* **💾 Persistent Memory:** Accidentally closed the popup? Switched tabs? Restarted Chrome? Your session is safely auto-saved in your browser's local storage until you click "Reset".
* **📄 One-Click PDF Export:** Compile your entire research session (title, URL source, tags, notes, and images) into a beautifully formatted PDF document.

## 🚀 Installation (Developer Mode)

Since this extension is not currently on the Chrome Web Store, you can install it locally:

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Turn on **Developer mode** (toggle switch in the top right corner).
4. Click the **Load unpacked** button.
5. Select the folder containing this repository.
6. *Tip: Pin the extension to your toolbar for easy access!*

## 🛠️ How to Use

1. **Start a Session:** Click the ClipIt icon in your toolbar. Give your session a Title and some Tags.
2. **Highlight Text:** Select any text on a webpage, open the ClipIt popup, and click one of the colored circles.
3. **Crop an Image:** Click "Crop Screen", draw a box around the area you want to save, and it will be added to your timeline.
4. **Manage Timeline:** Open the popup to view your chronological timeline. You can delete individual items using the red 'X' button.
5. **Export:** When you are done researching, click **Download Session as PDF**. 
6. **Start Fresh:** Click **Reset Session** to clear your storage and start a new document.

## 💻 Tech Stack

* **Manifest V3:** Built using the latest Chrome Extension standards (Service Workers, modern permissions).
* **Vanilla JavaScript, HTML, CSS:** No heavy front-end frameworks.
* **[jsPDF](https://github.com/parallax/jsPDF):** Client-side PDF generation.

## 🔒 Privacy

ClipIt respects your privacy. All data, screenshots, and PDFs are processed and stored **locally on your device**. No data is ever sent to an external server.
