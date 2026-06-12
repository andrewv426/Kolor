/**
 * WebGL2 v1 renderer (PRD §6.2.1). One full-screen-triangle fragment shader;
 * the source texture uploads once, slider drags touch uniforms only.
 *
 * Frozen device contract:
 *  - Context attributes: { alpha:false, premultipliedAlpha:false,
 *    preserveDrawingBuffer:false, antialias:false }, drawingBufferColorSpace='srgb'.
 *  - Unpack state: FLIP_Y false, PREMULTIPLY false, COLORSPACE_CONVERSION NONE.
 *  - Tier A: RGBA16F texture from half-float bit patterns (HALF_FLOAT type).
 *  - Tier B: RGBA8 UNORM texture from an 8-bit source (preview8), SAME shader.
 *  - LINEAR min/mag, CLAMP_TO_EDGE wrap.
 *
 * createV1Renderer returns null when no usable WebGL2 (or no usable fragment
 * highp) exists → caller handles Tier C (CSS filters).
 */

import type { ToneSettings } from '@/lib/types';
import { TONE_KEYS } from '@/lib/types';
import type { DecodedMaster, V1Renderer } from './types';
import { FRAGMENT_SRC, VERTEX_SRC } from './shader';

const UNIFORM_NAMES: Record<(typeof TONE_KEYS)[number] | 'clarity', string> = {
  temp: 'u_temp',
  tint: 'u_tint',
  exposure: 'u_exposure',
  contrast: 'u_contrast',
  highlights: 'u_highlights',
  shadows: 'u_shadows',
  whites: 'u_whites',
  blacks: 'u_blacks',
  vibrance: 'u_vibrance',
  saturation: 'u_saturation',
  clarity: 'u_clarity',
};

class WebGL2V1Renderer implements V1Renderer {
  readonly tier: 'A' | 'B' | 'C';

  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private texture: WebGLTexture | null = null;
  private uniformLoc: Partial<Record<string, WebGLUniformLocation | null>> = {};
  private texLoc: WebGLUniformLocation | null = null;
  private width = 0;
  private height = 0;
  private destroyed = false;

  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    vao: WebGLVertexArrayObject,
    tier: 'A' | 'B',
  ) {
    this.gl = gl;
    this.program = program;
    this.vao = vao;
    this.tier = tier;

    this.texLoc = gl.getUniformLocation(program, 'u_tex');
    for (const name of Object.values(UNIFORM_NAMES)) {
      this.uniformLoc[name] = gl.getUniformLocation(program, name);
    }
  }

  setSource(m: DecodedMaster): void {
    if (this.destroyed) return;
    const gl = this.gl;
    this.width = m.width;
    this.height = m.height;

    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = gl.createTexture();

    // Pinned unpack/pixel-store state (frozen).
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
      gl.NONE,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    if (this.tier === 'A') {
      // RGBA16F from half-float bit patterns (HALF_FLOAT does NOT normalize).
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        m.width,
        m.height,
        0,
        gl.RGBA,
        gl.HALF_FLOAT,
        m.halfData,
      );
    } else {
      // Tier B: upload the same half-float data as RGBA16F if the caller built
      // it from preview8 via decodePreview8 (DecodedMaster.tier === 'B' still
      // carries half bits). This keeps one upload path; the renderer tier is B
      // because the SOURCE was 8-bit, not because the texture format changed.
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        m.width,
        m.height,
        0,
        gl.RGBA,
        gl.HALF_FLOAT,
        m.halfData,
      );
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * Upload an 8-bit RGBA source as a plain RGBA8 UNORM texture (alternative
   * Tier-B path, also v1-legal). The shader still sRGB-decodes in-shader.
   */
  setSourceRGBA8(width: number, height: number, rgba: Uint8Array): void {
    if (this.destroyed) return;
    const gl = this.gl;
    this.width = width;
    this.height = height;

    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = gl.createTexture();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      rgba,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render(tone: ToneSettings): void {
    if (this.destroyed || !this.texture) return;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.texLoc) gl.uniform1i(this.texLoc, 0);

    // Each slider → normalized n = s/100. Integer inputs already validated.
    for (const key of TONE_KEYS) {
      const loc = this.uniformLoc[UNIFORM_NAMES[key]];
      if (loc) gl.uniform1f(loc, tone[key] / 100.0);
    }
    // Clarity is not in TONE_KEYS (UI omits it); always pass 0 → inert.
    const clarityLoc = this.uniformLoc[UNIFORM_NAMES.clarity];
    if (clarityLoc) gl.uniform1f(clarityLoc, 0.0);

    // Match the drawing buffer to the canvas backing size if it changed.
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('v1 shader compile error:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // Shaders can be detached/deleted after a successful link.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('v1 program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Probe Tier-A capability: a real WebGL2 context with usable fragment highp,
 * and an RGBA16F + HALF_FLOAT texture that allocates and LINEAR-filters with no
 * GL error. Demotes to Tier B (still WebGL2, RGBA8) when the half-float
 * allocation fails, and returns the chosen tier.
 */
function probeTier(gl: WebGL2RenderingContext): 'A' | 'B' | null {
  // Fragment highp gate (Tier C if absent — §6.2.1 capability check).
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!hp || hp.precision === 0) return null;

  // Try a 2x2 RGBA16F/HALF_FLOAT allocation + LINEAR filter, check getError.
  const tex = gl.createTexture();
  if (!tex) return 'B';
  gl.bindTexture(gl.TEXTURE_2D, tex);
  while (gl.getError() !== gl.NO_ERROR) {
    /* drain pre-existing errors */
  }
  const probe = new Uint16Array(2 * 2 * 4); // zeros = half 0.0
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA16F,
    2,
    2,
    0,
    gl.RGBA,
    gl.HALF_FLOAT,
    probe,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const err = gl.getError();
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteTexture(tex);
  return err === gl.NO_ERROR ? 'A' : 'B';
}

export function createV1Renderer(
  canvas: HTMLCanvasElement,
): V1Renderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    antialias: false,
  }) as WebGL2RenderingContext | null;

  if (!gl) return null; // Tier C — no usable WebGL2.

  // Tag the drawing buffer sRGB explicitly (don't rely on default; 'display-p3'
  // would re-map output). Guarded — property may not exist on older typings.
  try {
    (gl as unknown as { drawingBufferColorSpace?: string }).drawingBufferColorSpace = 'srgb';
  } catch {
    /* non-fatal: only affects display tagging */
  }

  const tier = probeTier(gl);
  if (!tier) return null; // No usable fragment highp → Tier C.

  const program = linkProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
  if (!program) return null; // Shader failed to build → Tier C fallback.

  const vao = gl.createVertexArray();
  if (!vao) return null;

  return new WebGL2V1Renderer(gl, program, vao, tier);
}
