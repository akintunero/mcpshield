import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:rbac');

export type Role = 'viewer' | 'auditor' | 'operator' | 'admin';

export interface Permission {
  action: string;
  resource: string;
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: [
    { action: 'list', resource: 'findings' },
    { action: 'read', resource: 'findings' },
    { action: 'read', resource: 'reports' },
    { action: 'read', resource: 'score' },
  ],
  auditor: [
    { action: 'list', resource: 'findings' },
    { action: 'read', resource: 'findings' },
    { action: 'read', resource: 'reports' },
    { action: 'read', resource: 'score' },
    { action: 'read', resource: 'audit-logs' },
    { action: 'export', resource: 'audit-logs' },
  ],
  operator: [
    { action: 'list', resource: 'findings' },
    { action: 'read', resource: 'findings' },
    { action: 'read', resource: 'reports' },
    { action: 'read', resource: 'score' },
    { action: 'approve', resource: 'remediation' },
    { action: 'execute', resource: 'remediation' },
    { action: 'read', resource: 'audit-logs' },
  ],
  admin: [
    { action: '*', resource: '*' },
  ],
};

export class RBAC {
  private userRoles = new Map<string, Role>();

  assignRole(userId: string, role: Role): void {
    this.userRoles.set(userId, role);
    logger.info(`Assigned role "${role}" to user ${userId}`);
  }

  getRole(userId: string): Role {
    return this.userRoles.get(userId) || 'viewer';
  }

  hasPermission(userId: string, action: string, resource: string): boolean {
    const role = this.getRole(userId);
    const permissions = ROLE_PERMISSIONS[role];
    return permissions.some(
      (p) => (p.action === '*' || p.action === action) && (p.resource === '*' || p.resource === resource)
    );
  }

  checkPermission(userId: string, action: string, resource: string): void {
    if (!this.hasPermission(userId, action, resource)) {
      throw new Error(`User "${userId}" with role "${this.getRole(userId)}" is not authorized to ${action} ${resource}`);
    }
  }
}
