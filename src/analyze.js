import { parseDocument, LineCounter, isMap, isSeq, isScalar, isAlias, isPair } from 'yaml';

export const LIMITS = Object.freeze({ bytes: 1_048_576, nodes: 50_000, depth: 100, aliases: 0, combinations: 4096, matrixCells: 65_536, producers: 16_384, expandedBytes: 8_388_608 });
export const LIMITATIONS = Object.freeze([
  'Direct actions/upload-artifact@v4 and @v7 steps only; other action internals are not inventoried.',
  'Literal string matrix axes only; include/exclude and dynamic matrices are unresolved.',
  'Names support literal text and matrix.key interpolation only.',
  'Explicit conditions are not evaluated; uploads may never execute or find files.',
  'Names use exact string comparison, not every service equivalence or validity rule.',
  'Shared names are candidates, not guaranteed HTTP errors; overwrite may delete results.',
]);

const scalar = node => isScalar(node) ? node.value : undefined;
const field = (node, key) => isMap(node) ? node.items.find(pair => scalar(pair.key) === key)?.value : undefined;
const has = (node, key) => isMap(node) && node.items.some(pair => scalar(pair.key) === key);

export class InputError extends Error {
  constructor(message, location = { line: 1, column: 1 }) {
    super(message);
    this.location = location;
  }
}

export function invalidReport(file, message, location) {
  return {
    schemaVersion: 1, file, status: 'invalid-input', exitCode: 3,
    producers: [], groups: [],
    coverage: { complete: false, uploadSteps: 0, resolvedProducers: 0, unresolvedProducers: 0,
      diagnostics: [{ code: 'invalid-input', message, location: location ?? { line: 1, column: 1 } }] },
    limits: LIMITS, limitations: LIMITATIONS,
  };
}

function parse(source) {
  if (Buffer.byteLength(source) > LIMITS.bytes) throw new InputError(`Input exceeds ${LIMITS.bytes} bytes.`);
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, uniqueKeys: true, strict: true, version: '1.2' });
  const atOffset = offset => {
    const { line, col } = lineCounter.linePos(offset);
    return { line, column: col };
  };
  const locate = node => atOffset(node?.range?.[0] ?? 0);
  if (doc.errors.length) {
    const error = doc.errors[0];
    throw new InputError(error.message.split('\n')[0], atOffset(error.pos?.[0] ?? 0));
  }
  if (doc.warnings.length) throw new InputError(doc.warnings[0].message.split('\n')[0], atOffset(doc.warnings[0].pos?.[0] ?? 0));
  const stack = [[doc.contents, 0]];
  let nodes = 0;
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node) continue;
    if (++nodes > LIMITS.nodes) throw new InputError(`YAML exceeds ${LIMITS.nodes} nodes.`, locate(node));
    if (depth > LIMITS.depth) throw new InputError(`YAML exceeds depth ${LIMITS.depth}.`, locate(node));
    if (isAlias(node)) throw new InputError('YAML aliases are not supported (limit: 0).', locate(node));
    if (isMap(node)) {
      for (const pair of node.items) {
        if (typeof scalar(pair.key) !== 'string') throw new InputError('Mapping keys must be strings.', locate(pair.key));
        if (scalar(pair.key) === '<<') throw new InputError('YAML merge keys are not supported.', locate(pair.key));
        stack.push([pair, depth + 1]);
      }
    } else if (isSeq(node)) {
      for (const child of node.items) stack.push([child, depth + 1]);
    } else if (isPair(node)) {
      stack.push([node.key, depth], [node.value, depth]);
    }
  }
  if (!isMap(doc.contents) || !isMap(field(doc.contents, 'jobs')) || !field(doc.contents, 'jobs').items.length) {
    throw new InputError('Expected a workflow mapping with a nonempty jobs mapping.', locate(doc.contents));
  }
  return { root: doc.contents, locate };
}

