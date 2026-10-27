import { createHash, randomUUID } from 'node:crypto';
import {
  MovementType,
  Prisma,
  TransferStatus,
  type Prisma as PrismaTypes,
} from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';

type Transaction = PrismaTypes.TransactionClient;

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function documentNumber() {
  return `TR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

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
      'VALIDATION_ERROR',
    );
  }
  return result;
}

async function audit(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  action: string,
  transferId: string,
  requestId?: string,
) {
  await tx.auditLog.create({
    data: {
      organizationId,
      actorId,
      action,
      entityType: 'StockTransfer',
      entityId: transferId,
      requestId,
    },
  });
}

async function lockTransfer(
  tx: Transaction,
  organizationId: string,
  id: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "StockTransfer"
    WHERE "id" = ${id}::uuid
      AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (!rows.length) throw new AppError('Transfer not found', 404, 'NOT_FOUND');
  return tx.stockTransfer.findUniqueOrThrow({
    where: { id },
    include: { items: true },
  });
}

async function getDefaultLocation(tx: Transaction, warehouseId: string) {
  const location = await tx.warehouseLocation.findFirst({
    where: { warehouseId, code: 'MAIN', isActive: true },
    select: { id: true },
  });
  if (!location) {
    throw new AppError(
      'Active MAIN location not found for transfer warehouse',
      409,
      'INVALID_LOCATION',
    );
  }
  return location.id;
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
  await tx.inventoryBalance.upsert({
    where: { organizationId_productId_warehouseId_locationId: key },
    create: { ...key, onHand: 0, reserved: 0, averageCost: 0 },
    update: {},
  });
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "InventoryBalance"
    WHERE "organizationId" = ${key.organizationId}::uuid
      AND "productId" = ${key.productId}::uuid
      AND "warehouseId" = ${key.warehouseId}::uuid
      AND "locationId" = ${key.locationId}::uuid
    FOR UPDATE
  `);
  return tx.inventoryBalance.findUniqueOrThrow({
    where: { organizationId_productId_warehouseId_locationId: key },
  });
}

async function assertIdempotency(
  tx: Transaction,
  organizationId: string,
  key: string,
  operation: string,
  requestHash: string,
) {
  const existing = await tx.idempotencyRecord.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (
    existing &&
    (existing.operation !== operation || existing.requestHash !== requestHash)
  ) {
    throw new AppError(
      'Idempotency key was already used for another request',
      409,
      'IDEMPOTENCY_CONFLICT',
    );
  }
  return existing;
}

async function recordIdempotency(
  tx: Transaction,
  organizationId: string,
  key: string,
  operation: string,
  requestHash: string,
  transferId: string,
) {
  await tx.idempotencyRecord.create({
    data: {
      organizationId,
      key,
      operation,
      requestHash,
      response: { transferId },
    },
  });
}

export async function createTransfer(
  organizationId: string,
  actorId: string,
  input: {
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    items: Array<{ productId: string; quantity: string }>;
  },
  requestId?: string,
) {
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw new AppError(
      'Source and destination warehouses must be different',
      400,
      'INVALID_TRANSFER',
    );
  }
  if (
    new Set(input.items.map((item) => item.productId)).size !==
    input.items.length
  ) {
    throw new AppError(
      'Duplicate product lines are not supported; combine quantities',
      400,
      'DUPLICATE_PRODUCT_LINE',
    );
  }
  return prisma.$transaction(async (tx) => {
    const [source, destination, products] = await Promise.all([
      tx.warehouse.findFirst({
        where: { id: input.sourceWarehouseId, organizationId, isActive: true },
        select: { id: true },
      }),
      tx.warehouse.findFirst({
        where: {
          id: input.destinationWarehouseId,
          organizationId,
          isActive: true,
        },
        select: { id: true },
      }),
      tx.product.findMany({
        where: {
          organizationId,
          isActive: true,
          id: { in: input.items.map((item) => item.productId) },
        },
        select: { id: true },
      }),
    ]);
    if (!source || !destination || products.length !== input.items.length) {
      throw new AppError(
        'Warehouse or product does not belong to this organization',
        404,
        'INVALID_REFERENCE',
      );
    }
    const transfer = await tx.stockTransfer.create({
      data: {
        organizationId,
        number: documentNumber(),
        sourceWarehouseId: source.id,
        destinationWarehouseId: destination.id,
        createdById: actorId,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: decimal(item.quantity),
          })),
        },
      },
      include: { items: true },
    });
    await audit(
      tx,
      organizationId,
      actorId,
      'transfer.created',
      transfer.id,
      requestId,
    );
    return transfer;
  });
}

