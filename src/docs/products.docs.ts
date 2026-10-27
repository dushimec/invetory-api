const auth = [{ bearerAuth: [] }];
const id = [
  {
    in: 'path',
    name: 'id',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];

export const productPaths = {
  '/products': {
    get: {
      tags: ['Products'],
      security: auth,
      summary: 'Search and paginate products in the active organization',
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
          name: 'search',
          schema: { type: 'string', maxLength: 100 },
        },
        {
          in: 'query',
          name: 'categoryId',
          schema: { type: 'string', format: 'uuid' },
        },
        {
          in: 'query',
          name: 'active',
          schema: { type: 'string', enum: ['true', 'false'] },
        },
        {
          in: 'query',
          name: 'sortBy',
          schema: {
            type: 'string',
            enum: ['name', 'sku', 'createdAt', 'sellingPrice'],
          },
        },
        {
          in: 'query',
          name: 'sortOrder',
          schema: { type: 'string', enum: ['asc', 'desc'] },
        },
      ],
      responses: {
        '200': { description: 'Paginated organization products' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
    post: {
      tags: ['Products'],
      security: auth,
      summary: 'Create a product with optional automatic SKU generation',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ProductInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Product created' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/products/barcode/{barcode}': {
    get: {
      tags: ['Products'],
      security: auth,
      summary: 'Find an active-organization product by barcode',
      parameters: [
        {
          in: 'path',
          name: 'barcode',
          required: true,
          schema: { type: 'string', maxLength: 120 },
        },
      ],
      responses: {
        '200': { description: 'Product matching the barcode' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/products/{id}': {
    get: {
      tags: ['Products'],
      security: auth,
      summary: 'Get a product from the active organization',
      parameters: id,
      responses: {
        '200': { description: 'Product details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Products'],
      security: auth,
      summary:
        'Update product information; cost and price changes require separate permissions',
      parameters: id,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ProductUpdate' },
          },
        },
      },
      responses: {
        '200': { description: 'Product updated' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      tags: ['Products'],
      security: auth,
      summary: 'Archive a product without removing its historical records',
      parameters: id,
      responses: {
        '200': { description: 'Product archived' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};
