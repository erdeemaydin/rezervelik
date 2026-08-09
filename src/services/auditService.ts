import { Request } from 'express';
import prisma from '../config/prisma';

/**
 * Activity audit trail writer.
 *
 * `logAudit` records a single administrative/business action. It is intentionally
 * fire-and-forget: a failure to write an audit row must never break or roll back
 * the request that triggered it, so callers do not need to await it and all errors
 * are swallowed (logged to the console only).
 *
 * Scope rules:
 *   - restaurantId null  -> platform-level action (visible only in the system-admin
 *                           audit view).
 *   - restaurantId set   -> scoped to a tenant; visible in the system-admin view AND
 *                           in that tenant's own audit view (if the root admin has
 *                           enabled showAuditLogToTenant for them).
 *
 * Actor identity is snapshotted (email/name/role) so the record stays meaningful
 * even after the acting user is deleted.
 */

export type AuditCategory =
  | 'AUTH'
  | 'TENANT'
  | 'SETTINGS'
  | 'SUBSCRIPTION'
  | 'PERMISSIONS'
  | 'RESERVATION'
  | 'PAYMENT'
  | 'SYSTEM';

interface AuditInput {
  // Pass the Express request to auto-derive the actor (from req.user) and IP.
  req?: Request;
  // Explicit actor snapshot fields (override / supplement what req provides).
  actorId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  // Scope. null / undefined => platform-level.
  restaurantId?: string | null;
  action: string;
  category: AuditCategory;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}

const clientIp = (req?: Request): string | null => {
  if (!req) return null;
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
};

export const logAudit = async (input: AuditInput): Promise<void> => {
  try {
    const reqUser = input.req?.user;
    let actorId = input.actorId ?? reqUser?.userId ?? null;
    let actorRole = input.actorRole ?? reqUser?.role ?? null;
    let actorEmail = input.actorEmail ?? null;
    let actorName = input.actorName ?? null;

    // Snapshot the actor's email/name if the caller didn't supply them but we do
    // know who they are. One lightweight lookup; audited actions are infrequent.
    if (actorId && (!actorEmail || !actorName)) {
      const u = await prisma.user.findUnique({
        where: { id: actorId },
        select: { email: true, firstName: true, lastName: true, role: true },
      });
      if (u) {
        actorEmail = actorEmail ?? u.email;
        actorName = actorName ?? (`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null);
        actorRole = actorRole ?? u.role;
      }
    }

    await prisma.auditLog.create({
      data: {
        actorId,
        actorEmail,
        actorName,
        actorRole,
        restaurantId: input.restaurantId ?? null,
        action: input.action,
        category: input.category,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel ?? null,
        metadata: (input.metadata ?? undefined) as any,
        ip: clientIp(input.req),
      },
    });
  } catch (err) {
    // Never let audit logging break the main request path.
    console.error('[Audit] Failed to write audit log:', (err as Error)?.message);
  }
};
