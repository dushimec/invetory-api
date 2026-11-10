import { createHash, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import {
  defaultProductCategories,
  defaultUnits,
} from '../config/catalog-defaults.js';
import { writeAuditEvent } from './audit.service.js';
import { AppError } from '../utils/app-error.js';

const permissionKeys = [
  'products.create',
  'products.read',
  'products.update',
  'products.archive',
  'products.cost.update',
  'products.price.update',
  'inventory.read',
  'inventory.receive',
  'inventory.issue',
  'inventory.adjust',
  'inventory.adjust.direct',
  'inventory.transfer',
  'inventory.count',
  'purchases.create',
  'purchases.read',
  'purchases.approve',
  'purchases.receive',
  'sales.create',
  'sales.read',
  'sales.approve',
  'sales.price.override',
  'sales.discount.apply',
  'sales.payments.record',
  'returns.process',
  'suppliers.manage',
  'suppliers.read',
  'customers.manage',
  'customers.read',
  'reports.view',
  'reports.export',
  'users.manage',
  'roles.manage',
  'settings.manage',
  'audit_logs.read',
];

export const defaultRolePermissions: Record<string, string[]> = {
  'Organization Owner': permissionKeys,
  'Organization Administrator': permissionKeys,
  'Inventory Manager': [
    'products.create',
    'products.read',
    'products.update',
    'products.archive',
    'inventory.read',
    'inventory.receive',
    'inventory.issue',
    'inventory.adjust',
    'inventory.transfer',
    'inventory.count',
    'returns.process',
    'purchases.create',
    'purchases.read',
    'purchases.receive',
    'suppliers.manage',
    'suppliers.read',
    'reports.view',
    'reports.export',
  ],
  'Warehouse Manager': [
    'products.read',
    'inventory.read',
    'inventory.receive',
    'inventory.issue',
    'inventory.adjust',
    'inventory.transfer',
    'inventory.count',
    'purchases.receive',
    'returns.process',
    'purchases.read',
    'reports.view',
  ],
  Storekeeper: [
    'products.read',
    'inventory.read',
    'inventory.receive',
    'inventory.issue',
    'inventory.count',
    'purchases.receive',
  ],
  'Purchasing Officer': [
    'products.read',
    'purchases.create',
    'purchases.read',
    'suppliers.manage',
    'inventory.read',
    'reports.view',
  ],
  'Purchasing Manager': [
    'products.read',
    'purchases.create',
    'purchases.read',
    'purchases.approve',
    'suppliers.manage',
    'suppliers.read',
    'inventory.read',
    'reports.view',
    'reports.export',
  ],
  Salesperson: [
    'products.read',
    'inventory.read',
    'sales.create',
    'sales.read',
    'customers.manage',
    'customers.read',
    'sales.payments.record',
    'reports.view',
  ],
  'Sales Manager': [
    'products.read',
    'inventory.read',
    'sales.create',
    'sales.read',
    'sales.approve',
    'sales.price.override',
    'sales.discount.apply',
    'sales.payments.record',
    'customers.manage',
    'customers.read',
    'reports.view',
    'reports.export',
  ],
  Accountant: [
    'products.read',
    'inventory.read',
    'reports.view',
    'reports.export',
    'purchases.read',
    'sales.read',
    'suppliers.read',
    'customers.read',
  ],
  Auditor: [
    'products.read',
    'inventory.read',
    'reports.view',
    'reports.export',
    'audit_logs.read',
    'purchases.read',
    'sales.read',
    'suppliers.read',
    'customers.read',
  ],
  'Read-Only User': [
    'products.read',
    'inventory.read',
    'reports.view',
    'purchases.read',
    'sales.read',
    'suppliers.read',
    'customers.read',
  ],
};

export const defaultRoleDuties: Record<string, string[]> = {
  'Organization Owner': [
    'Set organization direction and retain final accountability.',
    'Oversee every operational sector and approve access assignments.',
    'Manage organization settings, staff, roles, audit records, and business data.',
  ],
  'Organization Administrator': [
    'Coordinate day-to-day operations across all sectors.',
    'Manage staff membership, roles, organization settings, and operational access.',
    'Monitor approvals, reports, and audit activity.',
  ],
  'Inventory Manager': [
    'Maintain the product catalog, units, categories, and tracking settings.',
    'Oversee receipts, stock issues, adjustments, counts, and warehouse transfers.',
    'Coordinate inventory returns and review stock and procurement reports.',
  ],
  'Warehouse Manager': [
    'Supervise goods receiving, put-away, stock issues, and warehouse counts.',
    'Coordinate inter-warehouse transfers and warehouse return handling.',
    'Review warehouse stock and incoming purchase receipts.',
  ],
  Storekeeper: [
    'Record approved goods receipts and stock issues at the warehouse.',
    'Support stock counts and report discrepancies to the warehouse manager.',
    'Keep product and location stock records accurate; cannot approve purchases.',
  ],
  'Purchasing Officer': [
    'Prepare local and import purchase orders and maintain supplier records.',
    'Track expected arrivals, foreign-currency details, and landed-cost inputs.',
    'Coordinate with warehouse staff for receiving; cannot approve purchase orders.',
  ],
  'Purchasing Manager': [
    'Lead supplier and import procurement planning.',
    'Review and approve purchase orders while observing separation of duties.',
    'Monitor shipment progress, procurement spend, and supplier performance.',
  ],
  Salesperson: [
    'Create customer records and prepare customer sales orders.',
    'Check product availability and follow order fulfillment with the warehouse.',
    'Keep customers informed; cannot approve dispatches or manage stock.',
  ],
  'Sales Manager': [
    'Supervise sales order preparation, confirmation, and dispatch approval.',
    'Coordinate per-dispatch delivery tracking and proof of delivery.',
    'Manage customer records and review sales and delivery performance.',
  ],
  Accountant: [
    'Review sales, purchasing, inventory valuation, and operational reports.',
    'Monitor supplier and customer records for finance operations.',
    'Export reports where needed; does not execute stock or order approvals.',
  ],
  Auditor: [
    'Review operational records, reports, and audit logs.',
    'Identify and report control exceptions without changing business records.',
  ],
  'Read-Only User': [
    'View catalog, stock, purchase, sales, supplier, customer, and reports.',
    'Do not create, approve, or change operational records.',
  ],
};

export const defaultRoleDescriptions: Record<string, string> = {
  'Organization Owner':
    'Owns the organization and has full access to all sectors, roles, settings, and records.',
  'Organization Administrator':
    'Administers organization users, roles, settings, and cross-sector operations.',
  'Inventory Manager':
    'Oversees catalog, stock movements, stock adjustments, transfers, returns, and inventory reporting.',
  'Warehouse Manager':
    'Runs warehouse receiving, stock issue, transfers, counts, and return processing.',
  Storekeeper:
    'Records goods receipts and stock issues/counts; cannot approve purchases or manage users.',
  'Purchasing Officer':
    'Creates and tracks local/import purchase orders and manages supplier records; cannot approve orders or receive goods.',
  'Purchasing Manager':
    'Leads procurement, reviews and approves purchase orders, and reports on suppliers and imports.',
  Salesperson:
    'Creates and follows customer sales orders and customer records; cannot approve or dispatch orders.',
  'Sales Manager':
    'Leads sales operations, approves and dispatches orders, manages customer records, and tracks deliveries.',
  Accountant:
    'Reads sales, purchasing, inventory, customer, supplier, and operational reports for financial oversight.',
  Auditor:
    'Read-only operational and reporting access with audit-log visibility.',
  'Read-Only User':
    'Read-only access to the catalog, inventory, sales, purchases, and reports.',
};

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const accessTtl = env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'];

function issueTokens(
  userId: string,
  organizationId: string,
  sessionId: string,
) {
  const accessToken = jwt.sign(
    { org: organizationId, sid: sessionId, typ: 'access' },
    env.JWT_ACCESS_SECRET,
    { subject: userId, expiresIn: accessTtl },
  );
  const refreshToken = jwt.sign(
    { sid: sessionId, typ: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { subject: userId, expiresIn: `${env.REFRESH_TOKEN_DAYS}d` },
  );
  return { accessToken, refreshToken };
}

export async function register(input: {
  organizationName: string;
  organizationSlug: string;
  fullName: string;
  email: string;
  password: string;
}) {
  if (!env.ALLOW_ORG_REGISTRATION) {
    throw new AppError(
      'Organization registration is disabled',
      403,
      'REGISTRATION_DISABLED',
    );
  }
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
  });
  return prisma.$transaction(async (tx) => {
    const permissions = await Promise.all(
      permissionKeys.map((key) =>
        tx.permission.upsert({
          where: { key },
          create: {
            key,
            description: `Permission to ${key.replace('.', ' ')}`,
          },
          update: {},
        }),
      ),
    );
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug: input.organizationSlug.toLowerCase(),
        settings: {
          create: {
            businessName: input.organizationName,
            baseCurrency: 'RWF',
            timezone: 'Africa/Kigali',
          },
        },
      },
    });
    await tx.unitOfMeasure.createMany({
      data: defaultUnits.map((unit) => ({
        organizationId: organization.id,
        ...unit,
      })),
    });
    await tx.productCategory.createMany({
      data: defaultProductCategories.map((name) => ({
        organizationId: organization.id,
        name,
      })),
    });
    const user = await tx.user.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        passwordHash,
      },
    });
    const permissionIds = new Map(
      permissions.map((permission) => [permission.key, permission.id]),
    );
    const roles = await Promise.all(
      Object.entries(defaultRolePermissions).map(([name, keys]) =>
        tx.role.create({
          data: {
            organizationId: organization.id,
            name,
            description: defaultRoleDescriptions[name] ?? '',
            duties: defaultRoleDuties[name] ?? [],
            isSystem: true,
            permissions: {
              create: keys.map((key) => ({
                permissionId: permissionIds.get(key)!,
              })),
            },
          },
        }),
      ),
    );
    const ownerRole = roles.find((role) => role.name === 'Organization Owner');
    if (!ownerRole)
      throw new Error('Organization Owner role definition is missing');
    await tx.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        roleId: ownerRole.id,
      },
    });
    const sessionId = randomUUID();
    const tokens = issueTokens(user.id, organization.id, sessionId);
    await tx.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        organizationId: organization.id,
        refreshTokenHash: digest(tokens.refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400_000),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorId: user.id,
        action: 'organization.registered',
        entityType: 'organization',
        entityId: organization.id,
      },
    });
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      organization,
      ...tokens,
    };
  });
}

