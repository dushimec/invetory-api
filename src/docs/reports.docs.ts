const auth = [{ bearerAuth: [] }];
const reportFilters = [
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
    name: 'from',
    description: 'Inclusive date/time filter for the report period.',
    schema: { type: 'string', format: 'date-time' },
  },
  {
    in: 'query',
    name: 'to',
    description: 'Inclusive timestamp filter for movements only.',
    schema: { type: 'string', format: 'date-time' },
  },
  {
    in: 'query',
    name: 'warehouseId',
    schema: { type: 'string', format: 'uuid' },
  },
  {
    in: 'query',
    name: 'productId',
    schema: { type: 'string', format: 'uuid' },
  },
];

export const reportPaths = {
  '/dashboard': {
    get: {
      tags: ['Reports'],
      security: auth,
      summary: 'Get the Mwendo Traders inventory and delivery dashboard',
      responses: {
        '200': {
          description:
            'Product/warehouse counts, open orders, low-stock count, available quantity, inventory value, currency, in-transit and overdue deliveries',
        },
      },
    },
  },
  '/reports/inventory-valuation': {
    get: {
      tags: ['Reports'],
      security: auth,
      summary: 'Get the current on-hand inventory valuation snapshot',
      description:
        'Uses current moving-average cost. Historical valuation is not supported; from/to filters are rejected.',
      parameters: reportFilters.filter(
        (item) => !['from', 'to'].includes(item.name),
      ),
      responses: {
        '200': {
          description: 'Paginated balances and total/page valuation summaries',
        },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/reports/inventory-movements': {
    get: {
      tags: ['Reports'],
      security: auth,
      summary: 'Report inventory movements by period, warehouse, and product',
      parameters: reportFilters,
      responses: {
        '200': {
          description:
            'Paginated movements and per-type count/net-quantity aggregation',
        },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/reports/low-stock': {
    get: {
      tags: ['Reports'],
      security: auth,
      summary: 'List balance locations at or below the product reorder level',
      parameters: reportFilters.filter(
        (item) => !['from', 'to'].includes(item.name),
      ),
      responses: {
        '200': {
          description:
            'Paginated low-stock rows using available quantity (onHand minus reserved)',
        },
      },
    },
  },
  '/reports/imports': {
    get: {
      tags: ['Reports', 'Purchasing'],
      security: auth,
      summary:
        'Review import purchase orders, shipment references and landed costs',
      description: 'from/to filter the purchase-order creation date.',
      parameters: [
        ...reportFilters.filter((item) => item.name !== 'productId'),
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: [
              'DRAFT',
              'SUBMITTED',
              'APPROVED',
              'PARTIALLY_RECEIVED',
              'FULLY_RECEIVED',
              'CANCELLED',
              'REJECTED',
              'CLOSED',
            ],
          },
        },
      ],
      responses: {
        '200': {
          description:
            'Paginated import orders with source-currency totals and base-currency summaries grouped by purchase currency',
        },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/reports/deliveries': {
    get: {
      tags: ['Reports', 'Delivery'],
      security: auth,
      summary: 'Track sales deliveries, delivery status and overdue ETAs',
      description: 'from/to filter the estimated delivery time.',
      parameters: [
        ...reportFilters.filter((item) => item.name !== 'productId'),
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['IN_TRANSIT', 'DELIVERED', 'FAILED'],
          },
        },
      ],
      responses: {
        '200': {
          description:
            'Paginated dispatched orders with carrier/tracking details, status counts and overdue count',
        },
      },
    },
  },
  '/reports/customer-outstanding': {
    get: {
      tags: ['Reports', 'Sales'],
      security: auth,
      summary: 'List customer sales orders with outstanding balances',
      description:
        'Outstanding is calculated as the order total minus recorded payments. Cancelled orders are excluded.',
      parameters: reportFilters.filter(
        (item) => !['warehouseId', 'productId'].includes(item.name),
      ),
      responses: {
        '200': {
          description:
            'Paginated customer balances with a total outstanding amount and order count',
        },
      },
    },
  },
};
