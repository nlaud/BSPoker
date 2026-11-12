export type SeatEdgePosition =
  | 'T'
  | 'T-left'
  | 'T-center'
  | 'T-right'
  | 'L'
  | 'L-low'
  | 'L-high'
  | 'R'
  | 'R-high'
  | 'R-low';

const LAYOUT_TABLES: Record<number, SeatEdgePosition[]> = {
  1: ['T'],
  2: ['L', 'R'],
  3: ['L', 'T', 'R'],
  4: ['L', 'T-left', 'T-right', 'R'],
  5: ['L', 'T-left', 'T-center', 'T-right', 'R'],
  6: ['L-low', 'L-high', 'T-left', 'T-right', 'R-high', 'R-low'],
  7: ['L-low', 'L-high', 'T-left', 'T-center', 'T-right', 'R-high', 'R-low'],
};

export function getOpponentEdgePositions(count: number): SeatEdgePosition[] {
  if (count <= 0) return [];
  if (count > 7) count = 7;
  return LAYOUT_TABLES[count] || LAYOUT_TABLES[7];
}

export function getRotationForPosition(pos: SeatEdgePosition): number {
  if (pos.startsWith('L')) {
    return 90;
  }
  if (pos.startsWith('R')) {
    return -90;
  }
  return 180;
}
