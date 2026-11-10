const auth = [{ bearerAuth: [] }];
const id = [
  {
    in: 'path',
    name: 'id',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];
const key = [{ $ref: '#/components/parameters/IdempotencyKey' }];

export const salesPaths = {
  '/sales-orders': {
    get: {
      tags: ['Sales'],
      security: auth,
      summary: 'List sales orders with status and warehouse filters',
      parameters: [
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        {
          in: 'query',
          name: 'pageSize',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: [
              'DRAFT',
              'CONFIRMED',
              'RESERVED',
              'PARTIALLY_FULFILLED',
              'FULFILLED',
              'COMPLETED',
              'CANCELLED',
            ],
          },
        },
        {
          in: 'query',
          name: 'warehouseId',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: { '200': { description: 'Paginated sales orders' } },
    },
    post: {
      tags: ['Sales'],
      security: auth,
      summary:
        'Create a draft order using configured tax and authorized prices/discounts',
      description:
        'The order currency is the organization base currency. Tax and discount calculations are snapshotted. Price overrides and discounts require dedicated permissions.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SalesOrderInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Draft sales order created' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/sales-orders/{id}': {
    get: {
      tags: ['Sales'],
      security: auth,
      summary: 'Get a sales order and its lines',
      parameters: id,
      responses: {
        '200': { description: 'Sales order details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/sales-orders/{id}/confirm': {
    post: {
      tags: ['Sales'],
      security: auth,
      summary: 'Confirm a draft sales order',
      parameters: id,
      responses: {
        '200': { description: 'Sales order confirmed' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/sales-orders/{id}/reserve': {
    post: {
      tags: ['Sales'],
      security: auth,
      summary: 'Reserve available inventory for a confirmed sales order',
      parameters: [...id, ...key],
      responses: {
        '200': { description: 'Sales order reserved' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/sales-orders/{id}/dispatch': {
    post: {
      tags: ['Sales'],
      security: auth,
      summary: 'Dispatch all or part of reserved order quantities',
      parameters: [...id, ...key],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
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
                      quantity: {
                        $ref: '#/components/schemas/DecimalQuantity',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Sales order dispatch recorded' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/sales-orders/{id}/deliveries': {
    get: {
      tags: ['Delivery'],
      security: auth,
      summary: 'List shipment records for a sales order',
      parameters: id,
      responses: {
        '200': { description: 'Chronological shipment history' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/sales-orders/{id}/payments': {
    get: {
      tags: ['Sales'],
      security: auth,
      summary: 'List payment history for a customer sales order',
      parameters: id,
      responses: {
        '200': { description: 'Chronological customer payment history' },
      },
    },
    post: {
      tags: ['Sales'],
      security: auth,
      summary: 'Record a full or partial customer payment',
      description:
        'Payments are stored separately from inventory movements. The required idempotency key prevents duplicate receipt records, and overpayments are rejected.',
      parameters: [...id, ...key],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SalesPaymentInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Payment recorded' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/sales-orders/{id}/deliveries/{deliveryId}': {
    patch: {
      tags: ['Delivery'],
      security: auth,
      summary: 'Update tracking and proof of delivery for one shipment',
      description:
        'Tracks carrier/driver details, destination, ETA, delivery state, and an optional proof-of-delivery URL. A delivery record is created for each dispatch; delivered shipments are terminal.',
      parameters: [
        ...id,
        {
          in: 'path',
          name: 'deliveryId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SalesDeliveryUpdate' },
          },
        },
      },
      responses: {
        '200': { description: 'Shipment status updated and audited' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/sales-orders/{id}/cancel': {
    post: {
      tags: ['Sales'],
      security: auth,
      summary: 'Cancel an open sales order and release remaining reservations',
      parameters: [...id, ...key],
      responses: {
        '200': { description: 'Sales order cancelled' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
};
