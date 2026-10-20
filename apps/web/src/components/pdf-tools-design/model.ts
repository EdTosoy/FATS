// Synthetic, memory-only design state. No PDF parsing, persistence or API calls.
export type Tool =
  'select' | 'signature' | 'initials' | 'text' | 'date' | 'check';
export type Mark = {
  id: string;
  page: string;
  kind: Exclude<Tool, 'select'>;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  bold: boolean;
  ink: 'blue' | 'black';
  strokes?: string;
  signatureStyle?: string;
};
export type Snapshot = {
  pages: string[];
  marks: Mark[];
  fields: Record<string, string>;
};
export const pageNames: Record<string, string> = {
  offer: 'Offer letter',
  details: 'Personal details',
  checklist: 'Joining checklist',
};
export const initialSnapshot = (): Snapshot => ({
  pages: ['offer', 'details', 'checklist'],
  marks: [],
  fields: {},
});
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export function boundMark(mark: Mark): Mark {
  const width = clamp(mark.width, 24, 560);
  const height = clamp(mark.height, 20, 740);
  return {
    ...mark,
    width,
    height,
    x: clamp(mark.x, 0, 612 - width),
    y: clamp(mark.y, 0, 792 - height),
  };
}
