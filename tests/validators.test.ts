import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  passwordChangeSchema,
  registerSchema,
} from '../src/validators/auth.validator.js';
import {
  adjustmentSchema,
  receiveSchema,
} from '../src/validators/inventory.validator.js';
import {
  createProductSchema,
  productListSchema,
} from '../src/validators/product.validator.js';
import {
  dispatchSchema,
  purchaseOrderCreateSchema,
  receiptCreateSchema,
  salesOrderCreateSchema,
  salesDeliveryUpdateSchema,
} from '../src/validators/purchase.validator.js';
import {
  defaultRoleDuties,
  defaultRolePermissions,
} from '../src/services/auth.service.js';
import {
  transferCreateSchema,
  transferReceiveSchema,
} from '../src/validators/transfer.validator.js';
import { adjustmentCreateSchema } from '../src/validators/adjustment.validator.js';
import { returnCreateSchema } from '../src/validators/returns.validator.js';
import { organizationSettingsUpdateSchema } from '../src/validators/organization.validator.js';
import {
  defaultProductCategories,
  defaultUnits,
} from '../src/config/catalog-defaults.js';
import { landedUnitCostInBaseCurrency } from '../src/utils/landed-cost.js';
import { Prisma } from '@prisma/client';
import { nextProductSku } from '../src/utils/product-sku.js';
import { roleCreateSchema, roleUpdateSchema } from '../src/validators/role.validator.js';
import { userCreateSchema } from '../src/validators/user.validator.js';

