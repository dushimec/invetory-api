const auth = [{ bearerAuth: [] }];
const id = [
  {
    in: 'path',
    name: 'id',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];
const idempotency = [{ $ref: '#/components/parameters/IdempotencyKey' }];

export const transferPaths = {
  '/inventory/transfers': {
    get: {
      tags: ['Transfers'],
      security: auth,
      summary: 'List transfers for the active organization',
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
              'SUBMITTED',
              'APPROVED',
              'IN_TRANSIT',
              'PARTIALLY_RECEIVED',
              'RECEIVED',
              'CANCELLED',
            ],
          },
        },
      ],
      responses: { '200': { description: 'Paginated transfers' } },
    },
    post: {
      tags: ['Transfers'],
      security: auth,
      summary: 'Create a draft inter-warehouse transfer',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TransferInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Draft transfer created' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/inventory/transfers/{id}': {
    get: {
      tags: ['Transfers'],
      security: auth,
      summary: 'Get transfer details and received quantities',
      parameters: id,
      responses: {
        '200': { description: 'Transfer details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/inventory/transfers/{id}/submit': {
    post: {
      tags: ['Transfers'],
      security: auth,
      summary: 'Submit a draft transfer for approval',
      parameters: id,
      responses: {
        '200': { description: 'Transfer submitted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/transfers/{id}/approve': {
    post: {
      tags: ['Transfers'],
      security: auth,
      summary:
        'Approve a submitted transfer; creator cannot approve their own transfer',
      parameters: id,
      responses: {
        '200': { description: 'Transfer approved' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/transfers/{id}/dispatch': {
    post: {
      tags: ['Transfers'],
      security: auth,
      summary: 'Deduct source stock and place approved transfer in transit',
      parameters: [...id, ...idempotency],
      responses: {
        '200': { description: 'Transfer dispatched atomically' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/transfers/{id}/receive': {
    post: {
      tags: ['Transfers'],
      security: auth,
      summary:
        'Receive quantities into the destination warehouse; partial receipts are supported',
      parameters: [...id, ...idempotency],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              additionalProperties: false,
              properties: {
                items: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 500,
                  items: {
                    type: 'object',
                    required: ['transferItemId', 'quantity'],
                    additionalProperties: false,
                    properties: {
                      transferItemId: { type: 'string', format: 'uuid' },
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
        '200': { description: 'Transfer receipt posted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/transfers/{id}/cancel': {
    post: {
      tags: ['Transfers'],
      security: auth,
      summary: 'Cancel a transfer that has not been dispatched',
      parameters: id,
      responses: {
        '200': { description: 'Transfer cancelled' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
};
