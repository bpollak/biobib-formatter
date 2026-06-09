export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// TritonAI LiteLLM Gateway
export const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://tritonai-api.ucsd.edu';
export const LITELLM_MODEL = process.env.LITELLM_MODEL || 'gpt-5.5';
export const LITELLM_ON_PREM_MODEL = process.env.LITELLM_ON_PREM_MODEL || 'api-gpt-oss-120b';
export const LITELLM_ROUTING_LABEL =
  process.env.LITELLM_ROUTING_LABEL || `${LITELLM_MODEL} with ${LITELLM_ON_PREM_MODEL} fallback routing`;
