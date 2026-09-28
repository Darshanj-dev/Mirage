// Runs on ChatGPT and Gemini; mounts the UI and intercepts sends (M3, M4).
export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://gemini.google.com/*'],
  main() {},
});
