'use client';
import { useState } from 'react';

export default function QuantityInput({ value, digits, disabled, label, className, onChange }: { value: number; digits: number; disabled: boolean; label: string; className?: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={digits} autoComplete="off" aria-label={label} disabled={disabled} className={className} style={{ width: `calc(${digits + 1}ch + 16px)` }} value={draft ?? String(value)} onFocus={event => { setDraft(String(value)); event.currentTarget.select(); }} onChange={event => {
    const text = event.target.value;
    if (!/^\d*$/.test(text) || text.length > digits) return;
    setDraft(text);
    if (Number(text) > 0) onChange(Number(text));
  }} onBlur={() => { if (draft !== null && draft !== '' && Number(draft) === 0) onChange(0); setDraft(null); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
