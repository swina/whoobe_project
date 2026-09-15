import { requireAuth as coreRequireAuth, requirePermission as coreRequirePermission, PERMISSIONS } from '@whoobe-cms/core/server';

export { PERMISSIONS };

export const requireAuth = coreRequireAuth;
export const requirePermission = coreRequirePermission;