function interpolate(template, matrix, byteBudget) {
  const parts = [];
  let cursor = 0;
  let bytes = 0;
  for (const match of template.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    const key = /^\s*matrix\.([A-Za-z_][A-Za-z0-9_-]*)\s*$/.exec(match[1]);
    if (!key || !matrix || !Object.hasOwn(matrix, key[1])) return { name: null, reason: 'unsupported-expression' };
    const literal = template.slice(cursor, match.index);
    if (literal.includes('${{')) return { name: null, reason: 'unsupported-expression' };
    const value = matrix[key[1]];
    bytes += Buffer.byteLength(literal) + Buffer.byteLength(value);
    if (bytes > byteBudget) return { name: null, reason: 'expanded-size-limit' };
    parts.push(literal, value);
    cursor = match.index + match[0].length;
  }
  const tail = template.slice(cursor);
  if (tail.includes('${{')) return { name: null, reason: 'unsupported-expression' };
  bytes += Buffer.byteLength(tail);
  if (bytes > byteBudget) return { name: null, reason: 'expanded-size-limit' };
  parts.push(tail);
  return { name: parts.join(''), bytes };
}

function booleanInput(node, fallback) {
  if (node === undefined) return fallback;
  const value = scalar(node);
  if (value === true || ['true', 'True', 'TRUE'].includes(value)) return true;
  if (value === false || ['false', 'False', 'FALSE'].includes(value)) return false;
  return 'unknown';
}

export function analyze(source, file = 'workflow.yml') {
  try {
    return analyzeWorkflow(source, file);
  } catch (error) {
    return invalidReport(file, error instanceof InputError ? error.message : `Unable to parse workflow: ${error.message}`, error.location);
  }
}

