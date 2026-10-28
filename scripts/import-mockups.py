"""Turn the approved mockup pages into Astro pages.
Each page's body is kept exactly as designed (in src/html/) and wrapped by the shared Base layout."""
import re, sys, os, json
SRC = sys.argv[1]; OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pages = sorted(f for f in os.listdir(SRC) if f.endswith('.html') and not f.startswith('index.v'))
meta = {}
for f in pages:
    s = open(os.path.join(SRC, f), encoding='utf-8').read()
    name = f[:-5]
    if f == 'index.html':
        title = re.search(r'<title>(.*?)</title>', s).group(1)
        style = re.search(r'<style>.*?</style>', s, re.S).group(0)
        body = s[s.index('</style>') + len('</style>'):]
        body = re.sub(r'<div class="proto".*?</div>\n', '', body, count=1, flags=re.S)
        body = re.sub(r'<div class="pr-menu".*?</div>(?=\n)', '', body, count=1, flags=re.S)
        head, desc, extra = style, 'A free AI course, built around your business. Plain-English lessons for UK owners, plus a free AI audit and done-for-you AI.', ''
        attrs = ' data-page="index.html"'
    else:
        head_html, rest = s.split('<body', 1)
        title = re.search(r'<title>(.*?)</title>', head_html).group(1)
        m = re.search(r'<meta name="description" content="(.*?)">', head_html); desc = m.group(1) if m else ''
        extra = ''.join(re.findall(r'<meta name="robots"[^>]*>', head_html))
        head = ''.join(re.findall(r'<style>.*?</style>', head_html, re.S))
        attrs = rest[:rest.index('>')]
        body = rest[rest.index('>') + 1:rest.rindex('</body>')]
    open(os.path.join(OUT, 'src/html', name + '.head.html'), 'w', encoding='utf-8').write(extra + head)
    open(os.path.join(OUT, 'src/html', name + '.body.html'), 'w', encoding='utf-8').write(body)
    page_attr = re.search(r'data-page="([^"]+)"', attrs)
    meta[name] = {'title': title, 'description': desc, 'page': page_attr.group(1) if page_attr else f}
    route = 'index' if name == 'index' else name
    open(os.path.join(OUT, 'src/pages', route + '.astro'), 'w', encoding='utf-8').write(f"""---
import Base from '../layouts/Base.astro';
import head from '../html/{name}.head.html?raw';
import body from '../html/{name}.body.html?raw';
---
<Base title={{{json.dumps(title)}}} description={{{json.dumps(desc)}}} page={{{json.dumps(meta[name]['page'])}}} head={{head}} body={{body}} />
""")
print(json.dumps(meta, indent=1)[:1500])
