const auth = [{ bearerAuth: [] }];
const id = [
  {
    in: 'path',
    name: 'id',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];

export const returnPaths = {
  '/returns': {
    get: {
      tags: ['Returns'],
      security: auth,
      summary: 'List customer and supplier returns',
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
          name: 'type',
          schema: { type: 'string', enum: ['CUSTOMER', 'SUPPLIER'] },
        },
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: [
              'DRAFT',
              'SUBMITTED',
              'APPROVED',
              'POSTED',
              'CANCELLED',
              'REVERSED',
            ],
          },
        },
      ],
      responses: { '200': { description: 'Paginated returns' } },
    },
    post: {
      tags: ['Returns'],
      security: auth,
      summary:
        'Create a draft return linked to a fulfilled sale or received purchase',
      description:
        'Customer return requires salesOrderId only. Supplier return requires purchaseOrderId only.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ReturnInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Draft return created' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/returns/{id}': {
    get: {
      tags: ['Returns'],
      security: auth,
      summary: 'Get return details',
      parameters: id,
      responses: {
        '200': { description: 'Return and line details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/returns/{id}/submit': {
    post: {
      tags: ['Returns'],
      security: auth,
      summary: 'Submit a draft return for approval',
      parameters: id,
      responses: {
        '200': { description: 'Return submitted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/returns/{id}/approve': {
    post: {
      tags: ['Returns'],
      security: auth,
      summary:
        'Approve a submitted return; separation-of-duties policy applies',
      parameters: id,
      responses: {
        '200': { description: 'Return approved' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/returns/{id}/post': {
    post: {
      tags: ['Returns'],
      security: auth,
      summary: 'Post an approved return to inventory ledger and stock balances',
      parameters: id,
      responses: {
        '200': { description: 'Return posted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/returns/{id}/cancel': {
    post: {
      tags: ['Returns'],
      security: auth,
      summary: 'Cancel a return before it is posted',
      parameters: id,
      responses: {
        '200': { description: 'Return cancelled' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
};
