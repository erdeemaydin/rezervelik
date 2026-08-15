// Whitelist of granular capabilities a restricted (non-root) SUPER_ADMIN
// "sub-admin" can be granted, stored on User.permissions the same way tenant
// module permissions are (see requirePermission in middlewares/auth.ts) but
// namespaced with `sys_` so a system permission string can never collide with
// (and accidentally unlock) a tenant module permission on the same field.
//
// Deliberately excluded from this list, and therefore never grantable to a
// sub-admin no matter what: managing other platform administrators (creating
// them, deactivating them, changing their root/permission status). Those
// actions are gated by requireRootSystemAdmin instead — root-only, full stop —
// so a sub-admin can never escalate itself or another account to root.
export const SYSTEM_PERMISSIONS = [
  'sys_manage_tenants',
  'sys_manage_subscriptions',
  'sys_manage_tenant_users',
  'sys_impersonate_tenants',
  'sys_manage_global_settings',
  'sys_view_audit_log',
  'sys_view_metrics',
] as const;

export type SystemPermissionKey = (typeof SYSTEM_PERMISSIONS)[number];

export const isSystemPermissionKey = (value: unknown): value is SystemPermissionKey =>
  typeof value === 'string' && (SYSTEM_PERMISSIONS as readonly string[]).includes(value);

// Normalizes arbitrary request-body input down to a comma-separated string of
// only whitelisted keys — anything unrecognized (typos, stale keys, injected
// junk) is silently dropped rather than persisted, so a malformed/tampered
// request can never grant more than the fixed capability set above.
export const sanitizeSystemPermissions = (input: unknown): string => {
  if (!Array.isArray(input)) return '';
  const cleaned = input.filter(isSystemPermissionKey);
  return Array.from(new Set(cleaned)).join(',');
};
