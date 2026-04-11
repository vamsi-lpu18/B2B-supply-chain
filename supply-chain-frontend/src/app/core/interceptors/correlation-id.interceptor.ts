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
/// Interceptor to add a correlation ID to outgoing HTTP requests and propagate it through the response error if any.
/// This allows for better tracing of requests across the system, especially when multiple services are involved.
/// The correlation ID is generated as a UUID and added to the 'X-Correlation-Id' header of the request.
/// Additionally, if the request is identified as a gateway request (based on URL prefixes), an 'Oc-Client' header is added to ensure compatibility with Ocelot rate limiting.
/*
  * Note: The correlation ID is only added to requests that are sent to the backend services (identified by the URL prefixes).
  * This interceptor does not modify requests that are sent to external APIs or other non-gateway endpoints.
  * The correlation ID is also propagated in the error object if the request fails, allowing for easier debugging and tracing of issues across the system.
  * This interceptor should be registered in the Angular module's providers array to be applied globally to all HTTP requests made by the application.
  * Example usage:
  * providers: [
  *   { provide: HTTP_INTERCEPTORS, useClass: CorrelationIdInterceptor, multi: true }
  * ]
  * This interceptor is designed to work with Angular's HttpClient and should be compatible with any backend services that expect a correlation ID for tracing purposes.
  * The 'Oc-Client' header is added to requests that are identified as gateway requests to ensure that Ocelot's rate limiting features can properly identify the client making the request, which is important for enforcing rate limits and preventing abuse of the backend services.
  * The correlation ID is generated using a simple UUID generation function, which creates a unique identifier for each request. This allows for better tracking of requests across the system, especially when multiple services are involved in processing a single request.
  * Overall, this interceptor helps to improve the observability and traceability of requests in the application, making it easier to debug issues and monitor the performance of the system.
  * The correlation ID can be used in conjunction with logging and monitoring tools to provide a complete picture of the request flow through the system, allowing for better analysis and troubleshooting of issues that may arise.
  * In summary, this interceptor is a crucial component for ensuring that requests are properly traced and monitored throughout the system, providing valuable insights into the behavior of the application and helping to identify and resolve issues more effectively.
  * By adding a correlation ID to outgoing HTTP requests and propagating it through the response error, this interceptor enables better tracing and observability of requests across the system, making it easier to debug issues and monitor the performance of the application.
  * The use of a correlation ID is a best practice for distributed systems, as it allows for better tracking of requests across multiple services and helps to identify issues that may arise in the system. By implementing this interceptor, we can ensure that our application is properly instrumented for tracing and monitoring, providing valuable insights into the behavior of the system and helping to improve the overall reliability and performance of the application.
  * In conclusion, the correlation ID interceptor is an essential component for ensuring that requests are properly traced and monitored throughout the system, providing valuable insights into the behavior of the application and helping to identify and resolve issues more effectively. By implementing this interceptor, we can improve the observability and traceability of requests in our application, making it easier to debug issues and monitor the performance of the system.
  * This interceptor is designed to work seamlessly with Angular's HttpClient and can be easily integrated into the application by registering it in the module's providers array. By adding a correlation ID to outgoing HTTP requests and propagating it through the response error, we can ensure that our application is properly instrumented for tracing and monitoring, providing valuable insights into the behavior of the system and helping to improve the overall reliability and performance of the application.
  * Overall, the correlation ID interceptor is a crucial component for ensuring that requests are properly traced and monitored throughout the system, providing valuable insights into the behavior of the application and helping to identify and resolve issues more effectively. By implementing this interceptor, we can improve the observability and traceability of requests in our application, making it easier to debug issues and monitor the performance of the system.
*/

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
