/** Copies text in secure browsers and Android WebViews; true means copy succeeded. */
export async function copyToClipboardSafely(value: string): Promise<boolean> {
  if (!value || typeof document === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; } catch { /* Try WebView fallback. */ }
  }
  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch { return false; }
  finally { textarea?.remove(); }
}
