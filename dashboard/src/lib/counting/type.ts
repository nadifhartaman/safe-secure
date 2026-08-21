export const DETECTION_CATEGORIES = [
  { key: 'throwing_count', label: 'Throwing Object', color: '#f59e0b', rare: true },
  { key: 'weapons_count', label: 'Weapon', color: '#ef4444', rare: true },
  { key: 'intruder_count', label: 'Intruder', color: '#8b5cf6', rare: true },
  { key: 'smoking_count', label: 'Smoking', color: '#0ea5e9', rare: true },
  { key: 'trespassing_count', label: 'Trespassing', color: '#ec4899', rare: true },
  { key: 'vandalism_count', label: 'Vandalism', color: '#14b8a6', rare: true },
] as const;

export type DetectionKey = (typeof DETECTION_CATEGORIES)[number]['key'];