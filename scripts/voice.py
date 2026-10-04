# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-audio==0.5.7", "soundfile==0.13.1", "numpy"]
# ///
"""Speaks narration lines with Chatterbox Turbo (MLX), in the voice of a reference clip.

Driven by scripts/voice.mjs: reads {"reference": path, "items": [{"text", "out"}]} as
JSON on stdin and writes one WAV per item. Each take is transcribed back with
Parakeet; a take that drifts from the text (a skipped or invented word) is
retried with another seed, and the closest take wins.
"""

import difflib
import json
import re
import sys

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.stt.utils import load_model as load_stt
from mlx_audio.tts.utils import load_model as load_tts

TTS_MODEL = "mlx-community/chatterbox-turbo-fp16"
STT_MODEL = "mlx-community/parakeet-tdt-0.6b-v3"
TAKES = 4  # at most, per line
GOOD_ENOUGH = 0.97  # word-level similarity that ends the search early
SENTENCE_GAP = 0.22  # seconds between sentences


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def speakable(text: str) -> str:
    return (
        text.replace("’", "'").replace("‘", "'").replace("“", "").replace("”", "")
        .replace(" — ", ", ").replace("—", ", ").replace("…", "...").replace("·", ",")
    )


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower().replace("’", "'"))


def trim(a: np.ndarray, sr: int) -> np.ndarray:
    """Cuts the silence a sentence starts and ends with, keeping a short margin."""
    loud = np.flatnonzero(np.abs(a) > 0.02 * (np.abs(a).max() or 1))
    if not len(loud):
        return a
    m = int(0.04 * sr)
    return a[max(0, loud[0] - m) : loud[-1] + m]


def take(tts, text: str, reference: str, seed: int) -> np.ndarray:
    mx.random.seed(seed)
    sr = tts.sample_rate
    gap = np.zeros(int(SENTENCE_GAP * sr), dtype=np.float32)
    parts = []
    for r in tts.generate(speakable(text), ref_audio=reference, verbose=False):
        if parts:
            parts.append(gap)
        parts.append(trim(np.array(r.audio, dtype=np.float32), sr))
    return np.concatenate(parts)


def main():
    job = json.load(sys.stdin)
    tts = load_tts(TTS_MODEL)
    stt = load_stt(STT_MODEL)
    for i, item in enumerate(job["items"]):
        want = words(item["text"])
        best, best_score = None, -1.0
        for t in range(TAKES):
            audio = take(tts, item["text"], job["reference"], seed=1000 * t + 7)
            sf.write(item["out"], audio, tts.sample_rate)
            heard = words(stt.generate(item["out"]).text)
            score = difflib.SequenceMatcher(None, want, heard).ratio()
            if score > best_score:
                best, best_score = audio, score
            if score >= GOOD_ENOUGH:
                break
        sf.write(item["out"], best, tts.sample_rate)
        log(f"  [{i + 1}/{len(job['items'])}] {best_score:.2f} {len(best) / tts.sample_rate:5.1f}s  {item['text'][:60]}…")


main()
