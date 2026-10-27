import { randomUUID } from 'node:crypto';
import {
  MovementType,
  Prisma,
  type Prisma as PrismaTypes,
} from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { landedUnitCostInBaseCurrency } from '../utils/landed-cost.js';

type Transaction = PrismaTypes.TransactionClient;
type PurchaseLineInput = {
  productId: string;
  quantity: string;
  unitCost: string;
};
type ReceiptLineInput = {
  purchaseOrderItemId: string;
  quantity: string;
  locationId?: string;
  unitCost?: string;
  batchNumber?: string;
  expiryDate?: string;
  serialNumbers?: string[];
};

function documentNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function decimal(value: string, field: string, allowZero = false) {
  let result: Prisma.Decimal;
  try {
    result = new Prisma.Decimal(value);
  } catch {
    throw new AppError(
      `${field} must be a valid decimal string`,
      400,
      'VALIDATION_ERROR',
    );
  }
  if (!result.isFinite() || (allowZero ? result.lt(0) : result.lte(0))) {
    throw new AppError(
      `${field} must be ${allowZero ? 'non-negative' : 'greater than zero'}`,
      400,
      'VALIDATION_ERROR',
    );
  }
  return result;
}

function landedCostTotal(order: {
  freightCost: Prisma.Decimal;
  customsCost: Prisma.Decimal;
  insuranceCost: Prisma.Decimal;
  otherLandedCost: Prisma.Decimal;
}) {
  return order.freightCost
    .add(order.customsCost)
    .add(order.insuranceCost)
    .add(order.otherLandedCost);
}

