const $ = id => document.getElementById(id);
let activeController;
let requestEpoch = 0;
const consentByActor = new Map([['mira', true], ['noor', true]]);
const pendingSaves = new Map();
const status = message => { $('status').textContent = message; };
const invalidate = () => {
  requestEpoch += 1;
  activeController?.abort();
  activeController = undefined;
};
async function action(tool, args = {}) {
  invalidate();
  const epoch = requestEpoch;
  const actor = $('actor').value;
  const controller = new AbortController();
  activeController = controller;
  status('Working…');
  try {
    const response = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor, tool, args, fault: $('fault').value }), signal: controller.signal });
    const result = await response.json();
    if (epoch !== requestEpoch || actor !== $('actor').value) return;
    if (!response.ok) status(`${result.message} (${result.code})`);
    return result;
  } catch (failure) {
    if (epoch === requestEpoch && actor === $('actor').value) status(failure.name === 'AbortError' ? 'Request cancelled. A write may still complete; retry using the same request ID.' : 'Network error. Retry safely.');
  } finally {
    if (epoch === requestEpoch) activeController = undefined;
  }
}
$('draft').onclick = async () => {
  const result = await action('capture', { text: $('experience').value });
  if (result?.draft) { $('experience').value = result.draft; status(result.clarification || 'Editable draft ready. Confirm to save.'); }
};
$('save').onclick = async () => {
  const actor = $('actor').value;
  const text = $('experience').value;
  let pending = pendingSaves.get(actor);
  if (!pending || pending.text !== text) { pending = { text, key: crypto.randomUUID() }; pendingSaves.set(actor, pending); }
  const result = await action('save', { text, confirmed: true, idempotencyKey: pending.key });
  if (result?.saved) {
    status(result.duplicate ? `Already saved as ${result.storyId}.` : `Saved as ${result.storyId}.`);
    pendingSaves.delete(actor);
  }
};
$('retrieve').onclick = async () => {
  const result = await action('retrieve', { query: $('experience').value });
  if (result?.sources) {
    status(result.answer);
    $('source').textContent = result.sources.length ? result.sources.map(source => `${source.id}: ${source.text}`).join('\n') : 'No source selected.';
  }
};
$('consent').onchange = async () => {
  const actor = $('actor').value;
  const enabled = $('consent').checked;
  if (!enabled) $('source').textContent = 'No source selected.';
  const result = await action('consent', { enabled });
  if (result?.status === 200) {
    consentByActor.set(actor, result.consent);
    status(result.consent ? 'Consent enabled.' : 'Consent revoked. Retrieval is blocked.');
  } else if (actor === $('actor').value) $('consent').checked = consentByActor.get(actor);
};
$('actor').onchange = () => {
  invalidate();
  $('experience').value = '';
  $('source').textContent = 'No source selected.';
  $('consent').checked = consentByActor.get($('actor').value);
  status('Switched fictional user.');
};
$('cancel').onclick = () => {
  invalidate();
  status('Request cancelled. A write may still complete; retry using the same request ID.');
};
