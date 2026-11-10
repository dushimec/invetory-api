import { prisma } from '../config/db.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/app-error.js';
import type { z } from 'zod';
import { organizationSettingsUpdateSchema } from '../validators/organization.validator.js';

type SettingsUpdate = z.infer<typeof organizationSettingsUpdateSchema>;

export async function getOrganizationSettings(organizationId: string) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!settings) {
    throw new AppError(
      'Organization settings are missing',
      500,
      'CONFIGURATION_ERROR',
    );
  }
  return settings;
}

export async function updateOrganizationSettings(
  organizationId: string,
  actorId: string,
  input: SettingsUpdate,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.organizationSettings.findUnique({
      where: { organizationId },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!settings) {
      throw new AppError(
        'Organization settings are missing',
        500,
        'CONFIGURATION_ERROR',
      );
    }
    const updated = await tx.organizationSettings.update({
      where: { organizationId },
      data: {
        ...input,
        ...(input.salesTaxRate !== undefined
          ? { salesTaxRate: new Prisma.Decimal(input.salesTaxRate) }
          : {}),
        ...(input.maxSalesDiscountPercent !== undefined
          ? {
              maxSalesDiscountPercent: new Prisma.Decimal(
                input.maxSalesDiscountPercent,
              ),
            }
          : {}),
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    if (
      input.businessName &&
      input.businessName !== settings.organization.name
    ) {
      await tx.organization.update({
        where: { id: organizationId },
        data: { name: input.businessName },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'organization.settings.updated',
        entityType: 'organization_settings',
        entityId: settings.id,
        requestId,
        changes: input,
      },
    });
    return {
      ...updated,
      organization: {
        ...updated.organization,
        ...(input.businessName ? { name: input.businessName } : {}),
      },
    };
  });
}