describe('request validation', () => {
  it('requires a strong registration password and normalizes organization slugs', () => {
    const valid = registerSchema.parse({
      organizationName: 'Kigali Shop',
      organizationSlug: 'kigali-shop',
      fullName: 'Owner Person',
      email: 'owner@example.rw',
      password: 'long-password-123',
    });
    expect(valid.organizationSlug).toBe('kigali-shop');
    expect(
      registerSchema.safeParse({ ...valid, password: 'short' }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({
        email: 'not-an-email',
        password: 'x',
        organizationSlug: 'x',
      }).success,
    ).toBe(false);
  });

  it('accepts monetary values as decimal strings and rejects client-supplied fields', () => {
    const valid = createProductSchema.safeParse({
      sku: 'RW-001',
      name: 'Rice',
      unitId: '77000000-0000-4000-8000-000000000001',
      purchaseCost: '1500.2500',
      sellingPrice: '1800.0000',
    });
    expect(valid.success).toBe(true);
    expect(
      createProductSchema.parse({
        name: 'Cement',
        unitId: '77000000-0000-4000-8000-000000000001',
      }).sku,
    ).toBeUndefined();
    expect(
      createProductSchema.safeParse({
        sku: 'RW-002',
        name: 'Rice',
        unitId: '77000000-0000-4000-8000-000000000001',
        purchaseCost: 1500.25,
        sellingPrice: '1800',
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        sku: 'RW-002',
        name: 'Rice',
        unitId: '77000000-0000-4000-8000-000000000001',
        purchaseCost: '1',
        sellingPrice: '2',
        organizationId: 'attacker-controlled',
      }).success,
    ).toBe(false);
  });

  it('limits product list pagination and search parameters', () => {
    expect(
      productListSchema.parse({ page: '2', pageSize: '100' }),
    ).toMatchObject({ page: 2, pageSize: 100 });
    expect(
      productListSchema.safeParse({ page: 1, pageSize: 101 }).success,
    ).toBe(false);
  });

  it('generates the next sequential product SKU without being affected by manual SKUs', () => {
    expect(nextProductSku([])).toBe('SKU-000001');
    expect(
      nextProductSku(['SKU-000001', 'CEM-PORTLAND', 'SKU-000009']),
    ).toBe('SKU-000010');
    expect(nextProductSku(['SKU-999999'])).toBe('SKU-1000000');
  });

  it('validates custom sector roles and admin-created staff accounts', () => {
    expect(
      roleCreateSchema.safeParse({
        name: 'Dispatch Coordinator',
        description: 'Handles outbound shipment follow-up.',
        duties: ['Track each dispatched shipment and update its delivery status.'],
        permissions: ['sales.read', 'sales.approve'],
      }).success,
    ).toBe(true);
    expect(
      roleCreateSchema.safeParse({
        name: 'Dispatch Coordinator',
        duties: ['Track dispatched shipments.'],
        permissions: ['sales.read', 'sales.read'],
      }).success,
    ).toBe(false);
    expect(
      roleUpdateSchema.safeParse({}).success,
    ).toBe(false);
    expect(
      userCreateSchema.safeParse({
        fullName: 'Staff User',
        email: 'staff@example.rw',
        temporaryPassword: 'a-temporary-password-1',
        roleId: '77000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(
      userCreateSchema.safeParse({
        fullName: 'Staff User',
        email: 'staff@example.rw',
        temporaryPassword: 'short',
        roleId: '77000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'new-password-long',
      }).success,
    ).toBe(true);
  });

  it('requires positive receipt quantities, but supports signed, reasoned adjustments', () => {
    const base = {
      productId: '77000000-0000-4000-8000-000000000001',
      warehouseId: '77000000-0000-4000-8000-000000000002',
      quantity: '0.125',
    };
    expect(
      receiveSchema.safeParse({ ...base, unitCost: '25.5000' }).success,
    ).toBe(true);
    expect(
      receiveSchema.safeParse({ ...base, quantity: '-1', unitCost: '25' })
        .success,
    ).toBe(false);
    expect(
      adjustmentSchema.safeParse({
        ...base,
        quantity: '-0.125',
        reason: 'Count correction',
      }).success,
    ).toBe(true);
    expect(
      adjustmentSchema.safeParse({ ...base, quantity: '0', reason: '' })
        .success,
    ).toBe(false);
  });

  it('validates purchase, receipt, and sales documents without trusting totals', () => {
    const supplierId = '77000000-0000-4000-8000-000000000001';
    const warehouseId = '77000000-0000-4000-8000-000000000002';
    const productId = '77000000-0000-4000-8000-000000000003';
    const lineId = '77000000-0000-4000-8000-000000000004';
    expect(
      purchaseOrderCreateSchema.safeParse({
        supplierId,
        warehouseId,
        procurementType: 'IMPORT',
        currency: 'USD',
        exchangeRate: '1400.25000000',
        freightCost: '250.0000',
        customsCost: '50.0000',
        originCountry: 'China',
        shipmentReference: 'BL-12345',
        items: [{ productId, quantity: '2.500', unitCost: '1000.0000' }],
      }).success,
    ).toBe(true);
    expect(
      purchaseOrderCreateSchema.parse({
        supplierId,
        warehouseId,
        items: [{ productId, quantity: '1', unitCost: '100' }],
      }).procurementType,
    ).toBe('LOCAL');
    expect(
      purchaseOrderCreateSchema.safeParse({
        supplierId,
        warehouseId,
        currency: 'USD',
        items: [{ productId, quantity: '1', unitCost: '100' }],
      }).success,
    ).toBe(true);
    expect(
      purchaseOrderCreateSchema.safeParse({
        supplierId,
        warehouseId,
        total: '1',
        items: [{ productId, quantity: '2', unitCost: '1000' }],
      }).success,
    ).toBe(false);
    expect(
      receiptCreateSchema.safeParse({
        items: [{ purchaseOrderItemId: lineId, quantity: '1.250' }],
      }).success,
    ).toBe(true);
    expect(
      salesOrderCreateSchema.safeParse({
        warehouseId,
        items: [{ productId, quantity: '1' }],
      }).success,
    ).toBe(true);
    expect(
      dispatchSchema.safeParse({
        items: [{ productId, quantity: '0' }],
      }).success,
    ).toBe(false);
    expect(
      salesDeliveryUpdateSchema.safeParse({
        status: 'DELIVERED',
        proofOfDelivery: 'https://files.example.test/pod/123',
      }).success,
    ).toBe(true);
    expect(
      salesDeliveryUpdateSchema.safeParse({
        status: 'NOT_DISPATCHED',
      }).success,
    ).toBe(false);
  });

  it('validates tenant business settings updates without accepting arbitrary fields', () => {
    expect(
      organizationSettingsUpdateSchema.safeParse({
        businessName: 'Mwendo Traders Ltd',
        address: 'Kigali, Rwanda',
      }).success,
    ).toBe(true);
    expect(
      organizationSettingsUpdateSchema.safeParse({
        organizationId: 'attacker-controlled',
      }).success,
    ).toBe(false);
  });

  it('provides trader-oriented catalog defaults and allocates landed costs by line value', () => {
    expect(defaultProductCategories).toContain('Cement');
    expect(defaultProductCategories).toContain('Heavy Vehicles');
    expect(defaultUnits).toContainEqual({ name: 'Bag', symbol: 'bag' });
    expect(defaultUnits).toContainEqual({ name: 'Vehicle', symbol: 'veh' });
    expect(
      landedUnitCostInBaseCurrency(
        new Prisma.Decimal('100'),
        new Prisma.Decimal('100'),
        new Prisma.Decimal('500'),
        new Prisma.Decimal('50'),
        new Prisma.Decimal('1400.25'),
      ).toFixed(4),
    ).toBe('154027.5000');
  });

  it('keeps sensitive pricing and approval permissions out of frontline roles', () => {
    expect(defaultRolePermissions['Organization Owner']).toContain(
      'products.cost.update',
    );
    expect(defaultRolePermissions.Salesperson).not.toContain(
      'products.cost.update',
    );
    expect(defaultRolePermissions.Salesperson).not.toContain(
      'purchases.approve',
    );
    expect(defaultRolePermissions.Storekeeper).not.toContain('users.manage');
    expect(defaultRolePermissions['Purchasing Officer']).not.toContain(
      'purchases.approve',
    );
    expect(defaultRolePermissions['Purchasing Officer']).not.toContain(
      'purchases.receive',
    );
    expect(defaultRolePermissions['Purchasing Manager']).toContain(
      'purchases.approve',
    );
    expect(defaultRolePermissions.Salesperson).not.toContain('sales.approve');
    expect(defaultRolePermissions['Sales Manager']).toContain('sales.approve');
    expect(defaultRoleDuties.Storekeeper.length).toBeGreaterThan(0);
    expect(defaultRoleDuties['Purchasing Officer'].join(' ')).toContain(
      'purchase orders',
    );
    expect(defaultRoleDuties.Salesperson.join(' ')).toContain('sales orders');
    expect(Object.keys(defaultRolePermissions).sort()).toEqual(
      Object.keys(defaultRoleDuties).sort(),
    );
  });

  it('validates positive quantities for inter-warehouse transfers', () => {
    const sourceWarehouseId = '77000000-0000-4000-8000-000000000001';
    const destinationWarehouseId = '77000000-0000-4000-8000-000000000002';
    const productId = '77000000-0000-4000-8000-000000000003';
    expect(
      transferCreateSchema.safeParse({
        sourceWarehouseId,
        destinationWarehouseId,
        items: [{ productId, quantity: '1.250' }],
      }).success,
    ).toBe(true);
    expect(
      transferCreateSchema.safeParse({
        sourceWarehouseId,
        destinationWarehouseId,
        items: [{ productId, quantity: '0' }],
      }).success,
    ).toBe(false);
    expect(
      transferReceiveSchema.safeParse({
        items: [
          {
            transferItemId: '77000000-0000-4000-8000-000000000004',
            quantity: '1',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('requires signed non-zero adjustment deltas and source-linked returns', () => {
    const warehouseId = '77000000-0000-4000-8000-000000000001';
    const productId = '77000000-0000-4000-8000-000000000002';
    const orderId = '77000000-0000-4000-8000-000000000003';
    expect(
      adjustmentCreateSchema.safeParse({
        warehouseId,
        reason: 'Physical count correction',
        items: [{ productId, delta: '-0.125' }],
      }).success,
    ).toBe(true);
    expect(
      adjustmentCreateSchema.safeParse({
        warehouseId,
        reason: 'Correction',
        items: [{ productId, delta: '0' }],
      }).success,
    ).toBe(false);
    expect(
      returnCreateSchema.safeParse({
        type: 'CUSTOMER',
        warehouseId,
        salesOrderId: orderId,
        reason: 'Damaged on arrival',
        items: [{ productId, quantity: '1.000' }],
      }).success,
    ).toBe(true);
    expect(
      returnCreateSchema.safeParse({
        type: 'CUSTOMER',
        warehouseId,
        purchaseOrderId: orderId,
        reason: 'Wrong reference',
        items: [{ productId, quantity: '1' }],
      }).success,
    ).toBe(false);
  });
});
