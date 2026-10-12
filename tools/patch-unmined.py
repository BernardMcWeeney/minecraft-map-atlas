"""Patch uNmINeD's generated index.html to load the realm editor. Safe to rerun."""
from pathlib import Path
import sys

folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
html = folder / 'index.html'
if not html.exists():
    sys.exit(f'Cannot find {html}. Run this in your uNmINeD web export folder.')
s = html.read_text(encoding='utf-8')
if 'realm-map-editor.js' in s:
    print('Already patched:', html)
    sys.exit(0)
if 'new Unmined(' not in s or 'unmined' not in s:
    sys.exit('Could not detect the usual uNmINeD initialization. See README.md for manual setup.')
if '</body>' not in s:
    sys.exit('Cannot find </body> in index.html')
addition = '''<script src="./realm-map-editor.js"></script>
<script>
  // Exported uNmINeD pages commonly create `const unmined = new Unmined(...)`.
  new RealmMapEditor(unmined);
</script>
'''
s = s.replace('</body>', addition + '</body>', 1)
html.write_text(s, encoding='utf-8')
print('Patched:', html)
