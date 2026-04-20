/**
 * Trigger file download from a Blob response.
 * The <a> element must be appended to the DOM for click() to work reliably.
 */
export function downloadBlob(data: Blob | ArrayBuffer, filename: string) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
