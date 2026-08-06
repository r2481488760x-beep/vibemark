const statusEl = document.getElementById("status");

async function withActiveTab(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return action(tab);
}

async function send(type) {
  statusEl.textContent = "sending";
  try {
    await withActiveTab((tab) => chrome.tabs.sendMessage(tab.id, { type }));
    statusEl.textContent = "ok";
  } catch (error) {
    statusEl.textContent = "blocked";
  }
}

document.getElementById("toggle").addEventListener("click", () => send("VIBEMARK_TOGGLE"));
