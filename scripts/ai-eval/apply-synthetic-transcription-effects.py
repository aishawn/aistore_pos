"""Apply deterministic noise and pause effects to local synthetic WAV fixtures."""

import json
import math
import random
import struct
import sys
import wave
from pathlib import Path


manifest_path = Path(sys.argv[1]).resolve()
audio_dir = Path(sys.argv[2]).resolve()
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
changed = 0

for case in manifest["cases"]:
    effect = case.get("audioEffect")
    if not effect:
        continue
    path = audio_dir / case["audioFile"]
    with wave.open(str(path), "rb") as source:
        params = source.getparams()
        frames = source.readframes(source.getnframes())
    if params.nchannels != 1 or params.sampwidth != 2 or params.comptype != "NONE":
        raise ValueError(f"unsupported synthesized WAV format for {case['id']}: {params}")

    samples = list(struct.unpack(f"<{len(frames) // 2}h", frames))
    if effect["type"] == "mid-sentence-pause":
        split_at = len(samples) // 2
        silence = [0] * round(params.framerate * effect["pauseMs"] / 1000)
        samples[split_at:split_at] = silence
    elif effect["type"] == "white-noise":
        signal_rms = math.sqrt(sum(sample * sample for sample in samples) / max(1, len(samples)))
        noise_rms = signal_rms / (10 ** (effect["snrDb"] / 20))
        seed = sum((index + 1) * ord(char) for index, char in enumerate(case["id"]))
        rng = random.Random(seed)
        samples = [max(-32768, min(32767, round(sample + rng.gauss(0, noise_rms)))) for sample in samples]
    else:
        raise ValueError(f"unknown audio effect for {case['id']}: {effect['type']}")

    with wave.open(str(path), "wb") as output:
        output.setparams(params._replace(nframes=len(samples)))
        output.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    changed += 1

print(json.dumps({"effectsApplied": changed, "filesModified": changed}))
