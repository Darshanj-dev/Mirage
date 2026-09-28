# MIRAGE: the AI privacy firewall

Hides your personal details before they reach ChatGPT or Gemini, blocks secrets like API keys, and puts the real details back in the reply, on your device.

> Work in progress. See PROGRESS.md for the current milestone; the full README comes in M6.

## Develop

```
npm install
npm test          # unit tests
npm run dev       # opens Chrome with MIRAGE loaded
npm run build     # production build in .output/chrome-mv3
```

To test in your own logged-in Chrome: run `npm run build`, open `chrome://extensions`, turn on Developer mode, click Load unpacked, and choose `.output/chrome-mv3`.
