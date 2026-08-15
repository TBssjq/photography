import re

p = 'content.json'
s = open(p, encoding='utf-8').read()
s = re.sub(r'("date": ")\d{4}(-)', r'\g<1>2026\g<2>', s)
open(p, 'w', encoding='utf-8').write(s)
print('done')
