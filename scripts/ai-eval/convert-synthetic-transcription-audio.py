"""Normalize synthetic ASR audio fixtures to mono 16 kHz PCM WAV."""

import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg


source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run(
    [
        ffmpeg,
        "-y",
        "-i",
        str(source),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(target),
    ],
    check=True,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
