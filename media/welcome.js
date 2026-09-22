(() => {
  const vscode = acquireVsCodeApi();
  const byId = id => document.getElementById(id);
  let editing = false;
  const busy = value => {
    document.querySelectorAll('button').forEach(button => { button.disabled = value; });
    byId('url').disabled = value;
    byId('token').disabled = value;
    byId('submit').textContent = value ? 'Connecting…' : 'Connect to Unleash';
    byId('progress').textContent = value ? 'Checking access to your projects and flags…' : '';
  };
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => vscode.postMessage({ type: button.dataset.action })));
  byId('change').addEventListener('click', () => { editing = true; byId('setup').hidden = false; byId('success').hidden = true; byId('url').focus(); });
  byId('connect').addEventListener('submit', event => {
    event.preventDefault();
    byId('error').hidden = true;
    const token = byId('token').value;
    byId('token').value = '';
    editing = true;
    busy(true);
    vscode.postMessage({ type: 'connect', url: byId('url').value, token });
  });
  window.addEventListener('message', ({ data }) => {
    if (data.busy === true) { editing = true; busy(true); }
    if (data.type === 'connected') editing = false;
    if (data.type === 'state' || data.type === 'connected') {
      if (!byId('url').value) byId('url').value = data.url || '';
      byId('token').placeholder = data.url ? 'Leave blank to keep your saved PAT' : 'Paste your PAT';
      byId('token-help').textContent = data.url ? 'Leave blank to reuse your saved PAT for this instance, or enter a replacement.' : 'Create a token in your Unleash profile → Personal API tokens.';
      byId('success').hidden = !data.connected || editing;
      byId('setup').hidden = data.connected && !editing;
      byId('connection').textContent = `${data.count} flags available across your projects. Connected to ${data.url || 'your instance'}.`;
    } else if (data.type === 'error') {
      editing = true;
      byId('setup').hidden = false;
      byId('success').hidden = true;
      byId('error').textContent = data.message;
      byId('error').hidden = false;
    } else if (data.type === 'idle') busy(false);
  });
  vscode.postMessage({ type: 'ready' });
})();
