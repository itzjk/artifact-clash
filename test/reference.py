import itertools
import json
from collections import Counter

rows = [dict(zip(['os', 'node'], values)) for values in itertools.product(['ubuntu-latest', 'windows-latest'], ['20', '22'])]
result = {}
for variant in ['constant', 'os-only', 'unique']:
    names = ['bundle' if variant == 'constant' else 'bundle-' + row['os'] if variant == 'os-only' else 'bundle-' + row['os'] + '-' + row['node'] for row in rows]
    counts = Counter(names)
    result[variant] = {
        'names': names,
        'matrix': rows,
        'groups': [{'name': name, 'matrixIndices': [index + 1 for index, value in enumerate(names) if value == name]} for name, count in counts.items() if count > 1],
    }
print(json.dumps(result, indent=2))
