(() => {
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => vscode.postMessage({ type: button.dataset.action })));
  window.addEventListener('message', ({ data }) => {
    // This is extension-rendered Markdown with raw HTML disabled and escaped server text.
    document.getElementById('content').innerHTML = data.content;
    document.getElementById('open').hidden = !data.canOpen;
  });
  vscode.postMessage({ type: 'ready' });
})();
