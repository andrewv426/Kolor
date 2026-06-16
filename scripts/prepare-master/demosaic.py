#!/usr/bin/env python3
# demosaic.py — color-gradle pipeline v1 Level-1 RAW demosaic step.
#
# Usage:
#   python3 demosaic.py <input.raw> <out.tiff>
#
# Turns a camera-RAW file (DNG/CR2/CR3/NEF/ARW/...) into a 16-bit sRGB-encoded
# RGB TIFF that drops straight into the EXISTING sRGB master pipeline in
# index.mjs (it replaces the JPEG decode for the curation gate + ffmpeg handoff;
# everything downstream is unchanged).
#
# The recipe below is FROZEN as part of pipeline v1 (see PRD §6.2.1 amendment
# 2026-06-15 and constants.mjs DEMOSAIC). It is deterministic:
#   - VNG demosaic is single-threaded (no OpenMP nondeterminism).
#   - camera white balance (as-shot), no auto-bright, no auto-WB → no data-driven
#     scaling that could vary run to run.
#   - sRGB output color + gamma=(2.4, 12.92) → the sRGB transfer curve, same
#     space the rest of the pipeline / shader already work in.
#   - highlight_mode=Clip → deterministic highlight handling (no reconstruction).
#
# Determinism caveat: LibRaw, like libvips, is not guaranteed bit-identical
# ACROSS CPU architectures. The canonical mint must happen on one pinned arch
# (the CI runner) so re-run hashes are comparable. Repeated runs on the SAME
# machine are bit-identical (verified).
#
# Prints ONE JSON line of provenance to stdout. No timestamps anywhere; the TIFF
# is written via tifffile with photometric='rgb' and no datetime tag.

import json
import sys

import rawpy
import tifffile


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: python3 demosaic.py <input.raw> <out.tiff>\n")
        sys.exit(2)

    inp, out = sys.argv[1], sys.argv[2]

    with rawpy.imread(inp) as raw:
        rgb = raw.postprocess(
            demosaic_algorithm=rawpy.DemosaicAlgorithm.VNG,  # single-threaded → deterministic
            use_camera_wb=True,                              # as-shot WB
            use_auto_wb=False,                               # never auto-WB
            no_auto_bright=True,                             # no auto exposure
            output_bps=16,
            output_color=rawpy.ColorSpace.sRGB,
            gamma=(2.4, 12.92),                              # sRGB-encoded output
            highlight_mode=rawpy.HighlightMode.Clip,
        )

    # 16-bit RGB TIFF, no datetime/software tags → byte-deterministic handoff.
    tifffile.imwrite(out, rgb, photometric="rgb")

    provenance = {
        "tool": "rawpy",
        "rawpyVersion": rawpy.__version__,
        "librawVersion": str(rawpy.libraw_version),
        "algorithm": "VNG",
        "whiteBalance": "camera",
        "gamma": [2.4, 12.92],
        "outputColor": "sRGB",
        "noAutoBright": True,
        "highlightMode": "clip",
        "outputBps": 16,
    }
    sys.stdout.write(json.dumps(provenance) + "\n")


if __name__ == "__main__":
    main()
