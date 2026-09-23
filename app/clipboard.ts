export async function copyText(text: string): Promise<void> {
  if (window.yarnDesktop?.copyText) {
    await window.yarnDesktop.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
