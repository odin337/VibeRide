import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

const BODY_METADATA: ArgumentMetadata = { type: 'body' };

function envelopeOf(run: () => unknown): Record<string, unknown> {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as Record<string, unknown>;
  }
  throw new Error('expected the pipe to throw');
}

describe('ZodValidationPipe', () => {
  it('returns the parsed value with coercions, trims and defaults applied', () => {
    const schema = z.object({
      name: z.string().trim(),
      limit: z.coerce.number().int().default(20),
    });
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ name: '  Rider  ' }, BODY_METADATA)).toEqual({
      name: 'Rider',
      limit: 20,
    });
  });

  it('throws a BadRequestException carrying the docs/API.md envelope', () => {
    const pipe = new ZodValidationPipe(z.object({ name: z.string() }));
    const envelope = envelopeOf(() => pipe.transform({}, BODY_METADATA));
    expect(envelope.statusCode).toBe(400);
    expect(envelope.error).toBe('Bad Request');
  });

  it('formats one "path: message" entry per zod issue', () => {
    const schema = z.object({ name: z.string(), nested: z.object({ count: z.number() }) });
    const pipe = new ZodValidationPipe(schema);
    const envelope = envelopeOf(() => pipe.transform({ nested: { count: 'x' } }, BODY_METADATA));
    expect(envelope.message).toEqual([
      'name: Required',
      'nested.count: Expected number, received string',
    ]);
  });

  it('emits the bare message for root-level issues (empty path)', () => {
    const pipe = new ZodValidationPipe(z.string());
    const envelope = envelopeOf(() => pipe.transform(42, BODY_METADATA));
    expect(envelope.message).toEqual(['Expected string, received number']);
  });
});