function analyzeWorkflow(source, file) {
  const { root, locate } = parse(source);
  const producers = [];
  const diagnostics = [];
  let uploadSteps = 0;
  let combinationBudget = LIMITS.combinations;
  let cellBudget = LIMITS.matrixCells;
  let stringBudget = LIMITS.expandedBytes;
  const diagnostic = (code, message, node, job = null, stepIndex = null) => {
    diagnostics.push({ code, message, location: locate(node), job, stepIndex });
  };
  const trigger = field(root, 'on');
  if (has(trigger, 'workflow_call') || scalar(trigger) === 'workflow_call' || (isSeq(trigger) && trigger.items.some(n => scalar(n) === 'workflow_call'))) {
    diagnostic('reusable-workflow', 'Reusable workflow execution is outside this subset.', trigger);
  }

  function combinations(job, jobId) {
    const strategy = field(job, 'strategy');
    if (has(job, 'strategy') && !isMap(strategy)) {
      diagnostic('unsupported-strategy', 'Strategy must be a literal mapping.', strategy, jobId);
      return null;
    }
    if (!has(strategy, 'matrix')) return [{}];
    const matrix = field(strategy, 'matrix');
    if (!isMap(matrix) || !matrix.items.length) {
      diagnostic('unsupported-matrix', 'Matrix must contain literal string axes.', matrix, jobId);
      return null;
    }
    const axes = [];
    let size = 1;
    let supported = true;
    for (const pair of matrix.items) {
      const key = scalar(pair.key);
      if (key === 'include' || key === 'exclude') {
        diagnostic('matrix-modifier', `Matrix ${key} is outside this subset.`, pair.key, jobId);
        supported = false;
      } else if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || !isSeq(pair.value) || !pair.value.items.length || pair.value.items.some(n => typeof scalar(n) !== 'string' || scalar(n).includes('${{'))) {
        diagnostic('unsupported-axis', `Axis ${key} must be a nonempty literal sequence of strings.`, pair.value, jobId);
        supported = false;
      } else {
        axes.push([key, pair.value.items.map(scalar)]);
        size *= pair.value.items.length;
      }
    }
    if (!supported) return null;
    if (size > combinationBudget) {
      diagnostic('combination-limit', `Matrix exceeds remaining workflow combination budget (${combinationBudget} of ${LIMITS.combinations}).`, matrix, jobId);
      return null;
    }
    if (size * axes.length > cellBudget) {
      diagnostic('matrix-cell-limit', `Matrix exceeds remaining expanded cell budget (${cellBudget} of ${LIMITS.matrixCells}).`, matrix, jobId);
      return null;
    }
    combinationBudget -= size;
    cellBudget -= size * axes.length;
    const strides = new Array(axes.length);
    let stride = 1;
    for (let i = axes.length - 1; i >= 0; i--) {
      strides[i] = stride;
      stride *= axes[i][1].length;
    }
    return Array.from({ length: size }, (_, index) => Object.fromEntries(axes.map(([key, values], axis) => [key, values[Math.floor(index / strides[axis]) % values.length]])));
  }

  for (const pair of field(root, 'jobs').items) {
    const jobId = scalar(pair.key);
    const job = pair.value;
    if (!isMap(job)) throw new InputError(`Job ${jobId} must be a mapping.`, locate(job));
    if (has(job, 'if')) diagnostic('explicit-if', 'Job condition is not evaluated.', field(job, 'if'), jobId);
    if (has(job, 'uses')) diagnostic('reusable-workflow', 'Reusable workflow calls are not expanded.', field(job, 'uses'), jobId);
    const steps = field(job, 'steps');
    if (steps === undefined && has(job, 'uses')) continue;
    if (!isSeq(steps)) throw new InputError(`Job ${jobId} must have a steps sequence or reusable workflow call.`, locate(job));
    const rows = combinations(job, jobId);
    for (let index = 0; index < steps.items.length; index++) {
      const step = steps.items[index];
      const stepIndex = index + 1;
      if (!isMap(step)) throw new InputError('Each step must be a mapping.', locate(step));
      if (has(step, 'if')) diagnostic('explicit-if', 'Step condition is not evaluated.', field(step, 'if'), jobId, stepIndex);
      const usesNode = field(step, 'uses');
      const uses = scalar(usesNode);
      if (has(step, 'uses') && (typeof uses !== 'string' || uses.includes('${{'))) {
        diagnostic('unknown-action', 'Action reference cannot be identified statically.', usesNode, jobId, stepIndex);
        continue;
      }
      if (typeof uses !== 'string') continue;
      const actionPath = uses.split('@')[0].split(/[\\/]+/).filter(Boolean);
      if (actionPath.length !== 2 || actionPath[0].toLowerCase() !== 'actions' || actionPath[1].toLowerCase() !== 'upload-artifact') continue;
      uploadSteps++;
      const version = uses.slice(uses.indexOf('@') + 1);
      const verified = /^actions\/upload-artifact@/i.test(uses) && ['v4', 'v7'].includes(version);
      if (!verified) diagnostic('unsupported-action-ref', 'Only exact @v4 and @v7 references are verified.', usesNode, jobId, stepIndex);
      const inputs = field(step, 'with');
      let validInputs = !has(step, 'with') || isMap(inputs);
      if (!validInputs) diagnostic('unsupported-inputs', 'Action inputs must be a literal mapping.', inputs, jobId, stepIndex);
      if (isMap(inputs)) {
        for (const input of inputs.items) {
          const key = scalar(input.key);
          if (/^(name|overwrite|archive)$/i.test(key) && key !== key.toLowerCase()) {
            diagnostic('noncanonical-input', 'Name, overwrite and archive input keys must use lowercase in this subset.', input.key, jobId, stepIndex);
            validInputs = false;
          }
        }
      }
      const nameNode = field(inputs, 'name');
      const template = has(inputs, 'name') ? scalar(nameNode) : 'artifact';
      const nameLocation = locate(nameNode ?? usesNode);
      const overwrite = booleanInput(field(inputs, 'overwrite'), false);
      if (overwrite === 'unknown') diagnostic('unknown-overwrite', 'Overwrite is not a literal boolean.', field(inputs, 'overwrite'), jobId, stepIndex);
      const archive = booleanInput(field(inputs, 'archive'), true);
      const archiveSupported = version !== 'v7' || archive === true;
      if (!archiveSupported) diagnostic('unsupported-archive', 'v7 archive must be true; otherwise the uploaded file determines the name.', field(inputs, 'archive'), jobId, stepIndex);
      if (typeof template !== 'string' || template === '') {
        diagnostic(template === '' || template === null ? 'empty-name' : 'unsupported-name', 'Explicit name must be a nonempty string; runtime behavior is not inferred.', nameNode ?? inputs, jobId, stepIndex);
      }
      let plannedRows = rows ?? [null];
      if (producers.length + plannedRows.length > LIMITS.producers) {
        diagnostic('producer-limit', `Upload would exceed ${LIMITS.producers} producers; remaining instances are not expanded.`, usesNode, jobId, stepIndex);
        plannedRows = [null];
        if (producers.length >= LIMITS.producers) continue;
      }
      const reported = new Set();
      for (let matrixIndex = 0; matrixIndex < plannedRows.length; matrixIndex++) {
        const matrix = plannedRows[matrixIndex];
        const baseBytes = Buffer.byteLength(JSON.stringify([matrix, template, uses, jobId])) + 256;
        if (baseBytes > stringBudget) {
          diagnostic('expanded-size-limit', `Expanded strings exceed ${LIMITS.expandedBytes} bytes; remaining instances of this step are omitted.`, usesNode, jobId, stepIndex);
          break;
        }
        const expansion = verified && validInputs && archiveSupported && typeof template === 'string' && template !== '' && matrix !== null ? interpolate(template, matrix, stringBudget - baseBytes) : { name: null };
        let name = expansion.name;
        if (expansion.reason && !reported.has(expansion.reason)) {
          diagnostic(expansion.reason, expansion.reason === 'unsupported-expression' ? 'Name may interpolate existing matrix.key values only.' : `Expanded name would exceed remaining string budget (${stringBudget - baseBytes} bytes).`, nameNode ?? usesNode, jobId, stepIndex);
          reported.add(expansion.reason);
        }
        if (name === '') {
          diagnostic('empty-name', 'Name resolves to an empty string; runtime behavior is not inferred.', nameNode ?? usesNode, jobId, stepIndex);
          name = null;
        }
        if (name !== null && name.trim() !== name) {
          if (!reported.has('name-whitespace')) diagnostic('name-whitespace', 'Names with leading or trailing whitespace require action input normalization, outside literal comparison.', nameNode ?? usesNode, jobId, stepIndex);
          reported.add('name-whitespace');
          name = null;
        }
        stringBudget -= baseBytes + (name === null ? 0 : expansion.bytes);
        producers.push({ id: `p${producers.length + 1}`, job: jobId, stepIndex,
          location: locate(usesNode), nameLocation, action: uses, matrix,
          matrixIndex: matrix === null ? null : matrixIndex + 1,
          template: typeof template === 'string' ? template : null,
          name, resolution: name === null ? 'unresolved' : 'resolved', overwrite,
          conditional: has(job, 'if') || has(step, 'if') });
      }
    }
  }
  const byName = new Map();
  for (const producer of producers) {
    if (producer.name === null) continue;
    if (!byName.has(producer.name)) byName.set(producer.name, []);
    byName.get(producer.name).push(producer);
  }
  const groups = [...byName].filter(([, members]) => members.length > 1).map(([name, members]) => ({
    name, kind: members.some(p => p.overwrite === true) ? 'shared-name-with-overwrite' : 'shared-name-candidate', members,
  }));
  const complete = diagnostics.length === 0;
  return { schemaVersion: 1, file, status: !complete ? 'incomplete' : groups.length ? 'candidates-found' : 'no-shared-names',
    exitCode: !complete ? 2 : groups.length ? 1 : 0, producers, groups,
    coverage: { complete, uploadSteps, resolvedProducers: producers.filter(p => p.name !== null).length,
      unresolvedProducers: producers.filter(p => p.name === null).length, diagnostics },
    limits: LIMITS, limitations: LIMITATIONS };
}
