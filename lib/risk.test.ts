import { describe, expect, it } from 'vitest';
import { detect } from './detector/detect';
import { assessRisk, levelFor } from './risk';

const risk = (text: string) => assessRisk(detect(text));
const sum = (text: string) => risk(text).lines.reduce((s, l) => s + l.points, 0);

describe('assessRisk', () => {
  it('is safe with nothing found', () => {
    expect(risk('Explain photosynthesis.')).toMatchObject({ score: 0, level: 'safe', lines: [] });
  });

  it('rates a lone email as low', () => {
    expect(risk('mail me at priya@example.org').level).toBe('low');
  });

  it('rates PAN + phone + email as high, with the ID-and-contact combination', () => {
    const r = risk('PAN BNZPM2501K, phone 9845012345, mail priya@example.org');
    expect(r.level).toBe('high');
    expect(r.lines.map((l) => l.label)).toEqual(['PAN', 'PHONE', 'EMAIL', 'COMBO_ID_CONTACT']);
  });

  it('never rates a lone Aadhaar below high', () => {
    const r = risk('aadhaar 2341 2341 2346');
    expect(r.level).toBe('high');
    expect(r.lines.at(-1)?.label).toBe('FLOOR_HIGH');
  });

  it('makes any secret critical', () => {
    const r = risk('password: tiger2026');
    expect(r.level).toBe('critical');
    expect(r.score).toBeGreaterThanOrEqual(71);
  });

  it('adds points when health details sit next to an identity', () => {
    const alone = risk('My HbA1c came back at 7.9');
    const named = risk("I'm Priya Nair. My HbA1c came back at 7.9");
    expect(named.lines.some((l) => l.label === 'COMBO_HEALTH_IDENTITY')).toBe(true);
    expect(named.score).toBeGreaterThan(alone.score);
  });

  it('counts the same detail once and a second of the same type at half weight', () => {
    const once = risk('call 9845012345 or 98450 12345');
    const twice = risk('call 9845012345 or 9123456780');
    expect(once.lines[0]?.count).toBe(1);
    expect(twice.lines[0]?.count).toBe(2);
    expect(twice.score).toBeGreaterThan(once.score);
  });

  it('caps at 100 and the explanation always adds up to the score', () => {
    const text = 'sk-proj-Xq7Lm2Rt9Vb4Nc8Kd1Pf6Hs3Wz5Jy0Ag password: tiger2026 card 4111 1111 1111 1111 aadhaar 2341 2341 2346';
    expect(risk(text).score).toBe(100);
    for (const t of [text, 'PAN BNZPM2501K', 'mail a@b.example.com', 'password: tiger2026']) expect(sum(t)).toBe(risk(t).score);
  });

  it('maps scores to levels at the documented boundaries', () => {
    expect([0, 1, 40, 41, 70, 71, 100].map(levelFor)).toEqual(['safe', 'low', 'low', 'high', 'high', 'critical', 'critical']);
  });
});
