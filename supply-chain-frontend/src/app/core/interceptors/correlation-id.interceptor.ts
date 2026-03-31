import { HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs';

const GATEWAY_ROUTE_PREFIXES = [
  '/identity/',
  '/catalog/',
  '/orders/',
  '/logistics/',
  '/payments/',
  '/notifications/'
];

function isGatewayRequest(url: string): boolean {
  if (GATEWAY_ROUTE_PREFIXES.some(prefix => url.startsWith(prefix))) {
    return true;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return GATEWAY_ROUTE_PREFIXES.some(prefix => parsed.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  const correlationId = uuid();
  const headers: Record<string, string> = { 'X-Correlation-Id': correlationId };

  // Ocelot rate limiting in this solution requires a stable client identifier header.
  if (isGatewayRequest(req.url) && !req.headers.has('Oc-Client')) {
    headers['Oc-Client'] = 'supply-chain-frontend';
  }

  const cloned = req.clone({ setHeaders: headers });
  return next(cloned).pipe(
    tap({ error: err => { err['correlationId'] = correlationId; } })
  );
};
