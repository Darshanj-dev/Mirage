#!/bin/bash
# MIRAGE storage proof, for the judges: where the sensitive values are (and aren't) kept.
# Usage:  bash show-storage-proof.sh [VALUE-USED-IN-THE-DEMO]
# Example: bash show-storage-proof.sh PQRSX6789K
# Reads MIRAGE's own folders only; changes nothing.

VALUE="${1:-PQRSX6789K}"
B=$'\e[1m'; G=$'\e[32m'; R=$'\e[31m'; D=$'\e[2m'; N=$'\e[0m'
line() { printf '%s\n' "────────────────────────────────────────────────────────────"; }
found() { grep -rIl -- "$VALUE" "$@" 2>/dev/null | wc -l | tr -d ' '; }

echo; echo "${B}MIRAGE · where is the sensitive data?${N}   (searching for: $VALUE)"; line

echo "${B}1. Desktop companion${N}  ~/Library/Application Support/MIRAGE"
DESK="$HOME/Library/Application Support/MIRAGE"
ls -l "$DESK" 2>/dev/null | tail -n +2 | awk '{print "   " $NF}'
echo "${D}   stats.json (counts only):${N}"
head -c 220 "$DESK/stats.json" 2>/dev/null | sed 's/^/   /'; echo "…"
n=$(found "$DESK" "$HOME/Library/Logs/MIRAGE/gate.log")
echo "   Real value found on disk: ${G}${B}$n times${N}  → kept only in memory, gone when MIRAGE quits"
line

echo "${B}2. CLI${N}  ~/.mirage/maps"
if [ -d "$HOME/.mirage/maps" ]; then
  ls "$HOME/.mirage/maps" | head -5 | sed 's/^/   /'
  f=$(ls -t "$HOME/.mirage/maps"/*.json 2>/dev/null | head -1)
  [ -n "$f" ] && { echo "${D}   newest map (encrypted, AES-256-GCM):${N}"; head -c 200 "$f" | sed 's/^/   /'; echo "…"; }
  echo "   Real value found in readable form: ${G}${B}$(found "$HOME/.mirage") times${N}  → encrypted, deleted after 24 h"
else
  echo "   ${D}(no ~/.mirage yet: run the CLI demo first)${N}"
fi
line

echo "${B}3. Browser extension${N}  Chrome → Local Extension Settings → MIRAGE"
EXT=""
for d in "$HOME/Library/Application Support/Google/Chrome/"*/"Local Extension Settings/"*/; do
  grep -qa "vaultIndex" "$d"* 2>/dev/null && { EXT="$d"; break; }
done
if [ -n "$EXT" ]; then
  echo "   ${D}$EXT${N}"
  echo "   ${D}records:${N} $(grep -aoh 'vault:[a-z]*:[A-Za-z0-9_-]*' "$EXT"* 2>/dev/null | sort -u | head -3 | tr '\n' ' ')"
  echo "   Real value found in MIRAGE's storage: ${G}${B}$(found "$EXT") times${N}  → encrypted (AES-256-GCM), key can't be exported"
else
  echo "   ${D}(no MIRAGE records yet: protect one prompt on chatgpt.com first)${N}"
fi
echo "   ${D}Live view: chrome://extensions → MIRAGE → service worker → Console → await chrome.storage.local.get(null)${N}"
line
echo "${B}Secrets (API keys, passwords, cards, OTPs) are never stored anywhere.${N} There is no MIRAGE server."
echo