async function audit(
  tx: Transaction,
  args: {
    organizationId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    reason?: string;
    changes?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({ data: args });
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

export async function createPurchaseOrder(
  organizationId: string,
  actorId: string,
  input: {
    supplierId: string;
    warehouseId: string;
    procurementType?: 'LOCAL' | 'IMPORT';
    expectedAt?: string;
    currency?: string;
    exchangeRate?: string;
    freightCost?: string;
    customsCost?: string;
    insuranceCost?: string;
    otherLandedCost?: string;
    originCountry?: string;
    shipmentReference?: string;
    incoterm?: string;
    notes?: string;
    items: PurchaseLineInput[];
  },
  requestId?: string,
) {
  if (!input.items.length)
    throw new AppError(
      'At least one purchase line is required',
      400,
      'VALIDATION_ERROR',
    );
  return prisma.$transaction(async (tx) => {
    const [supplier, warehouse, settings] = await Promise.all([
      tx.supplier.findFirst({
        where: { id: input.supplierId, organizationId, isActive: true },
        select: { id: true },
      }),
      tx.warehouse.findFirst({
        where: { id: input.warehouseId, organizationId, isActive: true },
        select: { id: true },
      }),
      tx.organizationSettings.findUnique({
        where: { organizationId },
        select: { baseCurrency: true },
      }),
    ]);
    if (!settings)
      throw new AppError(
        'Organization settings are missing',
        500,
        'CONFIGURATION_ERROR',
      );
    if (!supplier || !warehouse)
      throw new AppError(
        'Supplier or warehouse is invalid for this organization',
        400,
        'INVALID_REFERENCE',
      );
    const currency = input.currency ?? settings.baseCurrency;
    const exchangeRate = input.exchangeRate
      ? decimal(input.exchangeRate, 'exchangeRate')
      : new Prisma.Decimal(1);
    if (currency !== settings.baseCurrency && !input.exchangeRate) {
      throw new AppError(
        'An exchangeRate in base-currency units per purchase-currency unit is required for foreign-currency orders',
        400,
        'EXCHANGE_RATE_REQUIRED',
      );
    }
    if (currency === settings.baseCurrency && !exchangeRate.eq(1)) {
      throw new AppError(
        'Exchange rate must be 1 when purchase currency matches the organization base currency',
        400,
        'INVALID_EXCHANGE_RATE',
      );
    }
    const freightCost = decimal(input.freightCost ?? '0', 'freightCost', true);
    const customsCost = decimal(input.customsCost ?? '0', 'customsCost', true);
    const insuranceCost = decimal(
      input.insuranceCost ?? '0',
      'insuranceCost',
      true,
    );
    const otherLandedCost = decimal(
      input.otherLandedCost ?? '0',
      'otherLandedCost',
      true,
    );
    const landedCostTotal = freightCost
      .add(customsCost)
      .add(insuranceCost)
      .add(otherLandedCost);
    const procurementType = input.procurementType ?? 'LOCAL';
    if (procurementType === 'LOCAL' && !landedCostTotal.isZero()) {
      throw new AppError(
        'Landed-cost components can only be recorded for imported orders',
        400,
        'LANDED_COST_REQUIRES_IMPORT',
      );
    }
    const products = await tx.product.findMany({
      where: {
        organizationId,
        isActive: true,
        id: { in: input.items.map((item) => item.productId) },
      },
      select: { id: true },
    });
    if (
      products.length !==
      new Set(input.items.map((item) => item.productId)).size
    ) {
      throw new AppError(
        'One or more products are invalid for this organization',
        400,
        'INVALID_REFERENCE',
      );
    }
    const lines = input.items.map((item) => {
      const quantity = decimal(item.quantity, 'quantity');
      const unitCost = decimal(item.unitCost, 'unitCost', true);
      return {
        productId: item.productId,
        quantityOrdered: quantity,
        unitCost,
        lineTotal: quantity.mul(unitCost),
      };
    });
    const subtotal = lines.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Prisma.Decimal(0),
    );
    if (landedCostTotal.gt(0) && subtotal.isZero()) {
      throw new AppError(
        'Landed costs cannot be allocated by purchase value when all item values are zero',
        400,
        'LANDED_COST_ALLOCATION_UNAVAILABLE',
      );
    }
    const order = await tx.purchaseOrder.create({
      data: {
        organizationId,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        number: documentNumber('PO'),
        procurementType,
        currency,
        exchangeRate,
        subtotal,
        total: subtotal.add(landedCostTotal),
        freightCost,
        customsCost,
        insuranceCost,
        otherLandedCost,
        originCountry: input.originCountry,
        shipmentReference: input.shipmentReference,
        incoterm: input.incoterm,
        expectedAt: input.expectedAt ? new Date(input.expectedAt) : undefined,
        createdById: actorId,
        notes: input.notes,
        items: { create: lines },
      },
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { product: true } },
      },
    });
    await audit(tx, {
      organizationId,
      actorId,
      action: 'purchase_order.created',
      entityType: 'purchase_order',
      entityId: order.id,
      requestId,
      changes: {
        number: order.number,
        total: order.total.toString(),
        procurementType: order.procurementType,
        currency: order.currency,
        exchangeRate: order.exchangeRate.toString(),
      },
    });
    return order;
  });
}

