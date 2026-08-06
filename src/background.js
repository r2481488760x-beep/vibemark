chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ vibeMarkInstalledAt: Date.now() });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-vibemark") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "VIBEMARK_TOGGLE" }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "VIBEMARK_CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, dataUrl });
    });
    return true;
  }

  if (message?.type === "VIBEMARK_DOWNLOAD") {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      saveAs: true
    });
    sendResponse({ ok: true });
  }
});
