import { BadRequestException, Injectable } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates a request body/query/param against a zod schema and returns the
 * parsed (trimmed, coerced, defaulted) value. On failure it throws a 400
 * with the docs/API.md error envelope: `message` is an array with one
 * "path: message" string per zod issue.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const message = result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    );
    throw new BadRequestException({
      statusCode: 400,
      message,
      error: 'Bad Request',
    });
  }
}
