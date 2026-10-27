import 'dotenv/config';
import argon2 from 'argon2';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  defaultProductCategories,
  defaultUnits,
} from '../src/config/catalog-defaults.js';
import {
  defaultRoleDescriptions,
  defaultRoleDuties,
  defaultRolePermissions,
  permissionKeys,
} from '../src/services/auth.service.js';

const prisma = new PrismaClient();
const email = process.env.SEED_OWNER_EMAIL;
const password = process.env.SEED_OWNER_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error(
    'Set SEED_OWNER_EMAIL and a SEED_OWNER_PASSWORD of at least 12 characters before seeding.',
  );
}
const ownerEmail = email.toLowerCase();
const ownerPassword = password;

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: 'mwendo-traders' },
    create: {
      name: 'Mwendo Traders Ltd',
      slug: 'mwendo-traders',
      settings: {
        create: {
          businessName: 'Mwendo Traders Ltd',
          address: '269G+98H, KK 3 Rd, Kigali, Rwanda',
          baseCurrency: 'RWF',
          timezone: 'Africa/Kigali',
        },
      },
    },
    update: {},
  });
  const passwordHash = await argon2.hash(ownerPassword, {
    type: argon2.argon2id,
  });
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      fullName: 'Sample Organization Owner',
      passwordHash,
    },
    update: {
      fullName: 'Sample Organization Owner',
      passwordHash,
      isActive: true,
      mustChangePassword: false,
    },
  });
  const permissions = await Promise.all(
    permissionKeys.map((key) =>
      prisma.permission.upsert({
        where: { key },
        create: { key, description: `Permission to ${key.replace('.', ' ')}` },
        update: {},
      }),
    ),
  );
  const permissionIds = new Map(
    permissions.map((permission) => [permission.key, permission.id]),
  );
  const roles = await Promise.all(
    Object.entries(defaultRolePermissions).map(async ([name, keys]) => {
      const role = await prisma.role.upsert({
        where: {
          organizationId_name: { organizationId: organization.id, name },
        },
        create: {
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
        update: {
          description: defaultRoleDescriptions[name] ?? '',
          duties: defaultRoleDuties[name] ?? [],
        },
      });
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: {
            notIn: keys.map((key) => permissionIds.get(key)!),
          },
        },
      });
      await Promise.all(
        keys.map((key) =>
          prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permissionIds.get(key)!,
              },
            },
            create: { roleId: role.id, permissionId: permissionIds.get(key)! },
            update: {},
          }),
        ),
      );
      return role;
    }),
  );
  const ownerRole = roles.find((role) => role.name === 'Organization Owner');
  if (!ownerRole)
    throw new Error('Organization Owner role definition is missing');
  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: owner.id,
      },
    },
    create: {
      organizationId: organization.id,
      userId: owner.id,
      roleId: ownerRole.id,
    },
    update: { roleId: ownerRole.id, status: 'ACTIVE' },
  });

  const units = await Promise.all(
    defaultUnits.map(({ name, symbol }) =>
      prisma.unitOfMeasure.upsert({
        where: {
          organizationId_symbol: { organizationId: organization.id, symbol },
        },
        create: { organizationId: organization.id, name, symbol },
        update: { name },
      }),
    ),
  );
  const categories = await Promise.all(
    defaultProductCategories.map(async (name) => {
      const existing = await prisma.productCategory.findFirst({
        where: { organizationId: organization.id, parentId: null, name },
      });
      return (
        existing ??
        prisma.productCategory.create({
          data: { organizationId: organization.id, name },
        })
      );
    }),
  );
  const categoryByName = new Map(
    categories.map((category) => [category.name, category]),
  );
  const unitBySymbol = new Map(units.map((unit) => [unit.symbol, unit]));
  const warehouses = await Promise.all(
    [['KGL-MAIN', 'Kigali Main Warehouse']].map(([code, name]) =>
      prisma.warehouse.upsert({
        where: {
          organizationId_code: { organizationId: organization.id, code },
        },
        create: {
          organizationId: organization.id,
          code,
          name,
          locations: { create: { code: 'MAIN', name: 'Main location' } },
        },
        update: { name },
      }),
    ),
  );
  const productSeed = [
    ['CEM-PORTLAND', 'Portland Cement', 'Cement', 'bag', 'BATCH', 25],
    ['CEM-ALUMINOUS', 'Aluminous Cement', 'Cement', 'bag', 'BATCH', 30],
    ['CEM-SLAG', 'Slag Cement', 'Cement', 'bag', 'BATCH', 18],
    [
      'CEM-SUPER-SULPHATE',
      'Super Sulphate Cement',
      'Cement',
      'bag',
      'BATCH',
      12,
    ],
    ['VEH-HOWO-TRACTOR', 'HOWO Tractor', 'Heavy Vehicles', 'veh', 'SERIAL', 1],
    ['TRL-FLATBED', 'Flatbed Trailer', 'Trailers', 'veh', 'SERIAL', 1],
  ] as const;
  const products = await Promise.all(
    productSeed.map(([sku, name, categoryName, unitSymbol, trackingMode]) =>
      prisma.product.upsert({
        where: { organizationId_sku: { organizationId: organization.id, sku } },
        create: {
          organizationId: organization.id,
          categoryId: categoryByName.get(categoryName)!.id,
          unitId: unitBySymbol.get(unitSymbol)!.id,
          sku,
          name,
          trackingMode,
          purchaseCost: '0',
          sellingPrice: '0',
          reorderLevel: '0',
        },
        update: {
          categoryId: categoryByName.get(categoryName)!.id,
          unitId: unitBySymbol.get(unitSymbol)!.id,
          trackingMode,
        },
      }),
    ),
  );
  const supplier = await prisma.supplier.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: 'SUP-001' },
    },
    create: {
      organizationId: organization.id,
      code: 'SUP-001',
      name: 'Kigali Sample Supplier',
      country: 'Rwanda',
    },
    update: {},
  });
  const customer = await prisma.customer.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: 'CUS-001' },
    },
    create: {
      organizationId: organization.id,
      code: 'CUS-001',
      name: 'Sample Customer',
      country: 'Rwanda',
    },
    update: {},
  });

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index]!;
    const warehouse = warehouses[index % warehouses.length]!;
    const location = await prisma.warehouseLocation.findFirstOrThrow({
      where: { warehouseId: warehouse.id, code: 'MAIN' },
    });
    const key = `seed-opening-${product.sku}-${warehouse.code}`;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryMovement.findFirst({
        where: { organizationId: organization.id, idempotencyKey: key },
      });
      if (existing) return;
      const quantity = new Prisma.Decimal(productSeed[index]![5]);
      const cost = product.purchaseCost;
      const balanceKey = {
        organizationId: organization.id,
        productId: product.id,
        warehouseId: warehouse.id,
        locationId: location.id,
      };
      const balance = await tx.inventoryBalance.findUnique({
        where: { organizationId_productId_warehouseId_locationId: balanceKey },
      });
      if (balance) return;
      await tx.inventoryBalance.create({
        data: {
          ...balanceKey,
          onHand: quantity,
          reserved: 0,
          averageCost: cost,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          ...balanceKey,
          type: 'OPENING_BALANCE',
          quantityDelta: quantity,
          quantityBefore: 0,
          quantityAfter: quantity,
          unitCost: cost,
          idempotencyKey: key,
          actorId: owner.id,
          reason: 'Repeatable development seed',
        },
      });
    });
  }

  const poNumber = 'PO-SEED-001';
  await prisma.purchaseOrder.upsert({
    where: {
      organizationId_number: {
        organizationId: organization.id,
        number: poNumber,
      },
    },
    create: {
      organizationId: organization.id,
      supplierId: supplier.id,
      warehouseId: warehouses[0]!.id,
      number: poNumber,
      status: 'DRAFT',
      currency: 'RWF',
      createdById: owner.id,
      items: {
        create: {
          productId: products[0]!.id,
          quantityOrdered: 50,
          unitCost: products[0]!.purchaseCost,
          lineTotal: new Prisma.Decimal(products[0]!.purchaseCost).mul(50),
        },
      },
    },
    update: {},
  });
  await prisma.salesOrder.upsert({
    where: {
      organizationId_number: {
        organizationId: organization.id,
        number: 'SO-SEED-001',
      },
    },
    create: {
      organizationId: organization.id,
      customerId: customer.id,
      warehouseId: warehouses[0]!.id,
      number: 'SO-SEED-001',
      status: 'DRAFT',
      currency: 'RWF',
      createdById: owner.id,
      items: {
        create: {
          productId: products[0]!.id,
          quantity: 2,
          unitPrice: products[0]!.sellingPrice,
          lineTotal: new Prisma.Decimal(products[0]!.sellingPrice).mul(2),
        },
      },
    },
    update: {},
  });
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
