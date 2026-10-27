const errorResponses = {
  '400': { $ref: '#/components/responses/BadRequest' },
  '401': { $ref: '#/components/responses/Unauthorized' },
};

export const authPaths = {
  '/auth/register': {
    post: {
      tags: ['Authentication'],
      summary: 'Register an organization and its first owner',
      description: 'Available only when ALLOW_ORG_REGISTRATION=true.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: [
                'organizationName',
                'organizationSlug',
                'fullName',
                'email',
                'password',
              ],
              additionalProperties: false,
              properties: {
                organizationName: {
                  type: 'string',
                  minLength: 2,
                  maxLength: 120,
                },
                organizationSlug: {
                  type: 'string',
                  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
                  maxLength: 60,
                },
                fullName: { type: 'string', minLength: 2, maxLength: 120 },
                email: { type: 'string', format: 'email' },
                password: {
                  type: 'string',
                  minLength: 12,
                  maxLength: 128,
                  writeOnly: true,
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description:
            'Organization owner registered with access and refresh tokens',
        },
        ...errorResponses,
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'Authenticate a user and create a refresh-token session',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password', 'organizationSlug'],
              additionalProperties: false,
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', writeOnly: true },
                organizationSlug: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Authenticated; refresh token is returned for rotation',
        },
        ...errorResponses,
        '423': { description: 'Account is temporarily locked' },
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Authentication'],
      summary: 'Rotate a refresh token and issue a new token pair',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              additionalProperties: false,
              properties: { refreshToken: { type: 'string', writeOnly: true } },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Tokens rotated; previous refresh token is revoked',
        },
        ...errorResponses,
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      summary: 'Revoke the authenticated session',
      responses: {
        '200': { description: 'Session revoked' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/auth/password/change': {
    post: {
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      summary: 'Change the authenticated user password',
      description:
        'Required before a staff account created with a temporary password can use organization features.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword'],
              additionalProperties: false,
              properties: {
                currentPassword: {
                  type: 'string',
                  writeOnly: true,
                  maxLength: 128,
                },
                newPassword: {
                  type: 'string',
                  writeOnly: true,
                  minLength: 12,
                  maxLength: 128,
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Password changed and other sessions revoked' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      summary:
        'Get the authenticated identity, active membership, and permissions',
      responses: {
        '200': { description: 'Current user and organization context' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
};
