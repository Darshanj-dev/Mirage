// Small controls shared by the popup and the settings page.

import { useState, type FormEvent } from 'react';
import { t } from '@/lib/strings';

export function Switch({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange(next: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

export function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="row__text">
        <p className="row__title">{title}</p>
        {hint && <p className="row__hint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function ChipList({ title, hint, items, onAdd, onRemove }: {
  title: string;
  hint: string;
  items: readonly string[];
  onAdd(value: string): Promise<void>;
  onRemove(value: string): Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await onAdd(draft);
    setDraft('');
  };
  return (
    <div className="chiplist">
      <p className="row__title">{title}</p>
      <p className="row__hint">{hint}</p>
      {items.length > 0 && (
        <ul className="chips">
          {items.map((item) => (
            <li key={item} className="chip">
              <span>{item}</span>
              <button type="button" className="chip__remove" aria-label={t('popup_remove', [item])} onClick={() => void onRemove(item)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="add" onSubmit={(e) => void submit(e)}>
        <input
          className="add__input"
          value={draft}
          maxLength={60}
          placeholder={t('popup_addPlaceholder')}
          aria-label={`${title}: ${t('popup_addPlaceholder')}`}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn">
          {t('popup_add')}
        </button>
      </form>
    </div>
  );
}

export const SHIELD_PATH = 'M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3Z';
