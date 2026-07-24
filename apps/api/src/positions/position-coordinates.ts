/**
 * StatsBomb's 25 canonical position IDs mapped to pitch coordinates for
 * rendering a formation diagram. Coordinates are percentages of pitch
 * length (x, 0 = own goal line, 100 = opponent goal line) and width
 * (y, 0-100 across the pitch), attacking left-to-right. Not part of the
 * StatsBomb dataset — a reasonable tactics-board layout defined for this app.
 */
export interface PositionCoordinate {
  id: number;
  name: string;
  x: number;
  y: number;
}

export const POSITION_COORDINATES: PositionCoordinate[] = [
  { id: 1, name: 'Goalkeeper', x: 5, y: 50 },
  { id: 2, name: 'Right Back', x: 20, y: 85 },
  { id: 3, name: 'Right Center Back', x: 18, y: 65 },
  { id: 4, name: 'Center Back', x: 15, y: 50 },
  { id: 5, name: 'Left Center Back', x: 18, y: 35 },
  { id: 6, name: 'Left Back', x: 20, y: 15 },
  { id: 7, name: 'Right Wing Back', x: 30, y: 90 },
  { id: 8, name: 'Left Wing Back', x: 30, y: 10 },
  { id: 9, name: 'Right Defensive Midfield', x: 35, y: 65 },
  { id: 10, name: 'Center Defensive Midfield', x: 33, y: 50 },
  { id: 11, name: 'Left Defensive Midfield', x: 35, y: 35 },
  { id: 12, name: 'Right Midfield', x: 50, y: 85 },
  { id: 13, name: 'Right Center Midfield', x: 48, y: 62 },
  { id: 14, name: 'Center Midfield', x: 45, y: 50 },
  { id: 15, name: 'Left Center Midfield', x: 48, y: 38 },
  { id: 16, name: 'Left Midfield', x: 50, y: 15 },
  { id: 17, name: 'Right Wing', x: 75, y: 85 },
  { id: 18, name: 'Right Attacking Midfield', x: 60, y: 62 },
  { id: 19, name: 'Center Attacking Midfield', x: 58, y: 50 },
  { id: 20, name: 'Left Attacking Midfield', x: 60, y: 38 },
  { id: 21, name: 'Left Wing', x: 75, y: 15 },
  { id: 22, name: 'Right Center Forward', x: 85, y: 62 },
  { id: 23, name: 'Center Forward', x: 88, y: 50 },
  { id: 24, name: 'Left Center Forward', x: 85, y: 38 },
  { id: 25, name: 'Secondary Striker', x: 80, y: 50 },
];
