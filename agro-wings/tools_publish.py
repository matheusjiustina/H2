# Turn dist/index.html into the Artifact page body (the viewer adds its own
# doctype/head/body skeleton with charset + viewport-fit=cover).
import re, sys
src = open('dist/index.html', encoding='utf8').read()
out = src
out = re.sub(r'<!doctype html>\s*', '', out, flags=re.I)
out = re.sub(r'<html[^>]*>\s*', '', out, flags=re.I)
out = re.sub(r'</html>\s*', '', out, flags=re.I)
out = re.sub(r'<head>\s*', '', out, flags=re.I)
out = re.sub(r'</head>\s*', '', out, flags=re.I)
out = re.sub(r'<body>\s*', '', out, flags=re.I)
out = re.sub(r'</body>\s*', '', out, flags=re.I)
out = re.sub(r'<meta charset="utf-8"\s*/?>\s*', '', out, flags=re.I)
out = re.sub(r'<meta name="viewport"[^>]*>\s*', '', out, flags=re.I)
assert out.lstrip().startswith('<title>'), out[:200]
open(sys.argv[1], 'w', encoding='utf8').write(out)
print('wrote', sys.argv[1], len(out), 'bytes; title at', out.find('<title>'))
