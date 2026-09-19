import { useStore, type AuditEntry } from './store';

async function sha256(text: string) {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // insecure-context fallback (FNV-1a), still chains deterministically
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}

/** Appends a hash-chained entry: each hash covers the previous hash + this entry. Local to this page only. */
export async function appendAudit(actor: string, action: string) {
  const { audit, set } = useStore.getState();
  const prev = audit.length ? audit[audit.length - 1].hash : '0'.repeat(64);
  const at = new Date().toISOString();
  const seq = audit.length + 1;
  const hash = await sha256(`${prev}|${seq}|${at}|${actor}|${action}`);
  const entry: AuditEntry = { seq, at, actor, action, hash, prev };
  set({ audit: [...useStore.getState().audit, entry] });
  return entry;
}

export async function verifyChain(entries: AuditEntry[]) {
  let prev = '0'.repeat(64);
  for (const e of entries) {
    if (e.prev !== prev) return false;
    const h = await sha256(`${e.prev}|${e.seq}|${e.at}|${e.actor}|${e.action}`);
    if (h !== e.hash) return false;
    prev = e.hash;
  }
  return true;
}