export async function listTransfers(
  organizationId: string,
  query: { page: number; pageSize: number; status?: TransferStatus },
) {
  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.stockTransfer.findMany({
      where,
      include: {
        items: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockTransfer.count({ where }),
  ]);
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getTransfer(organizationId: string, id: string) {
  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId },
    include: {
      items: {
        include: { product: { select: { id: true, sku: true, name: true } } },
      },
      sourceWarehouse: true,
      destinationWarehouse: true,
    },
  });
  if (!transfer) throw new AppError('Transfer not found', 404, 'NOT_FOUND');
  return transfer;
}

async function changeStatus(
  organizationId: string,
  actorId: string,
  id: string,
  from: string[],
  to: 'SUBMITTED' | 'APPROVED' | 'CANCELLED',
  action: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, organizationId, id);
    if (!from.includes(transfer.status)) {
      throw new AppError(
        'Transfer is not in a valid state for this action',
        409,
        'INVALID_STATE',
      );
    }
    if (to === 'APPROVED' && transfer.createdById === actorId) {
      throw new AppError(
        'The transfer creator cannot approve the same transfer',
        403,
        'SEPARATION_OF_DUTIES',
      );
    }
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: { status: to },
      include: { items: true },
    });
    await audit(tx, organizationId, actorId, action, id, requestId);
    return updated;
  });
}

export function submitTransfer(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return changeStatus(
    orgId,
    actorId,
    id,
    ['DRAFT'],
    'SUBMITTED',
    'transfer.submitted',
    requestId,
  );
}

export function approveTransfer(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return changeStatus(
    orgId,
    actorId,
    id,
    ['SUBMITTED'],
    'APPROVED',
    'transfer.approved',
    requestId,
  );
}

export function cancelTransfer(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return changeStatus(
    orgId,
    actorId,
    id,
    ['DRAFT', 'SUBMITTED', 'APPROVED'],
    'CANCELLED',
    'transfer.cancelled',
    requestId,
  );
}

export async function dispatchTransfer(
  organizationId: string,
  actorId: string,
  id: string,
  idempotencyKey: string,
  requestId?: string,
) {
  const requestHash = hash({ id, action: 'dispatch' });
  const operation = 'transfer.dispatch';
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, organizationId, id);
    const existing = await assertIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
    );
    if (existing) return transfer;
    if (transfer.status !== 'APPROVED') {
      throw new AppError(
        'Only approved transfers can be dispatched',
        409,
        'INVALID_STATE',
      );
    }
    const locationId = await getDefaultLocation(tx, transfer.sourceWarehouseId);
    const lines = [...transfer.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    for (const line of lines) {
      const key = {
        organizationId,
        productId: line.productId,
        warehouseId: transfer.sourceWarehouseId,
        locationId,
      };
      const balance = await lockBalance(tx, key);
      const available = balance.onHand.sub(balance.reserved);
      if (available.lt(line.quantity)) {
        throw new AppError(
          `Insufficient available stock for product ${line.productId}`,
          409,
          'INSUFFICIENT_STOCK',
        );
      }
      const after = balance.onHand.sub(line.quantity);
      await tx.inventoryBalance.update({
        where: { organizationId_productId_warehouseId_locationId: key },
        data: { onHand: after },
      });
      await tx.inventoryMovement.create({
        data: {
          ...key,
          type: MovementType.TRANSFER_OUT,
          quantityDelta: line.quantity.negated(),
          quantityBefore: balance.onHand,
          quantityAfter: after,
          unitCost: balance.averageCost,
          sourceType: 'TRANSFER',
          sourceId: transfer.id,
          idempotencyKey: `${hash(idempotencyKey).slice(0, 48)}:${line.id}:out`,
          requestHash: hash({
            transferId: id,
            itemId: line.id,
            quantity: line.quantity.toString(),
          }),
          actorId,
        },
      });
    }
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: { status: 'IN_TRANSIT', dispatchedAt: new Date() },
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
    await audit(
      tx,
      organizationId,
      actorId,
      'transfer.dispatched',
      id,
      requestId,
    );
    return updated;
  });
}

