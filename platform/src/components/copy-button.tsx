'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';

export function CopyButton({ text, label = 'Kopiraj link' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-sm btn-soft" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch {} }}>
      <Copy size={15} /> {done ? 'Kopirano' : label}
    </button>
  );
}
