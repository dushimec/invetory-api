import 'http';

declare module 'http' {
  interface IncomingMessage {
    requestId: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        organizationId: string;
        sessionId: string;
        permissions: string[];
        mustChangePassword: boolean;
      };
    }
  }
}

export {};