export async function login(
  email: string,
  password: string,
) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: { organization: true },
      },
    },
  });
  const now = new Date();
  const passwordMatches = user
    ? await argon2.verify(user.passwordHash, password)
    : await argon2.hash(password, { type: argon2.argon2id }).then(() => false);
  if (
    !user ||
    !user.isActive ||
    user.memberships.length === 0 ||
    !passwordMatches
  ) {
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      await prisma.user.updateMany({
        where: { id: user.id, failedLoginCount: { gte: 10 } },
        data: { lockedUntil: new Date(Date.now() + 15 * 60_000) },
      });
    }
    throw new AppError(
      'Invalid email or password',
      401,
      'INVALID_CREDENTIALS',
    );
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new AppError(
      'Your account is temporarily locked after several unsuccessful sign-in attempts. Please wait a little while, then try again.',
      423,
      'ACCOUNT_LOCKED',
    );
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
  if (user.memberships.length > 1) {
    throw new AppError(
      'This account belongs to more than one organization. Please contact your administrator for help signing in.',
      409,
      'MULTIPLE_ORGANIZATIONS',
    );
  }
  const organization = user.memberships[0].organization;
  const sessionId = randomUUID();
  const tokens = issueTokens(user.id, organization.id, sessionId);
  await prisma.userSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      organizationId: organization.id,
      refreshTokenHash: digest(tokens.refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400_000),
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
    },
  });
  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      mustChangePassword: user.mustChangePassword,
    },
    mustChangePassword: user.mustChangePassword,
    organization,
    ...tokens,
  };
}

