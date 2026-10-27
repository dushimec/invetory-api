import { randomUUID } from 'node:crypto';
import {
  DocumentStatus,
  MovementType,
  Prisma,
  ReturnType as ReturnDocType,
  type Prisma as PrismaTypes,
} from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditEvent } from './audit.service.js';

type Transaction = PrismaTypes.TransactionClient;
type ReturnLine = {
  productId: string;
  locationId?: string;
  quantity: string;
  serialNumbers?: string[];
};

function decimal(value: string) {
  let result: Prisma.Decimal;
  try {
    result = new Prisma.Decimal(value);
  } catch {
    throw new AppError(
      'Quantity must be a decimal string',
      400,
      'VALIDATION_ERROR',
    );
  }
  if (!result.isFinite() || result.lte(0)) {
    throw new AppError(
      'Quantity must be greater than zero',
      400,
      'INVALID_QUANTITY',
    );
  }
  return result;
}

function returnNumber(type: ReturnDocType) {
  const prefix = type === 'CUSTOMER' ? 'CR' : 'SR';
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function audit(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  action: string,
  id: string,
  requestId?: string,
) {
  await writeAuditEvent(tx, {
    organizationId,
    actorId,
    action,
    entityType: 'InventoryReturn',
    entityId: id,
    requestId,
  });
}

async function lockReturn(tx: Transaction, organizationId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "InventoryReturn"
    WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (!rows.length) throw new AppError('Return not found', 404, 'NOT_FOUND');
  return tx.inventoryReturn.findUniqueOrThrow({
    where: { id },
    include: {
      items: true,
      warehouse: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function createReturn(
  organizationId: string,
  actorId: string,
  input: {
    type: ReturnDocType;
    warehouseId: string;
    salesOrderId?: string;
    purchaseOrderId?: string;
    reason: string;
    items: ReturnLine[];
  },
  requestId?: string,
) {
  if (
    (input.type === 'CUSTOMER') !== Boolean(input.salesOrderId) ||
    (input.type === 'SUPPLIER') !== Boolean(input.purchaseOrderId)
  ) {
    throw new AppError(
      'Customer returns require a salesOrderId; supplier returns require a purchaseOrderId',
      400,
      'INVALID_REFERENCE',
    );
  }
  if (
    new Set(input.items.map((item) => item.productId)).size !==
    input.items.length
  ) {
    throw new AppError(
      'Duplicate product lines are not supported',
      400,
      'DUPLICATE_LINE',
    );
  }
  return prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!warehouse)
      throw new AppError('Warehouse not found', 404, 'INVALID_REFERENCE');
    const products = await tx.product.findMany({
      where: {
        organizationId,
        isActive: true,
        id: { in: input.items.map((item) => item.productId) },
      },
      select: { id: true, trackingMode: true },
    });
    if (products.length !== input.items.length) {
      throw new AppError(
        'Product not found in this organization',
        404,
        'INVALID_REFERENCE',
      );
    }
    const trackingModes = new Map(
      products.map(({ id, trackingMode }) => [id, trackingMode]),
    );
    const providedSerials = input.items.flatMap(
      (item) => item.serialNumbers ?? [],
    );
    if (new Set(providedSerials).size !== providedSerials.length) {
      throw new AppError(
        'Serial numbers must be unique within the return',
        400,
        'DUPLICATE_SERIAL_NUMBER',
      );
    }
    for (const item of input.items) {
      const serialNumbers = item.serialNumbers ?? [];
      if (trackingModes.get(item.productId) === 'SERIAL') {
        const quantity = decimal(item.quantity);
        if (
          !quantity.isInteger() ||
          serialNumbers.length !== quantity.toNumber()
        ) {
          throw new AppError(
            'Serial-tracked returns require one serial number per whole unit',
            400,
            'SERIAL_NUMBERS_REQUIRED',
          );
        }
      } else if (serialNumbers.length) {
        throw new AppError(
          'Serial numbers can only be returned for serial-tracked products',
          400,
          'TRACKING_NOT_ENABLED',
        );
      }
    }
    if (input.type === 'CUSTOMER') {
      const order = await tx.salesOrder.findFirst({
        where: {
          id: input.salesOrderId,
          organizationId,
          warehouseId: warehouse.id,
        },
        include: { items: true },
      });
      if (
        !order ||
        !['FULFILLED', 'PARTIALLY_FULFILLED', 'COMPLETED'].includes(
          order.status,
        )
      ) {
        throw new AppError(
          'A fulfilled sales order in this organization is required',
          400,
          'INVALID_REFERENCE',
        );
      }
      if (
        input.items.some(
          (line) =>
            !order.items.some(
              (item) =>
                item.productId === line.productId && item.quantityIssued.gt(0),
            ),
        )
      ) {
        throw new AppError(
          'Return product was not issued on this sales order',
          400,
          'INVALID_REFERENCE',
        );
      }
      for (const line of input.items) {
        if (trackingModes.get(line.productId) !== 'SERIAL') continue;
        const sourceItems = order.items.filter(
          (item) => item.productId === line.productId,
        );
        const serials = await tx.stockSerial.findMany({
          where: {
            organizationId,
            productId: line.productId,
            serialNumber: { in: line.serialNumbers ?? [] },
            status: 'ISSUED',
            issuedSalesOrderItemId: {
              in: sourceItems.map(({ id }) => id),
            },
          },
          select: { serialNumber: true },
        });
        if (serials.length !== (line.serialNumbers ?? []).length) {
          throw new AppError(
            'Customer return serials must be issued on the selected sales order and not previously returned',
            409,
            'INVALID_SERIAL_RETURN',
          );
        }
      }
    } else {
      const order = await tx.purchaseOrder.findFirst({
        where: {
          id: input.purchaseOrderId,
          organizationId,
          warehouseId: warehouse.id,
        },
        include: { items: true },
      });
      if (
        !order ||
        !['PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'].includes(
          order.status,
        )
      ) {
        throw new AppError(
          'A received purchase order in this organization is required',
          400,
          'INVALID_REFERENCE',
        );
      }
      for (const line of input.items) {
        if (trackingModes.get(line.productId) !== 'SERIAL') continue;
        const sourceItems = order.items.filter(
          (item) => item.productId === line.productId,
        );
        const serials = await tx.stockSerial.findMany({
          where: {
            organizationId,
            productId: line.productId,
            serialNumber: { in: line.serialNumbers ?? [] },
            status: 'AVAILABLE',
            warehouseId: warehouse.id,
            sourcePurchaseOrderItemId: {
              in: sourceItems.map(({ id }) => id),
            },
          },
          select: { serialNumber: true },
        });
        if (serials.length !== (line.serialNumbers ?? []).length) {
          throw new AppError(
            'Supplier return serials must be available stock received on the selected purchase order',
            409,
            'INVALID_SERIAL_RETURN',
          );
        }
      }
      if (
        input.items.some(
          (line) =>
            !order.items.some(
              (item) =>
                item.productId === line.productId &&
                item.quantityReceived.gt(0),
            ),
        )
      ) {
        throw new AppError(
          'Return product was not received on this purchase order',
          400,
          'INVALID_REFERENCE',
        );
      }
    }
    for (const line of input.items) {
      if (line.locationId) {
        const location = await tx.warehouseLocation.findFirst({
          where: {
            id: line.locationId,
            warehouseId: warehouse.id,
            isActive: true,
          },
          select: { id: true },
        });
        if (!location)
          throw new AppError(
            'Invalid return location',
            400,
            'INVALID_LOCATION',
          );
      }
    }
    const record = await tx.inventoryReturn.create({
      data: {
        organizationId,
        warehouseId: warehouse.id,
        type: input.type,
        number: returnNumber(input.type),
        reason: input.reason,
        salesOrderId: input.salesOrderId,
        purchaseOrderId: input.purchaseOrderId,
        requestedById: actorId,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            locationId: item.locationId,
            quantity: decimal(item.quantity),
            unitCost: 0,
            serialNumbers: item.serialNumbers ?? [],
          })),
        },
      },
      include: { items: true, warehouse: true },
    });
    await audit(
      tx,
      organizationId,
      actorId,
      'return.created',
      record.id,
      requestId,
    );
    return record;
  });
}

