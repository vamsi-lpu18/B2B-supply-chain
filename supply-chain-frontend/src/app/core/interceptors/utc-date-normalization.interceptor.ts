import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';

const UTC_FIELD_SUFFIX = 'utc';
const ISO_TIMESTAMP_WITHOUT_OFFSET_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?$/;

export const utcDateNormalizationInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    map(event => {
      if (!(event instanceof HttpResponse) || event.body === null || event.body === undefined) {
        return event;
      }

      const normalizedBody = normalizeValue('', event.body);
      return event.clone({ body: normalizedBody });
    })
  );
};

function normalizeValue(propertyName: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizeValue(propertyName, item));
  }

  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      normalized[key] = normalizeValue(key, nestedValue);
    }

    return normalized;
  }

  if (typeof value === 'string' && isUtcField(propertyName) && isIsoTimestampWithoutOffset(value)) {
    return `${value}Z`;
  }

  return value;
}

function isUtcField(propertyName: string): boolean {
  return propertyName.toLowerCase().endsWith(UTC_FIELD_SUFFIX);
}

function isIsoTimestampWithoutOffset(value: string): boolean {
  return ISO_TIMESTAMP_WITHOUT_OFFSET_REGEX.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}
