interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: JsonSchema;
  enum?: string[];
  const?: unknown;
  minItems?: number;
}

/** Constrain GLM's JSON shape and source vocabulary at decoding time. */
export function buildResponseSchema(example: unknown, sourceIds: string[], path = ''): JsonSchema {
  if (path.endsWith('.sourceIds')) return {
    type: 'array', items: { type: 'string', enum: sourceIds },
    minItems: path === 'metadata.sourceIds' || path === 'sections.specialization.sourceIds' ? 0 : 1,
  };
  if (path === 'excluded[].id') return { type: 'string', enum: sourceIds };
  if (Array.isArray(example)) return { type: 'array', items: buildResponseSchema(example[0] ?? '', sourceIds, `${path}[]`) };
  if (example && typeof example === 'object') {
    const properties = Object.fromEntries(Object.entries(example).map(([key, value]) =>
      [key, buildResponseSchema(value, sourceIds, path ? `${path}.${key}` : key)]));
    const required = Object.keys(properties);
    if ('citation' in example) {
      for (const key of ['articleKind', 'contributionNote', 'previouslyListedAs', 'reviewMaterialUrl', 'bioBibSection', 'originalNumber']) {
        properties[key] = { type: 'string' };
      }
      for (const key of ['isNewSinceLastReview', 'isFacultyThesis']) properties[key] = { type: 'boolean' };
    }
    if (!path) properties.reviewNotes = buildResponseSchema([{ section: '', topic: '', instruction: '' }], sourceIds, 'reviewNotes');
    return { type: 'object', properties, required, additionalProperties: false };
  }
  if (typeof example === 'boolean') return { type: 'boolean' };
  if (typeof example === 'number') return { type: 'integer' };
  if (path.endsWith('.citation')) return { type: 'string', const: '' };
  if (typeof example === 'string' && example.includes('|')) return { type: 'string', enum: example.split('|') };
  return { type: 'string' };
}
