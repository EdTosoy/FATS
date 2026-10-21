import { describe, expect, it } from 'vitest';
import {
  signatureBox,
  signatureFit,
} from '../../apps/web/src/components/pdf-tools-design/signature-layout';
import {
  boundMark,
  type Mark,
} from '../../apps/web/src/components/pdf-tools-design/model';

describe('prototype signature readability', () => {
  it('keeps a short name at the base size', () => {
    expect(signatureBox(155)).toEqual({
      width: 190,
      height: 58,
      size: 32,
      fits: true,
    });
  });
  it('widens a multiple-word name before reducing type', () => {
    expect(signatureBox(400)).toEqual({
      width: 412,
      height: 58,
      size: 32,
      fits: true,
    });
  });
  it('reports overflow instead of silently falling below the document-size floor', () => {
    expect(signatureBox(1100)).toMatchObject({
      width: 560,
      size: 18,
      fits: false,
    });
    expect(signatureFit(155, 50, 20).fits).toBe(false);
  });
  it('honors both width and height when fitting', () => {
    expect(signatureFit(155, 190, 25).fits).toBe(false);
    expect(signatureFit(600, 560, 58)).toMatchObject({ fits: true });
  });
  it('allows initials to use a compact box', () => {
    expect(signatureBox(50, true).width).toBe(80);
  });
  it('preserves signature aspect ratio at the page bound', () => {
    const mark: Mark = {
      id: 'test',
      page: 'offer',
      kind: 'signature',
      text: 'Synthetic',
      x: 600,
      y: 780,
      width: 700,
      height: 140,
      size: 32,
      bold: false,
      ink: 'blue',
    };
    const bounded = boundMark(mark);
    expect(bounded.width).toBe(560);
    expect(bounded.height).toBe(112);
    expect(bounded.width / bounded.height).toBe(5);
    expect(bounded.x + bounded.width).toBeLessThanOrEqual(612);
    expect(bounded.y + bounded.height).toBeLessThanOrEqual(792);
  });
});