export async function receiveTransfer(
  organizationId: string,
  actorId: string,
  id: string,
  idempotencyKey: string,
  input: { items: Array<{ transferItemId: string; quantity: string }> },
  requestId?: string,
) {
  const normalized = input.items
    .map((item) => ({ ...item, quantity: decimal(item.quantity).toString() }))
    .sort((a, b) => a.transferItemId.localeCompare(b.transferItemId));
  if (
    new Set(normalized.map((item) => item.transferItemId)).size !==
    normalized.length
  ) {
    throw new AppError(
      'Duplicate transfer item lines are not supported',
      400,
      'DUPLICATE_LINE',
    );
  }
  const requestHash = hash({ id, action: 'receive', items: normalized });
  const operation = 'transfer.receive';
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, organizationId, id);
    const existing = await assertIdempotency(
      tx,
      organizationId,
      idempotencyKey,
      operation,
      requestHash,
    );
    if (existing) return transfer;
    if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(transfer.status)) {
      throw new AppError(
        'Transfer is not awaiting receipt',
        409,
        'INVALID_STATE',
      );
    }
    const locationId = await getDefaultLocation(
      tx,
      transfer.destinationWarehouseId,
    );
    const lineMap = new Map(transfer.items.map((line) => [line.id, line]));
    const receivingLines = normalized
      .map((item) => {
        const line = lineMap.get(item.transferItemId);
        if (!line)
          throw new AppError('Transfer item not found', 404, 'NOT_FOUND');
        return { item, line, amount: decimal(item.quantity) };
      })
      .sort((a, b) => a.line.productId.localeCompare(b.line.productId));
    for (const { item, line, amount } of receivingLines) {
      const remaining = line.quantity.sub(line.quantityReceived);
      if (amount.gt(remaining)) {
        throw new AppError(
          'Received quantity exceeds the dispatched quantity',
          409,
          'OVER_RECEIPT',
        );
      }
      const key = {
        organizationId,
        productId: line.productId,
        warehouseId: transfer.destinationWarehouseId,
        locationId,
      };
      const balance = await lockBalance(tx, key);
      const after = balance.onHand.add(amount);
      const outgoing = await tx.inventoryMovement.findFirst({
        where: {
          organizationId,
          sourceType: 'TRANSFER',
          sourceId: transfer.id,
          productId: line.productId,
          type: MovementType.TRANSFER_OUT,
        },
        select: { unitCost: true },
      });
      if (!outgoing) {
        throw new AppError(
          'Transfer dispatch ledger entry is missing',
          500,
          'LEDGER_INTEGRITY',
        );
      }
      const averageCost = balance.onHand.gt(0)
        ? balance.onHand
            .mul(balance.averageCost)
            .add(amount.mul(outgoing.unitCost))
            .div(after)
        : outgoing.unitCost;
      await tx.inventoryBalance.update({
        where: { organizationId_productId_warehouseId_locationId: key },
        data: { onHand: after, averageCost },
      });
      await tx.inventoryMovement.create({
        data: {
          ...key,
          type: MovementType.TRANSFER_IN,
          quantityDelta: amount,
          quantityBefore: balance.onHand,
          quantityAfter: after,
          unitCost: outgoing.unitCost,
          sourceType: 'TRANSFER',
          sourceId: transfer.id,
          idempotencyKey: `${hash(idempotencyKey).slice(0, 48)}:${line.id}:in`,
          requestHash: hash({
            transferId: id,
            itemId: line.id,
            quantity: amount.toString(),
          }),
          actorId,
        },
      });
      await tx.stockTransferItem.update({
        where: { id: line.id },
        data: { quantityReceived: { increment: amount } },
      });
    }
    const refreshed = await tx.stockTransfer.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    const complete = refreshed.items.every((line) =>
      line.quantityReceived.gte(line.quantity),
    );
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: {
        status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        ...(complete ? { receivedAt: new Date() } : {}),
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
    await audit(
      tx,
      organizationId,
      actorId,
      'transfer.received',
      id,
      requestId,
    );
    return updated;
  });
}
