#!/usr/bin/env bash
# Detect dangerous Unicode characters (Trojan Source attack prevention)
# Checks: bidirectional overrides, zero-width characters, BOM in wrong places
set -euo pipefail

DANGEROUS_CHARS='\xe2\x80\x8e|\xe2\x80\x8f|\xe2\x80\xaa|\xe2\x80\xab|\xe2\x80\xac|\xe2\x80\xad|\xe2\x80\xae|\xe2\x81\xa6|\xe2\x81\xa7|\xe2\x81\xa8|\xe2\x81\xa9|\xe2\x80\x8b|\xe2\x80\x8c|\xe2\x80\x8d|\xef\xbb\xbf'

found=0
while IFS= read -r file; do
  if grep -Pn "$DANGEROUS_CHARS" "$file" 2>/dev/null; then
    echo "⚠️  Dangerous Unicode in: $file"
    found=1
  fi
done < <(find packages scripts src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs" -o -name "*.json" -o -name "*.md" \) 2>/dev/null | grep -v node_modules | grep -v .vertz | grep -v dist)

if [ "$found" -eq 1 ]; then
  echo ""
  echo "❌ Trojan Source check FAILED"
  echo "Found dangerous Unicode characters. See https://trojansource.codes/"
  exit 1
fi

echo "✅ Trojan Source check passed"
