import type { RequestHandler } from 'express';
import { prisma } from '../config/db.js';
import { success } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditEvent } from '../services/audit.service.js';
import {
  defaultRoleDescriptions,
  defaultRoleDuties,
} from '../services/auth.service.js';
import {
  roleCreateSchema,
  roleParamsSchema,
  roleUpdateSchema,
} from '../validators/role.validator.js';

export const list: RequestHandler = async (req, res) => {
  const [roles, availablePermissions] = await prisma.$transaction([
    prisma.role.findMany({
      where: {
        OR: [
          { organizationId: req.auth!.organizationId },
          { organizationId: null },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        duties: true,
        isSystem: true,
        permissions: {
          select: {
            permission: {
              select: { key: true, description: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.permission.findMany({
      select: { key: true, description: true },
      orderBy: { key: 'asc' },
    }),
  ]);
  success(
    res,
    'Organization roles retrieved successfully',
    {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        isSystem: role.isSystem,
        description:
          role.description ||
          defaultRoleDescriptions[role.name] ||
          'Custom organization role.',
        duties:
          role.duties.length > 0
            ? role.duties
            : (defaultRoleDuties[role.name] ?? []),
        permissions: role.permissions
          .map(({ permission }) => permission)
          .sort((left, right) => left.key.localeCompare(right.key)),
      })),
      availablePermissions,
    },
  );
};

async function permissionIdsFor(keys: string[]) {
  const permissions = await prisma.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true },
  });
  if (permissions.length !== keys.length) {
    const found = new Set(permissions.map(({ key }) => key));
    const invalid = keys.filter((key) => !found.has(key));
    throw new AppError(
      `Unknown permissions: ${invalid.join(', ')}`,
      400,
      'INVALID_PERMISSION',
    );
  }
  return permissions;
}

export const create: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const input = roleCreateSchema.parse(req.body);
  if (defaultRoleDescriptions[input.name]) {
    throw new AppError(
      'This name is reserved for a built-in role',
      409,
      'RESERVED_ROLE_NAME',
    );
  }
  const permissions = await permissionIdsFor(input.permissions);
  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description,
        duties: input.duties,
        isSystem: false,
        permissions: {
          create: permissions.map(({ id }) => ({ permissionId: id })),
        },
      },
      include: {
        permissions: {
          include: { permission: { select: { key: true, description: true } } },
        },
      },
    });
    await writeAuditEvent(tx, {
      organizationId,
      actorId,
      action: 'role.created',
      entityType: 'role',
      entityId: created.id,
      requestId: req.requestId,
      changes: {
        name: created.name,
        description: created.description,
        duties: created.duties,
        permissions: input.permissions,
      },
    });
    return created;
  });
  success(
    res,
    'Role created successfully',
    {
      id: role.id,
      name: role.name,
      description: role.description,
      duties: role.duties,
      isSystem: role.isSystem,
      permissions: role.permissions.map(({ permission }) => permission),
    },
    201,
  );
};

export const update: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const { id } = roleParamsSchema.parse(req.params);
  const input = roleUpdateSchema.parse(req.body);
  if (input.name && defaultRoleDescriptions[input.name]) {
    throw new AppError(
      'This name is reserved for a built-in role',
      409,
      'RESERVED_ROLE_NAME',
    );
  }
  const current = await prisma.role.findFirst({
    where: { id, organizationId },
    select: { id: true, isSystem: true },
  });
  if (!current) throw new AppError('Role not found', 404, 'NOT_FOUND');
  if (current.isSystem) {
    throw new AppError(
      'Built-in roles cannot be edited',
      403,
      'SYSTEM_ROLE_PROTECTED',
    );
  }
  const permissions =
    input.permissions === undefined
      ? undefined
      : await permissionIdsFor(input.permissions);
  const role = await prisma.$transaction(async (tx) => {
    if (permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map(({ id: permissionId }) => ({
            roleId: id,
            permissionId,
          })),
        });
      }
    }
    const updated = await tx.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.duties !== undefined ? { duties: input.duties } : {}),
      },
      include: {
        permissions: {
          include: { permission: { select: { key: true, description: true } } },
        },
      },
    });
    await writeAuditEvent(tx, {
      organizationId,
      actorId,
      action: 'role.updated',
      entityType: 'role',
      entityId: id,
      requestId: req.requestId,
      changes: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.duties !== undefined ? { duties: input.duties } : {}),
        ...(input.permissions !== undefined
          ? { permissions: input.permissions }
          : {}),
      },
    });
    return updated;
  });
  success(res, 'Role updated successfully', role);
};

export const remove: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const { id } = roleParamsSchema.parse(req.params);
  const role = await prisma.role.findFirst({
    where: { id, organizationId },
    select: { id: true, name: true, isSystem: true },
  });
  if (!role) throw new AppError('Role not found', 404, 'NOT_FOUND');
  if (role.isSystem) {
    throw new AppError(
      'Built-in roles cannot be deleted',
      403,
      'SYSTEM_ROLE_PROTECTED',
    );
  }
  const assigned = await prisma.organizationMembership.count({
    where: { organizationId, roleId: id },
  });
  if (assigned) {
    throw new AppError(
      'Reassign staff accounts before deleting this role',
      409,
      'ROLE_IN_USE',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await writeAuditEvent(tx, {
      organizationId,
      actorId,
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      requestId: req.requestId,
      changes: { name: role.name },
    });
  });
  success(res, 'Role deleted successfully', { id });
};