export async function changePassword(input: {
  userId: string;
  organizationId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user || !(await argon2.verify(user.passwordHash, input.currentPassword))) {
    throw new AppError(
      'Current password is incorrect',
      401,
      'INVALID_CREDENTIALS',
    );
  }
  const passwordHash = await argon2.hash(input.newPassword, {
    type: argon2.argon2id,
  });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, failedLoginCount: 0 },
    });
    await tx.userSession.updateMany({
      where: {
        userId: user.id,
        id: { not: input.sessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    await writeAuditEvent(tx, {
      organizationId: input.organizationId,
      actorId: user.id,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
    });
  });
}

export async function refresh(rawToken: string) {
  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(rawToken, env.JWT_REFRESH_SECRET);
    if (
      typeof decoded === 'string' ||
      decoded.typ !== 'refresh' ||
      typeof decoded.sid !== 'string'
    ) {
      throw new Error('Invalid token claims');
    }
    claims = decoded;
  } catch {
    throw new AppError(
      'Invalid or expired refresh token',
      401,
      'INVALID_REFRESH_TOKEN',
    );
  }
  const userId = claims.sub;
  const session = await prisma.userSession.findUnique({
    where: { id: claims.sid },
  });
  if (!userId || !session) {
    throw new AppError('Invalid refresh session', 401, 'INVALID_REFRESH_TOKEN');
  }
  const oldHash = digest(rawToken);
  if (
    session.userId !== userId ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.refreshTokenHash !== oldHash
  ) {
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(
      'Refresh token reuse detected; sessions revoked',
      401,
      'REFRESH_REUSE_DETECTED',
    );
  }
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      organizationId: session.organizationId,
      status: 'ACTIVE',
      user: { isActive: true },
    },
  });
  if (!membership) {
    throw new AppError(
      'Active organization membership required',
      403,
      'MEMBERSHIP_REQUIRED',
    );
  }
  const tokens = issueTokens(userId, session.organizationId, session.id);
  const updated = await prisma.userSession.updateMany({
    where: { id: session.id, refreshTokenHash: oldHash, revokedAt: null },
    data: {
      refreshTokenHash: digest(tokens.refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400_000),
    },
  });
  if (updated.count !== 1) {
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(
      'Refresh token reuse detected; sessions revoked',
      401,
      'REFRESH_REUSE_DETECTED',
    );
  }
  return tokens;
}

export async function logout(sessionId: string) {
  await prisma.userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { permissionKeys };
