export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryMuted: string;
  success: string;
  tabBar: string;
  tabBarBorder: string;
  tabInactive: string;
};

const dark: ThemeColors = {
  background: '#0f1115',
  surface: '#171a21',
  surfaceElevated: '#1f232d',
  text: '#eef0f4',
  textSecondary: '#9aa3b2',
  border: '#2a3140',
  primary: '#6c9cff',
  primaryMuted: '#3d4f7a',
  success: '#4ade80',
  tabBar: '#12151c',
  tabBarBorder: '#2a3140',
  tabInactive: '#6b7280',
};

const light: ThemeColors = {
  background: '#f3f4f6',
  surface: '#ffffff',
  surfaceElevated: '#f9fafb',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
  primary: '#2563eb',
  primaryMuted: '#93c5fd',
  success: '#16a34a',
  tabBar: '#ffffff',
  tabBarBorder: '#e5e7eb',
  tabInactive: '#9ca3af',
};

export function getColors(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? dark : light;
}
