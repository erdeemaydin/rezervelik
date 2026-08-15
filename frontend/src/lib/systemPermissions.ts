// Mirrors src/config/systemPermissions.ts on the backend — the backend is the
// source of truth and re-validates/whitelists every key server-side, this is
// only for rendering the picker in the Add/Edit Administrator dialogs.
export const SYSTEM_PERMISSIONS = [
  { key: 'sys_manage_tenants', label: 'Manage tenants', description: 'Create tenants, edit tenant settings, feature flags and customization.' },
  { key: 'sys_manage_subscriptions', label: 'Manage subscriptions', description: 'Change a tenant’s plan, billing status and renewal date.' },
  { key: 'sys_manage_tenant_users', label: 'Manage tenant staff accounts', description: 'Edit tenant staff permissions, generate password reset links, toggle 2FA.' },
  { key: 'sys_impersonate_tenants', label: 'Impersonate tenants', description: 'Sign in as a tenant’s admin to see the dashboard as they see it.' },
  { key: 'sys_manage_global_settings', label: 'Manage global settings', description: 'Platform-wide settings: maintenance mode, registration, theme.' },
  { key: 'sys_view_audit_log', label: 'View activity audit log', description: 'Read the platform-wide activity trail across all tenants.' },
  { key: 'sys_view_metrics', label: 'View system metrics', description: 'Read platform-wide usage counters.' },
] as const;

export type SystemPermissionKey = (typeof SYSTEM_PERMISSIONS)[number]['key'];
