import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import type { Prisma as PrismaTypes } from '@prisma/client';

export async function writeAuditEvent(
  tx: PrismaTypes.TransactionClient,
  input: {
    organizationId: string;
    actorId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    requestId?: string;
    reason?: string;
    changes?: PrismaTypes.InputJsonValue;
  },
) {
  return tx.auditLog.create({ data: input });
}

export interface AuditQuery {
  page: number;
  pageSize: number;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditLogs(organizationId: string, query: AuditQuery) {
  if (query.from && query.to && query.from > query.to) {
    throw new AppError(
      'from must be before or equal to to',
      400,
      'INVALID_DATE_RANGE',
    );
  }
  const where = {
    organizationId,
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.action
      ? { action: { contains: query.action, mode: 'insensitive' as const } }
      : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}
