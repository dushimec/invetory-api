import { createHash, randomUUID } from 'node:crypto';
import {
  MovementType,
  Prisma,
  type Prisma as PrismaTypes,
} from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';

type Transaction = PrismaTypes.TransactionClient;

function quantity(value: string) {
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
  if (!result.isFinite() || result.lte(0))
    throw new AppError(
      'Quantity must be greater than zero',
      400,
      'VALIDATION_ERROR',
    );
  return result;
}

function hash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function number() {
  return `SO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function deliveryNumber() {
  return `DL-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function lockSalesOrder(
  tx: Transaction,
  organizationId: string,
  id: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "SalesOrder"
    WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (!locked.length)
    throw new AppError('Sales order not found', 404, 'NOT_FOUND');
  return tx.salesOrder.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { product: { select: { trackingMode: true } } } } },
  });
}

async function lockBalance(
  tx: Transaction,
  key: {
    organizationId: string;
    productId: string;
    warehouseId: string;
    locationId: string;
  },
) {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "InventoryBalance"
    WHERE "organizationId" = ${key.organizationId}::uuid
      AND "productId" = ${key.productId}::uuid
      AND "warehouseId" = ${key.warehouseId}::uuid
      AND "locationId" = ${key.locationId}::uuid
    FOR UPDATE
  `);
  const balance = await tx.inventoryBalance.findUnique({
    where: { organizationId_productId_warehouseId_locationId: key },
  });
  if (!balance)
    throw new AppError(
      'No stock balance exists for this product and location',
      409,
      'INSUFFICIENT_STOCK',
    );
  return balance;
}

async function assertIdempotency(
  tx: Transaction,
  organizationId: string,
  key: string,
  operation: string,
  requestHash: string,
): Promise<void> {
  const record = await tx.idempotencyRecord.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!record) return;
  if (record.operation !== operation || record.requestHash !== requestHash) {
    throw new AppError(
      'Idempotency key was already used for another request',
      409,
      'IDEMPOTENCY_CONFLICT',
    );
  }
}

async function recordIdempotency(
  tx: Transaction,
  organizationId: string,
  key: string,
  operation: string,
  requestHash: string,
  salesOrderId: string,
) {
  await tx.idempotencyRecord.create({
    data: {
      organizationId,
      key,
      operation,
      requestHash,
      response: { salesOrderId },
    },
  });
}

export async function createSalesOrder(
  organizationId: string,
  actorId: string,
  input: {
    customerId?: string;
    warehouseId: string;
    deliveryAddress?: string;
    estimatedDeliveryAt?: string;
    notes?: string;
    items: Array<{ productId: string; quantity: string }>;
  },
  requestId?: string,
) {
  if (!input.items.length)
    throw new AppError(
      'At least one sales line is required',
      400,
      'VALIDATION_ERROR',
    );
  if (
    new Set(input.items.map(({ productId }) => productId)).size !==
    input.items.length
  ) {
    throw new AppError(
      'Duplicate product lines are not supported; combine quantities',
      400,
      'DUPLICATE_PRODUCT_LINE',
    );
  }
  return prisma.$transaction(async (tx) => {
    const [warehouse, customer, products, settings] = await Promise.all([
      tx.warehouse.findFirst({
        where: { id: input.warehouseId, organizationId, isActive: true },
        select: { id: true },
      }),
      input.customerId
        ? tx.customer.findFirst({
            where: { id: input.customerId, organizationId, isActive: true },
            select: { id: true },
          })
        : Promise.resolve(null),
      tx.product.findMany({
        where: {
          organizationId,
          isActive: true,
          id: { in: input.items.map(({ productId }) => productId) },
        },
        select: { id: true, sellingPrice: true, trackingMode: true },
      }),
      tx.organizationSettings.findUnique({
        where: { organizationId },
        select: { baseCurrency: true },
      }),
    ]);
    if (!warehouse || !settings || (input.customerId && !customer))
      throw new AppError(
        'Customer or warehouse is invalid for this organization',
        400,
        'INVALID_REFERENCE',
      );
    if (products.length !== input.items.length)
      throw new AppError(
        'One or more products are invalid for this organization',
        400,
        'INVALID_REFERENCE',
      );
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const lines = input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const qty = quantity(item.quantity);
      return {
        productId: item.productId,
        quantity: qty,
        unitPrice: product.sellingPrice,
        lineTotal: qty.mul(product.sellingPrice),
      };
    });
    const total = lines.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Prisma.Decimal(0),
    );
    const order = await tx.salesOrder.create({
      data: {
        organizationId,
        customerId: customer?.id,
        warehouseId: warehouse.id,
        number: number(),
        currency: settings.baseCurrency,
        subtotal: total,
        total,
        deliveryAddress: input.deliveryAddress,
        estimatedDeliveryAt: input.estimatedDeliveryAt
          ? new Date(input.estimatedDeliveryAt)
          : undefined,
        createdById: actorId,
        items: { create: lines },
      },
      include: {
        customer: true,
        warehouse: true,
        items: { include: { product: true } },
        deliveries: { include: { items: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'sales_order.created',
        entityType: 'sales_order',
        entityId: order.id,
        requestId,
        changes: { number: order.number, total: total.toString() },
      },
    });
    return order;
  });
}

export async function listSalesOrders(
  organizationId: string,
  options: {
    page: number;
    pageSize: number;
    status?: string;
    warehouseId?: string;
  },
) {
  const where = {
    organizationId,
    ...(options.status
      ? { status: options.status as PrismaTypes.EnumSalesStatusFilter }
      : {}),
    ...(options.warehouseId ? { warehouseId: options.warehouseId } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.salesOrder.findMany({
      where,
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      include: {
        customer: true,
        warehouse: true,
        items: { include: { product: true } },
        deliveries: { include: { items: true }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.salesOrder.count({ where }),
  ]);
  return {
    data,
    meta: {
      ...options,
      totalItems,
      totalPages: Math.ceil(totalItems / options.pageSize),
    },
  };
}

export async function getSalesOrder(organizationId: string, id: string) {
  const order = await prisma.salesOrder.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      warehouse: true,
      items: { include: { product: true } },
      reservations: true,
      deliveries: {
        include: {
          items: {
            include: {
              salesOrderItem: {
                include: { product: { select: { id: true, sku: true, name: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!order) throw new AppError('Sales order not found', 404, 'NOT_FOUND');
  return order;
}

export async function confirmSalesOrder(
  organizationId: string,
  actorId: string,
  id: string,
  requireSeparationOfDuties: boolean,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await lockSalesOrder(tx, organizationId, id);
    if (order.status === 'CONFIRMED') return order;
    if (order.status !== 'DRAFT')
      throw new AppError(
        'Only draft sales orders can be confirmed',
        409,
        'INVALID_STATE',
      );
    if (requireSeparationOfDuties && order.createdById === actorId)
      throw new AppError(
        'The order creator cannot confirm this sales order',
        403,
        'SEPARATION_OF_DUTIES',
      );
    const updated = await tx.salesOrder.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'sales_order.confirmed',
        entityType: 'sales_order',
        entityId: id,
        requestId,
      },
    });
    return updated;
  });
}

export async function reserveSalesOrder(
  organizationId: string,
  actorId: string,
  id: string,
  idempotencyKey: string,
  requestId?: string,
) {
  const operation = 'sales_order.reserve';
  const requestHash = hash({ id, operation });
  return prisma.$transaction(async (tx) => {
    const order = await lockSalesOrder(tx, organizationId, id);
    await assertIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
    );
    const previous = await tx.idempotencyRecord.findUnique({
      where: { organizationId_key: { organizationId, key: idempotencyKey } },
    });
    if (previous)
      return tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: { items: true, reservations: true },
      });
    if (order.status === 'RESERVED') return order;
    if (order.status !== 'CONFIRMED')
      throw new AppError(
        'Only confirmed sales orders can reserve stock',
        409,
        'INVALID_STATE',
      );
    const balances = await tx.inventoryBalance.findMany({
      where: {
        organizationId,
        warehouseId: order.warehouseId,
        productId: { in: order.items.map(({ productId }) => productId) },
      },
      orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
    });
    const byProduct = new Map<string, typeof balances>();
    for (const balance of balances)
      byProduct.set(balance.productId, [
        ...(byProduct.get(balance.productId) ?? []),
        balance,
      ]);
    for (const item of order.items) {
      let remaining = item.quantity.sub(item.quantityIssued);
      if (item.product.trackingMode === 'SERIAL') {
        if (!remaining.isInteger()) {
          throw new AppError(
            'Serial-tracked order quantities must be whole numbers',
            400,
            'SERIAL_QUANTITY_INVALID',
          );
        }
        const serials = await tx.stockSerial.findMany({
          where: {
            organizationId,
            productId: item.productId,
            warehouseId: order.warehouseId,
            status: 'AVAILABLE',
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: remaining.toNumber(),
        });
        if (serials.length !== remaining.toNumber()) {
          throw new AppError(
            `Insufficient available serials for product ${item.productId}`,
            409,
            'INSUFFICIENT_STOCK',
          );
        }
        for (const serial of serials) {
          if (!serial.locationId) {
            throw new AppError(
              `Serial ${serial.serialNumber} has no inventory location`,
              409,
              'INVENTORY_INVARIANT_VIOLATION',
            );
          }
          const key = {
            organizationId,
            productId: item.productId,
            warehouseId: order.warehouseId,
            locationId: serial.locationId,
          };
          const balance = await lockBalance(tx, key);
          if (balance.onHand.sub(balance.reserved).lt(1)) {
            throw new AppError(
              `Serial ${serial.serialNumber} is not available in its inventory balance`,
              409,
              'INVENTORY_INVARIANT_VIOLATION',
            );
          }
          const changed = await tx.stockSerial.updateMany({
            where: { id: serial.id, status: 'AVAILABLE' },
            data: { status: 'RESERVED' },
          });
          if (changed.count !== 1) {
            throw new AppError(
              `Serial ${serial.serialNumber} was reserved concurrently`,
              409,
              'INSUFFICIENT_STOCK',
            );
          }
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { reserved: { increment: 1 } },
          });
          await tx.inventoryReservation.create({
            data: {
              organizationId,
              salesOrderId: id,
              productId: item.productId,
              warehouseId: order.warehouseId,
              locationId: serial.locationId,
              serialNumberId: serial.id,
              quantity: 1,
              status: 'ACTIVE',
            },
          });
        }
        continue;
      }
      for (const candidate of byProduct.get(item.productId) ?? []) {
        if (!remaining.gt(0)) break;
        const key = {
          organizationId,
          productId: item.productId,
          warehouseId: order.warehouseId,
          locationId: candidate.locationId,
        };
        const balance = await lockBalance(tx, key);
        const available = balance.onHand.sub(balance.reserved);
        if (!available.gt(0)) continue;
        const reserved = available.lt(remaining) ? available : remaining;
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { reserved: { increment: reserved } },
        });
        await tx.inventoryReservation.create({
          data: {
            organizationId,
            salesOrderId: id,
            productId: item.productId,
            warehouseId: order.warehouseId,
            locationId: candidate.locationId,
            quantity: reserved,
            status: 'ACTIVE',
          },
        });
        remaining = remaining.sub(reserved);
      }
      if (remaining.gt(0))
        throw new AppError(
          `Insufficient available stock for product ${item.productId}`,
          409,
          'INSUFFICIENT_STOCK',
        );
    }
    const updated = await tx.salesOrder.update({
      where: { id },
      data: { status: 'RESERVED' },
    });
    await recordIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
      id,
    );
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'sales_order.reserved',
        entityType: 'sales_order',
        entityId: id,
        requestId,
      },
    });
    return updated;
  });
}

export async function dispatchSalesOrder(
  organizationId: string,
  actorId: string,
  id: string,
  idempotencyKey: string,
  input: { items?: Array<{ productId: string; quantity: string }> },
  requestId?: string,
) {
  const operation = 'sales_order.dispatch';
  const requestHash = hash({ id, operation, items: input.items ?? null });
  return prisma.$transaction(async (tx) => {
    const order = await lockSalesOrder(tx, organizationId, id);
    await assertIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
    );
    const previous = await tx.idempotencyRecord.findUnique({
      where: { organizationId_key: { organizationId, key: idempotencyKey } },
    });
    if (previous)
      return tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: {
          items: true,
          deliveries: {
            include: { items: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    if (!['RESERVED', 'PARTIALLY_FULFILLED'].includes(order.status))
      throw new AppError(
        'Sales order must have reserved stock before dispatch',
        409,
        'INVALID_STATE',
      );
    const requested =
      input.items ??
      order.items
        .filter((item) => item.quantity.gt(item.quantityIssued))
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity.sub(item.quantityIssued).toString(),
        }));
    if (
      new Set(requested.map(({ productId }) => productId)).size !==
      requested.length
    ) {
      throw new AppError(
        'Duplicate dispatch product lines are not supported',
        400,
        'DUPLICATE_PRODUCT_LINE',
      );
    }
    const deliveryItems: Array<{
      salesOrderItemId: string;
      quantity: Prisma.Decimal;
      serialNumbers: string[];
    }> = [];
    for (const requestLine of requested) {
      const item = order.items.find(
        ({ productId }) => productId === requestLine.productId,
      );
      if (!item)
        throw new AppError(
          'Dispatch product is not part of this order',
          400,
          'INVALID_REFERENCE',
        );
      const dispatchQuantity = quantity(requestLine.quantity);
      if (
        item.product.trackingMode === 'SERIAL' &&
        !dispatchQuantity.isInteger()
      ) {
        throw new AppError(
          'Serial-tracked dispatch quantities must be whole numbers',
          400,
          'SERIAL_QUANTITY_INVALID',
        );
      }
      const remainingOrderQuantity = item.quantity.sub(item.quantityIssued);
      if (dispatchQuantity.gt(remainingOrderQuantity))
        throw new AppError(
          'Dispatch exceeds the unfulfilled quantity',
          409,
          'OVER_FULFILLMENT',
        );
      let remaining = dispatchQuantity;
      const dispatchedSerialNumbers: string[] = [];
      const reservations = await tx.inventoryReservation.findMany({
        where: {
          organizationId,
          salesOrderId: id,
          productId: item.productId,
          status: 'ACTIVE',
        },
        orderBy: [{ createdAt: 'asc' }, { locationId: 'asc' }],
        include: { serialNumber: true },
      });
      for (const reservation of reservations) {
        if (!remaining.gt(0)) break;
        const useQuantity = reservation.quantity.lt(remaining)
          ? reservation.quantity
          : remaining;
        const key = {
          organizationId,
          productId: item.productId,
          warehouseId: order.warehouseId,
          locationId: reservation.locationId,
        };
        const balance = await lockBalance(tx, key);
        if (
          balance.onHand.lt(useQuantity) ||
          balance.reserved.lt(useQuantity)
        ) {
          throw new AppError(
            'Stock reservation no longer matches the inventory balance',
            409,
            'INVENTORY_INVARIANT_VIOLATION',
          );
        }
        const after = balance.onHand.sub(useQuantity);
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHand: after, reserved: { decrement: useQuantity } },
        });
        const dispatchKey = `sales-${id}-${idempotencyKey}-${item.productId}-${reservation.id}`;
        const existingMovement = await tx.inventoryMovement.findFirst({
          where: { organizationId, idempotencyKey: dispatchKey },
        });
        if (existingMovement)
          throw new AppError(
            'Dispatch movement already exists without matching idempotency record',
            409,
            'IDEMPOTENCY_CONFLICT',
          );
        await tx.inventoryMovement.create({
          data: {
            ...key,
            type: MovementType.SALE_ISSUE,
            quantityDelta: useQuantity.negated(),
            quantityBefore: balance.onHand,
            quantityAfter: after,
            unitCost: balance.averageCost,
            sourceType: 'sales_order',
            sourceId: id,
            idempotencyKey: dispatchKey,
            requestHash,
            actorId,
            reason: `Dispatch ${order.number}`,
          },
        });
        const remainingReservation = reservation.quantity.sub(useQuantity);
        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: remainingReservation.eq(0)
            ? { status: 'CONSUMED' }
            : { quantity: remainingReservation, status: 'ACTIVE' },
        });
        if (item.product.trackingMode === 'SERIAL') {
          if (!reservation.serialNumber || !useQuantity.eq(1)) {
            throw new AppError(
              'Serial reservation is missing its unique stock identity',
              409,
              'INVENTORY_INVARIANT_VIOLATION',
            );
          }
          const changed = await tx.stockSerial.updateMany({
            where: {
              id: reservation.serialNumber.id,
              status: 'RESERVED',
              warehouseId: order.warehouseId,
            },
            data: {
              status: 'IN_TRANSIT',
              issuedSalesOrderItemId: item.id,
            },
          });
          if (changed.count !== 1) {
            throw new AppError(
              `Serial ${reservation.serialNumber.serialNumber} is not reserved for dispatch`,
              409,
              'INVENTORY_INVARIANT_VIOLATION',
            );
          }
          dispatchedSerialNumbers.push(reservation.serialNumber.serialNumber);
        }
        remaining = remaining.sub(useQuantity);
      }
      if (remaining.gt(0))
        throw new AppError(
          `Insufficient reserved stock for product ${item.productId}`,
          409,
          'INSUFFICIENT_RESERVED_STOCK',
        );
      await tx.salesOrderItem.update({
        where: { id: item.id },
        data: { quantityIssued: { increment: dispatchQuantity } },
      });
      deliveryItems.push({
        salesOrderItemId: item.id,
        quantity: dispatchQuantity,
        serialNumbers: dispatchedSerialNumbers,
      });
    }
    const refreshed = await tx.salesOrderItem.findMany({
      where: { salesOrderId: id },
    });
    const complete = refreshed.every((item) =>
      item.quantityIssued.gte(item.quantity),
    );
    const updated = await tx.salesOrder.update({
      where: { id },
      data: { status: complete ? 'FULFILLED' : 'PARTIALLY_FULFILLED' },
    });
    const delivery = await tx.salesDelivery.create({
      data: {
        organizationId,
        salesOrderId: id,
        number: deliveryNumber(),
        deliveryAddress: order.deliveryAddress,
        estimatedDeliveryAt: order.estimatedDeliveryAt,
        createdById: actorId,
        items: { create: deliveryItems },
      },
      include: { items: true },
    });
    await recordIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
      id,
    );
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'sales_order.dispatched',
        entityType: 'sales_order',
        entityId: id,
        requestId,
        changes: { lines: requested },
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'sales_delivery.created',
        entityType: 'sales_delivery',
        entityId: delivery.id,
        requestId,
        changes: { number: delivery.number, salesOrderId: id },
      },
    });
    return {
      ...updated,
      deliveries: [delivery],
    };
  });
}

export async function updateSalesDelivery(
  organizationId: string,
  actorId: string,
  id: string,
  deliveryId: string,
  input: {
    status: 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
    deliveryAddress?: string | null;
    carrier?: string | null;
    driverName?: string | null;
    driverPhone?: string | null;
    trackingReference?: string | null;
    estimatedDeliveryAt?: string | null;
    proofOfDelivery?: string | null;
  },
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await lockSalesOrder(tx, organizationId, id);
    const delivery = await tx.salesDelivery.findFirst({
      where: { id: deliveryId, organizationId, salesOrderId: order.id },
      include: { items: true },
    });
    if (!delivery) {
      throw new AppError(
        'Sales delivery not found',
        404,
        'NOT_FOUND',
      );
    }
    if (delivery.status === 'DELIVERED' && input.status !== 'DELIVERED') {
      throw new AppError(
        'A delivered shipment cannot transition to another delivery status',
        409,
        'INVALID_STATE',
      );
    }
    const updated = await tx.salesDelivery.update({
      where: { id: deliveryId },
      data: {
        status: input.status,
        ...(input.deliveryAddress !== undefined
          ? { deliveryAddress: input.deliveryAddress }
          : {}),
        ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
        ...(input.driverName !== undefined
          ? { driverName: input.driverName }
          : {}),
        ...(input.driverPhone !== undefined
          ? { driverPhone: input.driverPhone }
          : {}),
        ...(input.trackingReference !== undefined
          ? { trackingReference: input.trackingReference }
          : {}),
        ...(input.estimatedDeliveryAt !== undefined
          ? {
              estimatedDeliveryAt: input.estimatedDeliveryAt
                ? new Date(input.estimatedDeliveryAt)
                : null,
            }
          : {}),
        ...(input.proofOfDelivery !== undefined
          ? { proofOfDelivery: input.proofOfDelivery }
          : {}),
        deliveredAt:
          input.status === 'DELIVERED'
            ? (delivery.deliveredAt ?? new Date())
            : input.status === 'IN_TRANSIT'
              ? null
              : undefined,
      },
      include: { items: true },
    });
    if (input.status === 'DELIVERED') {
      for (const item of delivery.items) {
        if (!item.serialNumbers.length) continue;
        const serials = await tx.stockSerial.updateMany({
          where: {
            organizationId,
            productId: (
              await tx.salesOrderItem.findUniqueOrThrow({
                where: { id: item.salesOrderItemId },
                select: { productId: true },
              })
            ).productId,
            serialNumber: { in: item.serialNumbers },
            issuedSalesOrderItemId: item.salesOrderItemId,
            status: 'IN_TRANSIT',
          },
          data: { status: 'ISSUED' },
        });
        if (serials.count !== item.serialNumbers.length) {
          throw new AppError(
            'Shipment serial state does not match the delivery record',
            409,
            'INVENTORY_INVARIANT_VIOLATION',
          );
        }
      }
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: `sales_delivery.${input.status.toLowerCase()}`,
        entityType: 'sales_delivery',
        entityId: deliveryId,
        requestId,
        changes: {
          status: input.status,
          ...(input.trackingReference !== undefined
            ? { trackingReference: input.trackingReference }
            : {}),
        },
      },
    });
    return updated;
  });
}

export async function cancelSalesOrder(
  organizationId: string,
  actorId: string,
  id: string,
  idempotencyKey: string,
  requestId?: string,
) {
  const operation = 'sales_order.cancel';
  const requestHash = hash({ id, operation });
  return prisma.$transaction(async (tx) => {
    const order = await lockSalesOrder(tx, organizationId, id);
    await assertIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
    );
    const previous = await tx.idempotencyRecord.findUnique({
      where: { organizationId_key: { organizationId, key: idempotencyKey } },
    });
    if (previous)
      return tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
    if (['FULFILLED', 'COMPLETED', 'CANCELLED'].includes(order.status))
      throw new AppError(
        'Sales order cannot be cancelled in its current state',
        409,
        'INVALID_STATE',
      );
    const reservations = await tx.inventoryReservation.findMany({
      where: { organizationId, salesOrderId: id, status: 'ACTIVE' },
      orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
    });
    for (const reservation of reservations) {
      const key = {
        organizationId,
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        locationId: reservation.locationId,
      };
      const balance = await lockBalance(tx, key);
      if (balance.reserved.lt(reservation.quantity))
        throw new AppError(
          'Reservation balance invariant failed',
          409,
          'INVENTORY_INVARIANT_VIOLATION',
        );
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { reserved: { decrement: reservation.quantity } },
      });
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED' },
      });
      if (reservation.serialNumberId) {
        const serial = await tx.stockSerial.updateMany({
          where: {
            id: reservation.serialNumberId,
            status: 'RESERVED',
          },
          data: { status: 'AVAILABLE' },
        });
        if (serial.count !== 1) {
          throw new AppError(
            'Reserved serial state does not match the inventory reservation',
            409,
            'INVENTORY_INVARIANT_VIOLATION',
          );
        }
      }
    }
    const updated = await tx.salesOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await recordIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
      id,
    );
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'sales_order.cancelled',
        entityType: 'sales_order',
        entityId: id,
        requestId,
      },
    });
    return updated;
  });
}
