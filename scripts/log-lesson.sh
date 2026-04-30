#!/bin/bash
echo "=== Log a Lesson to .cline/memory/lessons.md ==="
echo ""
echo "Type? [1=🔴 gotcha  2=🟡 fix  3=🟤 decision  4=⚖️ trade-off  5=🟢 change]"
read TYPE_NUM
case $TYPE_NUM in
  1) ICON="🔴 gotcha" ;;
  2) ICON="🟡 fix" ;;
  3) ICON="🟤 decision" ;;
  4) ICON="⚖️ trade-off" ;;
  5) ICON="🟢 change" ;;
  *) ICON="🟢 change" ;;
esac
echo "Short title (e.g. 'pnpm install failed in WSL2 — needed node 22 via nvm'):"
read TITLE
echo "Affected files (comma-separated, or 'none'):"
read FILES
echo "Keywords (e.g. 'docker, wsl2, pnpm, nvm, ports'):"
read CONCEPTS
echo "What happened and why does it matter? (one paragraph):"
read NARRATIVE
DATE=$(date +%Y-%m-%d)
ENTRY="\n## $DATE — $ICON $TITLE\n- Type:      $ICON\n- Phase:     manual entry\n- Files:     $FILES\n- Concepts:  $CONCEPTS\n- Narrative: $NARRATIVE\n"
echo -e "$ENTRY" >> .cline/memory/lessons.md
echo ""
echo "✅ Lesson logged to .cline/memory/lessons.md"