export async function listReturns(
  organizationId: string,
  query: {
    page: number;
    pageSize: number;
    type?: ReturnDocType;
    status?: DocumentStatus;
  },
) {
  const where = {
    organizationId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.inventoryReturn.findMany({
      where,
      include: {
        items: true,
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.inventoryReturn.count({ where }),
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

export async function getReturn(organizationId: string, id: string) {
  const record = await prisma.inventoryReturn.findFirst({
    where: { id, organizationId },
    include: {
      items: {
        include: { product: { select: { id: true, sku: true, name: true } } },
      },
      warehouse: true,
    },
  });
  if (!record) throw new AppError('Return not found', 404, 'NOT_FOUND');
  return record;
}

async function transition(
  organizationId: string,
  actorId: string,
  id: string,
  from: DocumentStatus[],
  to: DocumentStatus,
  action: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const record = await lockReturn(tx, organizationId, id);
    if (!from.includes(record.status)) {
      throw new AppError(
        'Return is not in a valid state for this action',
        409,
        'INVALID_STATE',
      );
    }
    if (to === 'APPROVED') {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId },
        select: { requireSeparationOfDuties: true },
      });
      if (!settings)
        throw new AppError(
          'Organization settings are missing',
          500,
          'CONFIGURATION_ERROR',
        );
      if (
        settings.requireSeparationOfDuties &&
        record.requestedById === actorId
      ) {
        throw new AppError(
          'The return creator cannot approve the same return',
          403,
          'SEPARATION_OF_DUTIES',
        );
      }
    }
    const updated = await tx.inventoryReturn.update({
      where: { id },
      data:
        to === 'APPROVED'
          ? { status: to, approvedById: actorId }
          : { status: to },
      include: { items: true },
    });
    await audit(tx, organizationId, actorId, action, id, requestId);
    return updated;
  });
}

