/**
 * Permission definitions and role-to-permission mappings for RBAC.
 */

export type Permission =
  | 'assets:read'
  | 'assets:write'
  | 'employees:read'
  | 'employees:write'
  | 'maintenance:read'
  | 'maintenance:write'
  | 'licenses:read'
  | 'licenses:write'
  | 'procurement:read'
  | 'procurement:write'
  | 'reports:read'
  | 'notifications:read'
  | 'admin:manage';

const ALL_PERMISSIONS: Permission[] = [
  'assets:read',
  'assets:write',
  'employees:read',
  'employees:write',
  'maintenance:read',
  'maintenance:write',
  'licenses:read',
  'licenses:write',
  'procurement:read',
  'procurement:write',
  'reports:read',
  'notifications:read',
  'admin:manage',
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  Administrator: ALL_PERMISSIONS,

  'IT Staff': ALL_PERMISSIONS.filter((p) => p !== 'admin:manage'),

  'Read-Only User': [
    'assets:read',
    'employees:read',
    'maintenance:read',
    'licenses:read',
    'procurement:read',
    'reports:read',
    'notifications:read',
  ],
};
