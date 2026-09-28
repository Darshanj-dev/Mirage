// S4 block panel: names the secret and offers a way forward. There is no "send anyway".

import { isSecretType, type Finding } from '@/lib/detector/types';
import { obscure, secretName, t, typeName } from '@/lib/strings';
import { Panel } from './Panel';

interface Props {
  anchor: DOMRect | null;
  text: string;
  findings: readonly Finding[];
  onRemoveAndSend(): void;
  onEdit(): void;
}

export function BlockPanel({ anchor, text, findings, onRemoveAndSend, onEdit }: Props) {
  const firstSecret = findings.find((f) => isSecretType(f.type));
  const secretType = firstSecret && isSecretType(firstSecret.type) ? firstSecret.type : 'PASSWORD';

  // The prompt as typed, except no detail is shown in full: secrets are obscured and
  // personal details are shown by kind.
  const parts: { text: string; kind?: 'secret' | 'mask' }[] = [];
  let last = 0;
  for (const f of findings) {
    parts.push({ text: text.slice(last, f.start) });
    parts.push(isSecretType(f.type) ? { text: obscure(f.value), kind: 'secret' } : { text: typeName(f.type), kind: 'mask' });
    last = f.end;
  }
  parts.push({ text: text.slice(last) });

  return (
    <Panel
      tone="block"
      anchor={anchor}
      title={t('block_title', [secretName(secretType)])}
      onEscape={onEdit}
      footer={t('block_body')}
      actions={
        <>
          <span className="mirage-spacer" />
          <button type="button" className="mirage-btn" onClick={onEdit}>
            {t('block_edit')}
          </button>
          <button type="button" className="mirage-btn mirage-btn--primary mirage-btn--block" onClick={onRemoveAndSend}>
            {t('block_fix')}
          </button>
        </>
      }
    >
      <p className="mirage-prompt">
        {parts.map((p, i) =>
          p.kind ? (
            <span key={i} className={`mirage-pill mirage-pill--${p.kind}`}>
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
    </Panel>
  );
}
