import type { RequestHandler } from 'express';
import argon2 from 'argon2';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';
import { writeAuditEvent } from '../services/audit.service.js';
import {
  membershipUpdateSchema,
  userCreateSchema,
  userParamsSchema,
  usersListSchema,
} from '../validators/user.validator.js';

export { userParamsSchema, usersListSchema, membershipUpdateSchema };

export const create: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const input = userCreateSchema.parse(req.body);
  const role = await prisma.role.findFirst({
    where: {
      id: input.roleId,
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { id: true, name: true },
  });
  if (!role)
    throw new AppError('Role not found in this organization', 404, 'INVALID_ROLE');
  if (role.name === 'Organization Owner') {
    throw new AppError(
      'The organization owner role cannot be assigned to staff accounts',
      403,
      'OWNER_PROTECTED',
    );
  }
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true },
  });
  if (existingUser) {
    throw new AppError(
      'An account already exists for this email address',
      409,
      'EMAIL_ALREADY_REGISTERED',
    );
  }
  const passwordHash = await argon2.hash(input.temporaryPassword, {
    type: argon2.argon2id,
  });
  const membership = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        passwordHash,
        mustChangePassword: true,
      },
    });
    const createdMembership = await tx.organizationMembership.create({
      data: {
        organizationId,
        userId: user.id,
        roleId: role.id,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
    });
    await writeAuditEvent(tx, {
      organizationId,
      actorId,
      action: 'membership.created',
      entityType: 'organization_membership',
      entityId: createdMembership.id,
      requestId: req.requestId,
      changes: {
        email: createdMembership.user.email,
        roleId: role.id,
        roleName: role.name,
        mustChangePassword: true,
      },
    });
    return createdMembership;
  });
  success(res, 'Staff account created successfully', membership, 201);
};

export const list: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const query = usersListSchema.parse(req.query);
  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          user: {
            OR: [
              {
                fullName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          },
        }
      : {}),
  };
  const [memberships, totalItems] = await prisma.$transaction([
    prisma.organizationMembership.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
          },
        },
        role: { select: { id: true, name: true, isSystem: true } },
      },
      orderBy: [{ user: { fullName: 'asc' } }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.organizationMembership.count({ where }),
  ]);
  res.json({
    success: true,
    message: 'Organization users retrieved successfully',
    data: memberships,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  });
};

export const updateMembership: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const userId = String(req.params.id);
  const input = membershipUpdateSchema.parse(req.body);
  if (actorId === userId && input.status === 'SUSPENDED') {
    throw new AppError(
      'You cannot suspend your own membership',
      400,
      'SELF_SUSPENSION',
    );
  }
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.organizationMembership.findFirst({
      where: { organizationId, userId },
      include: { role: { select: { name: true } } },
    });
    if (!existing)
      throw new AppError('Organization user not found', 404, 'NOT_FOUND');
    if (existing.role.name === 'Organization Owner') {
      throw new AppError(
        'The organization owner membership cannot be modified here',
        403,
        'OWNER_PROTECTED',
      );
    }
    if (input.roleId) {
      const role = await tx.role.findFirst({
        where: {
          id: input.roleId,
          OR: [{ organizationId }, { organizationId: null }],
        },
        select: { id: true, name: true },
      });
      if (!role)
        throw new AppError(
          'Role not found in this organization',
          404,
          'INVALID_ROLE',
        );
      if (role.name === 'Organization Owner') {
        throw new AppError(
          'Owner role cannot be assigned using this endpoint',
          403,
          'OWNER_PROTECTED',
        );
      }
    }
    const membership = await tx.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.roleId ? { roleId: input.roleId } : {}),
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, isActive: true },
        },
        role: { select: { id: true, name: true } },
      },
    });
    await writeAuditEvent(tx, {
      organizationId,
      actorId,
      action: 'membership.updated',
      entityType: 'organization_membership',
      entityId: membership.id,
      requestId: req.requestId,
      changes: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.roleId ? { roleId: input.roleId } : {}),
      },
    });
    return membership;
  });
  success(res, 'Organization membership updated successfully', updated);
};
