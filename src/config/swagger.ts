import swaggerJsdoc from 'swagger-jsdoc';
import { apiPaths } from '../docs/index.js';
import { counterpartySchema } from '../docs/Category.docs.js';

export const openApiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Mwendo Traders Ltd Inventory and Trade Operations API',
      version: '1.0.0',
      description:
        'Inventory and trade operations API for Mwendo Traders Ltd. Supports tenant-scoped catalog, warehouse stock, import procurement and landed costs, sales delivery tracking, and operational reporting. Monetary values are decimal strings in the organization currency; inventory costs are recorded in base currency.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      { name: 'Authentication' },
      { name: 'Organization' },
      { name: 'Category' },
      { name: 'Contacts' },
      { name: 'Products' },
      { name: 'Warehouses' },
      { name: 'Inventory' },
      { name: 'Purchasing' },
      { name: 'Sales' },
      { name: 'Delivery' },
      { name: 'Transfers' },
      { name: 'Returns' },
      { name: 'Adjustments' },
      { name: 'Reports' },
      { name: 'Users' },
      { name: 'Audit' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      parameters: {
        IdempotencyKey: {
          in: 'header',
          name: 'Idempotency-Key',
          required: true,
          description:
            'Unique per organization and operation request. Reusing a key with a different payload returns 409.',
          schema: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      schemas: {
        Success: {
          type: 'object',
          required: ['success', 'message', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: {},
            meta: { nullable: true },
          },
        },
        PageMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
            totalItems: { type: 'integer', minimum: 0 },
            totalPages: { type: 'integer', minimum: 0 },
          },
        },
        Error: {
          type: 'object',
          required: ['success', 'message', 'code', 'requestId'],
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            code: { type: 'string' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
            requestId: { type: 'string' },
          },
        },
        DecimalQuantity: {
          type: 'string',
          pattern: '^\\d{1,16}(\\.\\d{1,3})?$',
          example: '12.500',
          description: 'Positive quantity string in the product base unit.',
        },
        DecimalMoney: {
          type: 'string',
          pattern: '^\\d{1,16}(\\.\\d{1,4})?$',
          example: '1250.0000',
          description:
            'Non-negative money/cost string; no floating-point JSON numbers.',
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: { type: 'object', additionalProperties: true },
            organization: { type: 'object', additionalProperties: true },
          },
        },
        OrganizationSettingsUpdate: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            businessName: { type: 'string', minLength: 1, maxLength: 160 },
            address: { type: 'string', nullable: true, maxLength: 500 },
            logoUrl: { type: 'string', format: 'uri', nullable: true },
            timezone: { type: 'string', maxLength: 100 },
            allowNegativeStock: { type: 'boolean' },
            requirePurchaseApproval: { type: 'boolean' },
            requireSeparationOfDuties: { type: 'boolean' },
          },
        },
        ProductInput: {
          type: 'object',
          required: ['name', 'unitId'],
          additionalProperties: false,
          properties: {
            sku: {
              type: 'string',
              maxLength: 80,
              description:
                'Optional SKU. If omitted, the API generates the next organization-scoped SKU, such as SKU-000001.',
            },
            barcode: { type: 'string', nullable: true },
            name: { type: 'string', maxLength: 200 },
            description: { type: 'string', nullable: true },
            brand: { type: 'string', nullable: true },
            categoryId: { type: 'string', format: 'uuid', nullable: true },
            unitId: { type: 'string', format: 'uuid' },
            purchaseCost: { $ref: '#/components/schemas/DecimalMoney' },
            sellingPrice: { $ref: '#/components/schemas/DecimalMoney' },
            wholesalePrice: { $ref: '#/components/schemas/DecimalMoney' },
            reorderLevel: { type: 'string', example: '5.000' },
            minimumStock: { type: 'string', example: '0.000' },
            maximumStock: { type: 'string', nullable: true },
            trackingMode: {
              type: 'string',
              enum: ['NONE', 'BATCH', 'SERIAL', 'EXPIRY', 'BATCH_EXPIRY'],
              default: 'NONE',
            },
          },
        },
        ProductUpdate: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sku: { type: 'string', maxLength: 80 },
            barcode: { type: 'string', nullable: true },
            name: { type: 'string', maxLength: 200 },
            description: { type: 'string', nullable: true },
            brand: { type: 'string', nullable: true },
            categoryId: { type: 'string', format: 'uuid', nullable: true },
            unitId: { type: 'string', format: 'uuid' },
            purchaseCost: { $ref: '#/components/schemas/DecimalMoney' },
            sellingPrice: { $ref: '#/components/schemas/DecimalMoney' },
            wholesalePrice: { $ref: '#/components/schemas/DecimalMoney' },
            reorderLevel: { type: 'string', example: '5.000' },
            minimumStock: { type: 'string', example: '0.000' },
            maximumStock: { type: 'string', nullable: true },
            trackingMode: {
              type: 'string',
              enum: ['NONE', 'BATCH', 'SERIAL', 'EXPIRY', 'BATCH_EXPIRY'],
            },
          },
        },
        CounterpartyInput: counterpartySchema,
        CounterpartyUpdate: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 40 },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            email: { type: 'string', format: 'email', nullable: true },
            phone: { type: 'string', maxLength: 40, nullable: true },
            address: { type: 'string', maxLength: 500, nullable: true },
            country: { type: 'string', maxLength: 100 },
            taxId: { type: 'string', maxLength: 100, nullable: true },
            notes: { type: 'string', maxLength: 2000, nullable: true },
            contactName: { type: 'string', maxLength: 160, nullable: true },
            paymentTerms: { type: 'string', nullable: true },
          },
        },
        PurchaseOrderInput: {
          type: 'object',
          required: ['supplierId', 'warehouseId', 'items'],
          additionalProperties: false,
          properties: {
            supplierId: { type: 'string', format: 'uuid' },
            warehouseId: { type: 'string', format: 'uuid' },
            procurementType: {
              type: 'string',
              enum: ['LOCAL', 'IMPORT'],
              default: 'LOCAL',
            },
            expectedAt: { type: 'string', format: 'date-time' },
            currency: {
              type: 'string',
              minLength: 3,
              maxLength: 3,
              description:
                'Defaults to the organization base currency. Foreign-currency orders require exchangeRate.',
            },
            exchangeRate: {
              type: 'string',
              pattern: '^\\d{1,12}(\\.\\d{1,8})?$',
              description: 'Base-currency units per purchase-currency unit.',
            },
            freightCost: { $ref: '#/components/schemas/DecimalMoney' },
            customsCost: { $ref: '#/components/schemas/DecimalMoney' },
            insuranceCost: { $ref: '#/components/schemas/DecimalMoney' },
            otherLandedCost: { $ref: '#/components/schemas/DecimalMoney' },
            originCountry: { type: 'string', maxLength: 100 },
            shipmentReference: { type: 'string', maxLength: 100 },
            incoterm: { type: 'string', maxLength: 20 },
            notes: { type: 'string', maxLength: 2000 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 500,
              items: {
                type: 'object',
                required: ['productId', 'quantity', 'unitCost'],
                additionalProperties: false,
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  quantity: { $ref: '#/components/schemas/DecimalQuantity' },
                  unitCost: { $ref: '#/components/schemas/DecimalMoney' },
                },
              },
            },
          },
        },
        SalesOrderInput: {
          type: 'object',
          required: ['warehouseId', 'items'],
          additionalProperties: false,
          properties: {
            customerId: { type: 'string', format: 'uuid' },
            warehouseId: { type: 'string', format: 'uuid' },
            deliveryAddress: { type: 'string', maxLength: 500 },
            estimatedDeliveryAt: { type: 'string', format: 'date-time' },
            notes: { type: 'string', maxLength: 2000 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 500,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                additionalProperties: false,
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  quantity: { $ref: '#/components/schemas/DecimalQuantity' },
                },
              },
            },
          },
        },
        SalesDeliveryUpdate: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: {
            status: {
              type: 'string',
              enum: ['IN_TRANSIT', 'DELIVERED', 'FAILED'],
            },
            deliveryAddress: { type: 'string', nullable: true, maxLength: 500 },
            carrier: { type: 'string', nullable: true, maxLength: 120 },
            driverName: { type: 'string', nullable: true, maxLength: 160 },
            driverPhone: { type: 'string', nullable: true, maxLength: 40 },
            trackingReference: {
              type: 'string',
              nullable: true,
              maxLength: 120,
            },
            estimatedDeliveryAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            proofOfDelivery: {
              type: 'string',
              format: 'uri',
              nullable: true,
              maxLength: 2000,
            },
          },
        },
        TransferInput: {
          type: 'object',
          required: ['sourceWarehouseId', 'destinationWarehouseId', 'items'],
          additionalProperties: false,
          properties: {
            sourceWarehouseId: { type: 'string', format: 'uuid' },
            destinationWarehouseId: { type: 'string', format: 'uuid' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 500,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                additionalProperties: false,
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  quantity: { $ref: '#/components/schemas/DecimalQuantity' },
                },
              },
            },
          },
        },
        ReturnInput: {
          type: 'object',
          required: ['type', 'warehouseId', 'reason', 'items'],
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['CUSTOMER', 'SUPPLIER'] },
            warehouseId: { type: 'string', format: 'uuid' },
            salesOrderId: { type: 'string', format: 'uuid' },
            purchaseOrderId: { type: 'string', format: 'uuid' },
            reason: { type: 'string', minLength: 3, maxLength: 1000 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                additionalProperties: false,
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  locationId: { type: 'string', format: 'uuid' },
                  quantity: { $ref: '#/components/schemas/DecimalQuantity' },
                },
              },
            },
          },
          description:
            'CUSTOMER requires salesOrderId only; SUPPLIER requires purchaseOrderId only.',
        },
      },
      responses: {
        BadRequest: {
          description: 'Validation failure or invalid request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid authentication',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated user lacks the required permission',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        NotFound: {
          description: 'Record not found in the active organization',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Conflict: {
          description:
            'Invalid state, insufficient stock, or idempotency conflict',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
    paths: apiPaths,
  },
  apis: [],
});
