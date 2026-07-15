import json, re, sys
sys.path.insert(0, '/home/runner/work/herb/herb/.herb_run_tmp')
from scores import SCORES

rows = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/all_rows.json'))

def segment(tech, sectors, name):
    t = f"{tech or ''} {sectors or ''} {name}".lower()
    if any(k in t for k in ['sensor', 'monitoring', 'ai-driven', 'ai sensing', 'artificial intelligence', 'analytics', 'automation', 'robotic', 'high-throughput', 'screening', 'lab automation']):
        return 'Bioprocess tools, sensors & industry AI'
    if any(k in t for k in ['ferment', 'brewery', 'brew', 'yeast', 'mycel', 'mycoprotein']) and any(k in t for k in ['protein', 'dairy', 'egg', 'milk', 'food', 'nutrition', 'ingredient', 'flavor', 'fragrance', 'aroma', 'sugar', 'omega']):
        return 'Precision fermentation & food/nutrition ingredients'
    if any(k in t for k in ['food', 'nutrition', 'protein', 'dairy', 'seafood', 'meat', 'egg', 'ingredient']):
        return 'Precision fermentation & food/nutrition ingredients'
    if any(k in t for k in ['chemical', 'polymer', 'monomer', 'ammonia', 'acrylonitrile', 'levulinic', 'dye', 'indigo']):
        return 'Specialty chemicals'
    if any(k in t for k in ['material', 'fiber', 'membrane', 'leather', 'textile', 'nanomaterial', '3d print', 'plastic']):
        return 'Advanced materials'
    if any(k in t for k in ['synthetic biology', 'synbio', 'genetic', 'gene ', 'dna', 'peptide', 'enzyme', 'biomanufacturing', 'cell-free', 'protein engineering']):
        return 'Synthetic biology & biomanufacturing platforms'
    if any(k in t for k in ['ferment', 'brewery', 'brew', 'yeast', 'mycel', 'mycoprotein']):
        return 'Bioprocess tools, sensors & industry AI'
    return 'Industrial biotech & industrial climate'

for r in rows:
    name = r['name']
    if name in SCORES:
        score, rationale, question = SCORES[name]
        r['score'] = score
        r['fit_notes'] = f"Fit: {rationale} | Q: {question}"
    else:
        r['score'] = None
        r['fit_notes'] = None
    r['segment'] = segment(r.get('tech'), r.get('sectors'), name)

json.dump(rows, open('/home/runner/work/herb/herb/.herb_run_tmp/rows_final.json', 'w'), indent=1)

scored = [r for r in rows if r['score'] is not None]
scored.sort(key=lambda r: -r['score'])
print(f"Scored: {len(scored)}")
print("\nTop 12 by score:")
for r in scored[:12]:
    print(f"  {r['score']:2d}  {r['name']}  ({r.get('domain')})")

from collections import Counter
seg_counts = Counter(r['segment'] for r in rows)
print("\nSegment distribution:")
for s, c in seg_counts.most_common():
    print(f"  {s}: {c}")