export function submitReturn(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return transition(
    orgId,
    actorId,
    id,
    ['DRAFT'],
    'SUBMITTED',
    'return.submitted',
    requestId,
  );
}

export function approveReturn(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return transition(
    orgId,
    actorId,
    id,
    ['SUBMITTED'],
    'APPROVED',
    'return.approved',
    requestId,
  );
}

export function cancelReturn(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return transition(
    orgId,
    actorId,
    id,
    ['DRAFT', 'SUBMITTED', 'APPROVED'],
    'CANCELLED',
    'return.cancelled',
    requestId,
  );
}

async function lockSourceOrder(
  tx: Transaction,
  record: Awaited<ReturnType<typeof lockReturn>>,
) {
  if (record.salesOrderId) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SalesOrder"
      WHERE "id" = ${record.salesOrderId}::uuid
        AND "organizationId" = ${record.organizationId}::uuid
      FOR UPDATE
    `);
    if (!rows.length)
      throw new AppError(
        'Source sales order not found',
        409,
        'INVALID_REFERENCE',
      );
    return tx.salesOrder.findUniqueOrThrow({
      where: { id: record.salesOrderId },
      include: { items: true },
    });
  }
  if (!record.purchaseOrderId)
    throw new AppError('Return has no source order', 409, 'INVALID_REFERENCE');
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "PurchaseOrder"
    WHERE "id" = ${record.purchaseOrderId}::uuid
      AND "organizationId" = ${record.organizationId}::uuid
    FOR UPDATE
  `);
  if (!rows.length)
    throw new AppError(
      'Source purchase order not found',
      409,
      'INVALID_REFERENCE',
    );
  return tx.purchaseOrder.findUniqueOrThrow({
    where: { id: record.purchaseOrderId },
    include: { items: true },
  });
}

