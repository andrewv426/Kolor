/**
 * Public entry point for the frozen v1 render engine (PRD §6.2.1).
 *
 * Re-exports the shared contract types so callers import from one place, plus
 * the helper decode paths and float16 packer for any caller that needs them
 * (e.g. the Tier-B preview8 fallback, or conformance tooling).
 */
import type { ToneSettings } from '@/lib/types';

export type { DecodedMaster, V1Renderer } from './types';

export { createV1Renderer } from './renderer';
export { decodeMaster16, decodeMaster16FromPlanes, decodePreview8 } from './decode';
export { getDecodedMaster, type ProgressFn, type Progress } from './masterCache';
export { packFloat16, packArray } from './float16';
export { FRAGMENT_SRC, VERTEX_SRC } from './shader';

// Keep ToneSettings referenced/re-exported so callers import from one place.
export type { ToneSettings };