export async function listPurchaseOrders(
  organizationId: string,
  options: {
    page: number;
    pageSize: number;
    status?: string;
    supplierId?: string;
  },
) {
  const where = {
    organizationId,
    ...(options.status
      ? { status: options.status as PrismaTypes.EnumPurchaseStatusFilter }
      : {}),
    ...(options.supplierId ? { supplierId: options.supplierId } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({
      where,
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchaseOrder.count({ where }),
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

export async function getPurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, organizationId },
    include: {
      supplier: true,
      warehouse: true,
      items: {
        include: {
          product: true,
          receiptItems: { include: { goodsReceipt: true } },
        },
      },
      receipts: { include: { items: true } },
    },
  });
  if (!order) throw new AppError('Purchase order not found', 404, 'NOT_FOUND');
  return order;
}

export async function transitionPurchaseOrder(
  organizationId: string,
  actorId: string,
  id: string,
  action: 'submit' | 'approve' | 'reject' | 'cancel',
  requireApproval: boolean,
  requireSeparationOfDuties: boolean,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "PurchaseOrder"
      WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid
      FOR UPDATE
    `);
    if (!locked.length)
      throw new AppError('Purchase order not found', 404, 'NOT_FOUND');
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    if (!order.items.length)
      throw new AppError(
        'Purchase order must contain at least one item',
        400,
        'EMPTY_DOCUMENT',
      );
    if (action === 'submit') {
      if (order.status !== 'DRAFT')
        throw new AppError(
          'Only draft purchase orders can be submitted',
          409,
          'INVALID_STATE',
        );
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: requireApproval ? 'SUBMITTED' : 'APPROVED',
          submittedAt: new Date(),
          ...(!requireApproval
            ? { approvedAt: new Date(), approvedById: actorId }
            : {}),
        },
      });
      await audit(tx, {
        organizationId,
        actorId,
        action: 'purchase_order.submitted',
        entityType: 'purchase_order',
        entityId: id,
        requestId,
      });
      return updated;
    }
    if (action === 'approve' || action === 'reject') {
      if (order.status !== 'SUBMITTED')
        throw new AppError(
          'Only submitted purchase orders can be approved or rejected',
          409,
          'INVALID_STATE',
        );
      if (requireSeparationOfDuties && order.createdById === actorId)
        throw new AppError(
          'The order creator cannot approve or reject this purchase order',
          403,
          'SEPARATION_OF_DUTIES',
        );
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data:
          action === 'approve'
            ? {
                status: 'APPROVED',
                approvedAt: new Date(),
                approvedById: actorId,
              }
            : { status: 'REJECTED' },
      });
      await audit(tx, {
        organizationId,
        actorId,
        action: `purchase_order.${action === 'approve' ? 'approved' : 'rejected'}`,
        entityType: 'purchase_order',
        entityId: id,
        requestId,
      });
      return updated;
    }
    if (!['DRAFT', 'SUBMITTED', 'APPROVED'].includes(order.status)) {
      throw new AppError(
        'Purchase order cannot be cancelled after receipt has started',
        409,
        'INVALID_STATE',
      );
    }
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await audit(tx, {
      organizationId,
      actorId,
      action: 'purchase_order.cancelled',
      entityType: 'purchase_order',
      entityId: id,
      requestId,
    });
    return updated;
  });
}

export async function createGoodsReceipt(
  organizationId: string,
  actorId: string,
  purchaseOrderId: string,
  input: {
    invoiceNumber?: string;
    deliveryNote?: string;
    items: ReceiptLineInput[];
  },
  requestId?: string,
) {
  if (!input.items.length)
    throw new AppError(
      'At least one receipt line is required',
      400,
      'VALIDATION_ERROR',
    );
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, organizationId },
      include: { items: true },
    });
    if (!order || !['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new AppError(
        'Purchase order is not available for receiving',
        409,
        'INVALID_STATE',
      );
    }
    const orderLines = new Map(order.items.map((item) => [item.id, item]));
    const totalLandedCost = landedCostTotal(order);
    const lines = input.items.map((item) => {
      const orderItem = orderLines.get(item.purchaseOrderItemId);
      if (!orderItem)
        throw new AppError(
          'Receipt item does not belong to this purchase order',
          400,
          'INVALID_REFERENCE',
        );
      const quantity = decimal(item.quantity, 'quantity');
      const remaining = orderItem.quantityOrdered.sub(
        orderItem.quantityReceived,
      );
      if (quantity.gt(remaining))
        throw new AppError(
          `Receipt exceeds remaining quantity for item ${orderItem.id}`,
          409,
          'OVER_RECEIPT',
        );
      const sourceUnitCost =
        item.unitCost === undefined
          ? orderItem.unitCost
          : decimal(item.unitCost, 'unitCost', true);
      return {
        purchaseOrderItemId: orderItem.id,
        productId: orderItem.productId,
        locationId: item.locationId,
        quantity,
        unitCost: landedUnitCostInBaseCurrency(
          sourceUnitCost,
          orderItem.unitCost,
          order.subtotal,
          totalLandedCost,
          order.exchangeRate,
        ),
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        serialNumbers: (item.serialNumbers ?? []).map((value) => value.trim()),
      };
    });
    const products = await tx.product.findMany({
      where: {
        organizationId,
        id: { in: [...new Set(lines.map((line) => line.productId))] },
      },
      select: { id: true, trackingMode: true },
    });
    const modes = new Map(
      products.map(({ id, trackingMode }) => [id, trackingMode]),
    );
    for (const line of lines) {
      const mode = modes.get(line.productId);
      if (mode === 'SERIAL') {
        if (!line.quantity.isInteger()) {
          throw new AppError(
            'Serial-tracked quantities must be whole numbers',
            400,
            'SERIAL_QUANTITY_INVALID',
          );
        }
        if (line.serialNumbers.length !== line.quantity.toNumber()) {
          throw new AppError(
            'Provide exactly one serial number for each received unit',
            400,
            'SERIAL_NUMBERS_REQUIRED',
          );
        }
        if (new Set(line.serialNumbers).size !== line.serialNumbers.length) {
          throw new AppError(
            'Serial numbers must be unique within the receipt',
            400,
            'DUPLICATE_SERIAL_NUMBER',
          );
        }
      } else if (line.serialNumbers.length) {
        throw new AppError(
          'Serial numbers can only be provided for serial-tracked products',
          400,
          'TRACKING_NOT_ENABLED',
        );
      }
      if ((mode === 'BATCH' || mode === 'BATCH_EXPIRY') && !line.batchNumber) {
        throw new AppError(
          'Batch number is required for this tracked product',
          400,
          'BATCH_REQUIRED',
        );
      }
      if ((mode === 'EXPIRY' || mode === 'BATCH_EXPIRY') && !line.expiryDate) {
        throw new AppError(
          'Expiry date is required for this tracked product',
          400,
          'EXPIRY_REQUIRED',
        );
      }
      if (line.expiryDate && line.expiryDate <= new Date())
        throw new AppError(
          'Cannot receive already expired stock',
          400,
          'EXPIRED_STOCK',
        );
      if (line.expiryDate && mode !== 'EXPIRY' && mode !== 'BATCH_EXPIRY') {
        throw new AppError(
          'Expiry date is not enabled for this product',
          400,
          'TRACKING_NOT_ENABLED',
        );
      }
      if (line.batchNumber && mode !== 'BATCH' && mode !== 'BATCH_EXPIRY') {
        throw new AppError(
          'Batch tracking is not enabled for this product',
          400,
          'TRACKING_NOT_ENABLED',
        );
      }
    }
    const receipt = await tx.goodsReceipt.create({
      data: {
        organizationId,
        purchaseOrderId: order.id,
        supplierId: order.supplierId,
        warehouseId: order.warehouseId,
        number: documentNumber('GR'),
        invoiceNumber: input.invoiceNumber,
        deliveryNote: input.deliveryNote,
        items: { create: lines },
      },
      include: { items: true },
    });
    await audit(tx, {
      organizationId,
      actorId,
      action: 'goods_receipt.created',
      entityType: 'goods_receipt',
      entityId: receipt.id,
      requestId,
    });
    return receipt;
  });
}

export async function postGoodsReceipt(
  organizationId: string,
  actorId: string,
  receiptId: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "GoodsReceipt"
      WHERE "id" = ${receiptId}::uuid AND "organizationId" = ${organizationId}::uuid
      FOR UPDATE
    `);
    if (!locked.length)
      throw new AppError('Goods receipt not found', 404, 'NOT_FOUND');
    const receipt = await tx.goodsReceipt.findUniqueOrThrow({
      where: { id: receiptId },
      include: { items: true, purchaseOrder: true },
    });
    if (receipt.status === 'POSTED') return receipt;
    if (receipt.status !== 'DRAFT')
      throw new AppError(
        'Only draft receipts can be posted',
        409,
        'INVALID_STATE',
      );
    if (!receipt.items.length)
      throw new AppError('Receipt has no items', 400, 'EMPTY_DOCUMENT');
    let purchaseOrder = null;
    if (receipt.purchaseOrderId) {
      const purchaseOrderLock = await tx.$queryRaw<
        Array<{ id: string }>
      >(Prisma.sql`
        SELECT "id" FROM "PurchaseOrder"
        WHERE "id" = ${receipt.purchaseOrderId}::uuid
          AND "organizationId" = ${organizationId}::uuid
        FOR UPDATE
      `);
      if (!purchaseOrderLock.length)
        throw new AppError('Purchase order not found', 404, 'NOT_FOUND');
      purchaseOrder = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: receipt.purchaseOrderId },
        include: { items: true },
      });
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(purchaseOrder.status)) {
        throw new AppError(
          'Purchase order is not available for receiving',
          409,
          'INVALID_STATE',
        );
      }
    }
    const updates = new Map<string, Prisma.Decimal>();
    for (const item of receipt.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId, isActive: true },
      });
      if (!product)
        throw new AppError(
          'Receipt product is not available in this organization',
          400,
          'INVALID_REFERENCE',
        );
      const location = item.locationId
        ? await tx.warehouseLocation.findFirst({
            where: {
              id: item.locationId,
              warehouseId: receipt.warehouseId,
              isActive: true,
            },
          })
        : await tx.warehouseLocation.findFirst({
            where: {
              warehouseId: receipt.warehouseId,
              code: 'MAIN',
              isActive: true,
            },
          });
      if (!location)
        throw new AppError(
          'Receipt location is invalid',
          400,
          'INVALID_LOCATION',
        );
      if (item.expiryDate && item.expiryDate <= new Date())
        throw new AppError('Cannot post expired stock', 400, 'EXPIRED_STOCK');
      if (product.trackingMode === 'SERIAL') {
        if (
          !item.quantity.isInteger() ||
          item.serialNumbers.length !== item.quantity.toNumber() ||
          !item.purchaseOrderItemId
        ) {
          throw new AppError(
            'Serial-tracked receipts require one serial number per whole unit and a purchase order line',
            400,
            'SERIAL_NUMBERS_REQUIRED',
          );
        }
        const duplicate = await tx.stockSerial.findFirst({
          where: {
            organizationId,
            productId: item.productId,
            serialNumber: { in: item.serialNumbers },
          },
          select: { serialNumber: true },
        });
        if (duplicate) {
          throw new AppError(
            `Serial number ${duplicate.serialNumber} has already been received`,
            409,
            'DUPLICATE_SERIAL_NUMBER',
          );
        }
        await tx.stockSerial.createMany({
          data: item.serialNumbers.map((serialNumber) => ({
            organizationId,
            productId: item.productId,
            serialNumber,
            warehouseId: receipt.warehouseId,
            locationId: location.id,
            sourcePurchaseOrderItemId: item.purchaseOrderItemId!,
          })),
        });
      } else if (item.serialNumbers.length) {
        throw new AppError(
          'Serial numbers can only be received for serial-tracked products',
          400,
          'TRACKING_NOT_ENABLED',
        );
      }
      if (item.purchaseOrderItemId && purchaseOrder) {
        const poItem = purchaseOrder.items.find(
          ({ id }) => id === item.purchaseOrderItemId,
        );
        if (!poItem || poItem.productId !== item.productId)
          throw new AppError(
            'Receipt line is not part of the purchase order',
            400,
            'INVALID_REFERENCE',
          );
        const alreadyInDraftReceipts = await tx.goodsReceiptItem.aggregate({
          where: {
            purchaseOrderItemId: item.purchaseOrderItemId,
            goodsReceipt: {
              organizationId,
              status: 'DRAFT',
              id: { not: receipt.id },
            },
          },
          _sum: { quantity: true },
        });
        const remaining = poItem.quantityOrdered
          .sub(poItem.quantityReceived)
          .sub(alreadyInDraftReceipts._sum.quantity ?? new Prisma.Decimal(0));
        if (item.quantity.gt(remaining))
          throw new AppError(
            'Receipt exceeds remaining purchase quantity',
            409,
            'OVER_RECEIPT',
          );
      }
      const key = {
        organizationId,
        productId: item.productId,
        warehouseId: receipt.warehouseId,
        locationId: location.id,
      };
      const balance = await lockBalance(tx, key);
      const after = balance.onHand.add(item.quantity);
      const averageCost = balance.onHand.gt(0)
        ? balance.onHand
            .mul(balance.averageCost)
            .add(item.quantity.mul(item.unitCost))
            .div(after)
        : item.unitCost;
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: after, averageCost },
      });
      await tx.inventoryMovement.create({
        data: {
          ...key,
          type: MovementType.PURCHASE_RECEIPT,
          quantityDelta: item.quantity,
          quantityBefore: balance.onHand,
          quantityAfter: after,
          unitCost: item.unitCost,
          sourceType: 'goods_receipt',
          sourceId: receipt.id,
          idempotencyKey: `receipt-${receipt.id}-${item.id}`,
          requestHash: `${item.productId}:${item.quantity}:${item.unitCost}`,
          actorId,
          reason: `Receipt ${receipt.number}`,
        },
      });
      if (item.batchNumber) {
        await tx.stockBatch.upsert({
          where: {
            organizationId_productId_batchNumber: {
              organizationId,
              productId: item.productId,
              batchNumber: item.batchNumber,
            },
          },
          create: {
            organizationId,
            productId: item.productId,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            status: 'AVAILABLE',
          },
          update: { expiryDate: item.expiryDate ?? undefined },
        });
      }
      if (item.purchaseOrderItemId) {
        updates.set(
          item.purchaseOrderItemId,
          (updates.get(item.purchaseOrderItemId) ?? new Prisma.Decimal(0)).add(
            item.quantity,
          ),
        );
      }
    }
    const updatedReceipt = await tx.goodsReceipt.update({
      where: { id: receipt.id },
      data: { status: 'POSTED', postedAt: new Date(), postedById: actorId },
    });
    if (purchaseOrder) {
      let nextStatus: 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' =
        'FULLY_RECEIVED';
      for (const line of purchaseOrder.items) {
        const add = updates.get(line.id) ?? new Prisma.Decimal(0);
        if (line.quantityReceived.add(add).lt(line.quantityOrdered))
          nextStatus = 'PARTIALLY_RECEIVED';
        if (add.gt(0)) {
          await tx.purchaseOrderItem.update({
            where: { id: line.id },
            data: { quantityReceived: { increment: add } },
          });
        }
      }
      await tx.purchaseOrder.update({
        where: { id: purchaseOrder.id },
        data: { status: nextStatus },
      });
    }
    await audit(tx, {
      organizationId,
      actorId,
      action: 'goods_receipt.posted',
      entityType: 'goods_receipt',
      entityId: receipt.id,
      requestId,
      changes: { number: receipt.number },
    });
    return updatedReceipt;
  });
}

export async function listGoodsReceipts(
  organizationId: string,
  page: number,
  pageSize: number,
) {
  const where = { organizationId };
  const [data, totalItems] = await prisma.$transaction([
    prisma.goodsReceipt.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        supplier: true,
        warehouse: true,
        purchaseOrder: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.goodsReceipt.count({ where }),
  ]);
  return {
    data,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}