export async function postReturn(
  organizationId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const record = await lockReturn(tx, organizationId, id);
    if (record.status === 'POSTED') return record;
    if (record.status !== 'APPROVED') {
      throw new AppError(
        'Only approved returns can be posted',
        409,
        'INVALID_STATE',
      );
    }
    const source = await lockSourceOrder(tx, record);
    const isCustomer = record.type === 'CUSTOMER';
    const sourceItems = source.items as Array<{
      id: string;
      productId: string;
      quantityIssued?: Prisma.Decimal;
      quantityReceived?: Prisma.Decimal;
      unitCost?: Prisma.Decimal;
    }>;
    const sourceByProduct = new Map<
      string,
      {
        quantity: Prisma.Decimal;
        costValue: Prisma.Decimal;
        costQuantity: Prisma.Decimal;
      }
    >();
    for (const item of sourceItems) {
      const existing = sourceByProduct.get(item.productId) ?? {
        quantity: new Prisma.Decimal(0),
        costValue: new Prisma.Decimal(0),
        costQuantity: new Prisma.Decimal(0),
      };
      const quantity = isCustomer
        ? (item.quantityIssued ?? new Prisma.Decimal(0))
        : (item.quantityReceived ?? new Prisma.Decimal(0));
      existing.quantity = existing.quantity.add(quantity);
      if (!isCustomer && item.unitCost) {
        existing.costQuantity = existing.costQuantity.add(quantity);
        existing.costValue = existing.costValue.add(
          quantity.mul(item.unitCost),
        );
      }
      sourceByProduct.set(item.productId, existing);
    }
    const orderFilter = isCustomer
      ? { salesOrderId: record.salesOrderId }
      : { purchaseOrderId: record.purchaseOrderId };
    for (const line of record.items) {
      const sourceLine = sourceByProduct.get(line.productId);
      if (!sourceLine)
        throw new AppError(
          'Return product is not on the source order',
          409,
          'INVALID_REFERENCE',
        );
      const aggregate = await tx.inventoryReturnItem.aggregate({
        where: {
          productId: line.productId,
          return: {
            organizationId,
            status: 'POSTED',
            ...orderFilter,
            id: { not: record.id },
          },
        },
        _sum: { quantity: true },
      });
      const requestedForProduct = record.items
        .filter((item) => item.productId === line.productId)
        .reduce((sum, item) => sum.add(item.quantity), new Prisma.Decimal(0));
      if (
        (aggregate._sum.quantity ?? new Prisma.Decimal(0))
          .add(requestedForProduct)
          .gt(sourceLine.quantity)
      ) {
        throw new AppError(
          'Return quantity exceeds the source order quantity',
          409,
          'OVER_RETURN',
        );
      }
    }
    const defaultLocation = await tx.warehouseLocation.findFirst({
      where: { warehouseId: record.warehouseId, code: 'MAIN', isActive: true },
      select: { id: true },
    });
    if (!defaultLocation)
      throw new AppError(
        'Active MAIN location not found',
        409,
        'INVALID_LOCATION',
      );
    const settings = await tx.organizationSettings.findUnique({
      where: { organizationId },
      select: { allowNegativeStock: true },
    });
    if (!settings)
      throw new AppError(
        'Organization settings are missing',
        500,
        'CONFIGURATION_ERROR',
      );
    const trackingProducts = await tx.product.findMany({
      where: {
        organizationId,
        id: { in: [...new Set(record.items.map(({ productId }) => productId))] },
      },
      select: { id: true, trackingMode: true },
    });
    const trackingModes = new Map(
      trackingProducts.map(({ id: productId, trackingMode }) => [
        productId,
        trackingMode,
      ]),
    );
    const lines = [...record.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    for (const line of lines) {
      const locationId = line.locationId ?? defaultLocation.id;
      const key = {
        organizationId,
        productId: line.productId,
        warehouseId: record.warehouseId,
        locationId,
      };
      await tx.inventoryBalance.upsert({
        where: { organizationId_productId_warehouseId_locationId: key },
        create: { ...key, onHand: 0, reserved: 0, averageCost: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "InventoryBalance"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "productId" = ${line.productId}::uuid
          AND "warehouseId" = ${record.warehouseId}::uuid
          AND "locationId" = ${locationId}::uuid
        FOR UPDATE
      `);
      const balance = await tx.inventoryBalance.findUniqueOrThrow({
        where: { organizationId_productId_warehouseId_locationId: key },
      });
      const amount = isCustomer ? line.quantity : line.quantity.negated();
      const after = balance.onHand.add(amount);
      if (after.lt(balance.reserved)) {
        throw new AppError(
          'Return cannot reduce stock below reserved quantities',
          409,
          'RESERVED_STOCK',
        );
      }
      if (!settings.allowNegativeStock && after.lt(0)) {
        throw new AppError('Stock cannot be negative', 409, 'NEGATIVE_STOCK');
      }
      const sourceLine = sourceByProduct.get(line.productId)!;
      let unitCost = balance.averageCost;
      if (isCustomer && record.salesOrderId) {
        const issues = await tx.inventoryMovement.findMany({
          where: {
            organizationId,
            sourceType: 'sales_order',
            sourceId: record.salesOrderId,
            productId: line.productId,
            type: MovementType.SALE_ISSUE,
          },
          select: { quantityDelta: true, unitCost: true },
        });
        const issueQuantity = issues.reduce(
          (sum, issue) => sum.add(issue.quantityDelta.abs()),
          new Prisma.Decimal(0),
        );
        const issueCost = issues.reduce(
          (sum, issue) =>
            sum.add(issue.quantityDelta.abs().mul(issue.unitCost)),
          new Prisma.Decimal(0),
        );
        if (issueQuantity.gt(0)) unitCost = issueCost.div(issueQuantity);
      } else if (sourceLine.costQuantity.gt(0)) {
        unitCost = sourceLine.costValue.div(sourceLine.costQuantity);
      }
      const averageCost = isCustomer
        ? balance.onHand.gt(0)
          ? balance.onHand
              .mul(balance.averageCost)
              .add(line.quantity.mul(unitCost))
              .div(after)
          : unitCost
        : balance.onHand.gt(0)
          ? balance.onHand
              .mul(balance.averageCost)
              .sub(line.quantity.mul(unitCost))
              .div(after)
          : balance.averageCost;
      await tx.inventoryBalance.update({
        where: { organizationId_productId_warehouseId_locationId: key },
        data: { onHand: after, averageCost },
      });
      if (trackingModes.get(line.productId) === 'SERIAL') {
        if (
          !line.quantity.isInteger() ||
          line.serialNumbers.length !== line.quantity.toNumber()
        ) {
          throw new AppError(
            'Serial-tracked returns require one serial number per whole unit',
            409,
            'SERIAL_NUMBERS_REQUIRED',
          );
        }
        const sourceSerials = await tx.stockSerial.findMany({
          where: {
            organizationId,
            productId: line.productId,
            serialNumber: { in: line.serialNumbers },
            ...(isCustomer
              ? {
                  status: 'ISSUED' as const,
                  issuedSalesOrderItemId: {
                    in: sourceItems
                      .filter((item) => item.productId === line.productId)
                      .map(({ id: itemId }) => itemId),
                  },
                }
              : {
                  status: 'AVAILABLE' as const,
                  warehouseId: record.warehouseId,
                  sourcePurchaseOrderItemId: {
                    in: sourceItems
                      .filter((item) => item.productId === line.productId)
                      .map(({ id: itemId }) => itemId),
                  },
                }),
          },
          select: { id: true },
        });
        if (sourceSerials.length !== line.serialNumbers.length) {
          throw new AppError(
            'Return serials do not match available source inventory',
            409,
            'INVALID_SERIAL_RETURN',
          );
        }
        const changed = await tx.stockSerial.updateMany({
          where: {
            id: { in: sourceSerials.map(({ id: serialId }) => serialId) },
            status: isCustomer ? 'ISSUED' : 'AVAILABLE',
          },
          data: isCustomer
            ? {
                status: 'AVAILABLE',
                warehouseId: record.warehouseId,
                locationId,
              }
            : {
                status: 'SUPPLIER_RETURNED',
                warehouseId: null,
                locationId: null,
              },
        });
        if (changed.count !== sourceSerials.length) {
          throw new AppError(
            'Serial state changed while posting the return',
            409,
            'INVALID_SERIAL_RETURN',
          );
        }
      } else if (line.serialNumbers.length) {
        throw new AppError(
          'Serial numbers can only be returned for serial-tracked products',
          409,
          'TRACKING_NOT_ENABLED',
        );
      }
      await tx.inventoryMovement.create({
        data: {
          ...key,
          type: isCustomer
            ? MovementType.CUSTOMER_RETURN
            : MovementType.SUPPLIER_RETURN,
          quantityDelta: amount,
          quantityBefore: balance.onHand,
          quantityAfter: after,
          unitCost,
          sourceType: 'inventory_return',
          sourceId: record.id,
          idempotencyKey: `return-${record.id}-${line.id}`,
          requestHash: `${record.type}:${line.productId}:${line.quantity.toString()}`,
          reason: record.reason,
          actorId,
        },
      });
      await tx.inventoryReturnItem.update({
        where: { id: line.id },
        data: { locationId, unitCost },
      });
    }
    const updated = await tx.inventoryReturn.update({
      where: { id },
      data: { status: 'POSTED', postedAt: new Date(), postedById: actorId },
      include: { items: true },
    });
    await audit(tx, organizationId, actorId, 'return.posted', id, requestId);
    return updated;
  });
}
