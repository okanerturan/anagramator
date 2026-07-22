#!/usr/bin/env python3
"""Render a high-quality looping GIF with Swift, FFmpeg, and gifski."""

from __future__ import annotations

import json
import math
import subprocess
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "anagram.json"
ASS = ROOT / "anagram_rearrangement.ass"
OUTPUT = ROOT / "assets" / "anagramator-demo.gif"

WIDTH, HEIGHT = 1920, 1080
FPS, DURATION = 30, 8
GIF_WIDTH, GIF_FPS = 1200, 15
FONT_NAME = "Menlo"
FONT_SIZE = 42
CHAR_W, LINE_H = 25.3, 68
MAX_COLS = 66
TEXT_TOP = 350


def letters(text: str) -> str:
    return "".join(ch.casefold() for ch in text if ch.isalpha())


def wrap_with_indices(text: str, max_cols: int) -> list[list[tuple[int, str]]]:
    """Word-wrap text while retaining each character's original index."""
    words: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    for index, ch in enumerate(text):
        current.append((index, ch))
        if ch == " ":
            words.append(current)
            current = []
    if current:
        words.append(current)

    lines: list[list[tuple[int, str]]] = []
    line: list[tuple[int, str]] = []
    for word in words:
        if line and len(line) + len(word) > max_cols:
            while line and line[-1][1] == " ":
                line.pop()
            lines.append(line)
            line = []
            while word and word[0][1] == " ":
                word = word[1:]
        line.extend(word)
    if line:
        lines.append(line)
    return lines


def positions(text: str) -> dict[int, tuple[float, float]]:
    result: dict[int, tuple[float, float]] = {}
    lines = wrap_with_indices(text, MAX_COLS)
    block_h = (len(lines) - 1) * LINE_H
    y0 = TEXT_TOP + (2 * LINE_H - block_h) / 2
    for row, line in enumerate(lines):
        line_w = len(line) * CHAR_W
        x0 = (WIDTH - line_w) / 2 + CHAR_W / 2
        for col, (index, _ch) in enumerate(line):
            result[index] = (x0 + col * CHAR_W, y0 + row * LINE_H)
    return result


def ass_time(seconds: float) -> str:
    hundredths = round(seconds * 100)
    return f"0:{hundredths // 6000:02d}:{(hundredths // 100) % 60:02d}.{hundredths % 100:02d}"


def esc(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")


def event(start: float, end: float, layer: int, style: str, text: str) -> str:
    return f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}"


def build_ass(source: str, target: str) -> str:
    source_pos, target_pos = positions(source), positions(target)
    target_by_letter: dict[str, list[int]] = defaultdict(list)
    for index, ch in enumerate(target):
        if ch.isalpha():
            target_by_letter[ch.casefold()].append(index)

    # Match occurrences in reading order. This is stable and proves every target
    # letter is supplied by exactly one source letter.
    used = defaultdict(int)
    matches: list[tuple[int, int]] = []
    for source_index, ch in enumerate(source):
        if not ch.isalpha():
            continue
        key = ch.casefold()
        target_index = target_by_letter[key][used[key]]
        used[key] += 1
        matches.append((source_index, target_index))

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {WIDTH}
PlayResY: {HEIGHT}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Letter,{FONT_NAME},{FONT_SIZE},&H00F5F7FF,&H00F5F7FF,&H002E466B,&H00000000,0,0,0,0,100,100,0,0,1,1.2,0,5,0,0,0,1
Style: Muted,{FONT_NAME},{FONT_SIZE},&H007A89A8,&H007A89A8,&H00182034,&H00000000,0,0,0,0,100,100,0,0,1,1,0,5,0,0,0,1
Style: Title,Arial,54,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,80,80,58,1
Style: Label,Arial,25,&H00AFC4EA,&H00AFC4EA,&H00000000,&H00000000,-1,0,0,0,100,100,1.5,0,1,0,0,8,80,80,245,1
Style: Note,Arial,28,&H00C9D5EA,&H00C9D5EA,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,80,80,60,1
Style: Badge,Arial,28,&H0038E8B0,&H0038E8B0,&H000F2A29,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,2,80,80,115,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    events: list[str] = []
    events.append(event(0, DURATION, 0, "Title", "Perfect anagram"))
    events.append(event(0, 2.25, 0, "Label", r"SOURCE  •  103 LETTERS" + r"{\fad(250,300)}"))
    events.append(event(5.4, DURATION, 0, "Label", r"TARGET  •  103 LETTERS" + r"{\fad(300,250)}"))
    events.append(event(0, DURATION, 0, "Note", "Compared case-insensitively • spaces and punctuation excluded"))
    events.append(event(5.55, DURATION, 0, "Badge", r"✓ IDENTICAL LETTER COUNTS{\fad(350,250)}"))

    # Punctuation and spaces anchor the source briefly, then disappear.
    for index, ch in enumerate(source):
        if ch.isalpha() or ch == " ":
            continue
        x, y = source_pos[index]
        events.append(event(0, 2.3, 1, "Muted", rf"{{\pos({x:.1f},{y:.1f})\fad(250,350)}}{esc(ch)}"))

    # Every source letter travels to the corresponding target occurrence.
    for order, (source_index, target_index) in enumerate(matches):
        sx, sy = source_pos[source_index]
        tx, ty = target_pos[target_index]
        stagger = (order % 13) * 22
        t1, t2 = 2100 + stagger, 5000 + stagger
        glyph = esc(source[source_index])
        events.append(event(0.2, 5.45, 2, "Letter", rf"{{\move({sx:.1f},{sy:.1f},{tx:.1f},{ty:.1f},{t1},{t2})\fad(250,300)}}{glyph}"))

    # The exact target glyphs (including the one case change) settle crisply.
    for index, ch in enumerate(target):
        if ch == " ":
            continue
        x, y = target_pos[index]
        style = "Letter" if ch.isalpha() else "Muted"
        delay = 0 if ch.isalpha() else (index % 7) * 25
        events.append(event(5.05 + delay / 1000, DURATION, 3, style, rf"{{\pos({x:.1f},{y:.1f})\fad(350,250)}}{esc(ch)}"))

    return header + "\n".join(events) + "\n"


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    source, target = data["source"], data["target"]
    a, b = letters(source), letters(target)
    if Counter(a) != Counter(b):
        raise SystemExit("Source and target are not anagrams when comparing letters only.")

    OUTPUT.parent.mkdir(exist_ok=True)

    renderer = ROOT / "render_frames"
    subprocess.run(
        ["swiftc", "-O", "render_frames.swift", "-o", str(renderer)],
        cwd=ROOT, check=True,
    )
    producer = subprocess.Popen([str(renderer)], cwd=ROOT, stdout=subprocess.PIPE)
    assert producer.stdout is not None
    ffmpeg = subprocess.Popen(
        [
            "ffmpeg", "-v", "error",
            "-f", "rawvideo", "-pixel_format", "argb",
            "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS),
            "-i", "pipe:0",
            "-vf", f"fps={GIF_FPS},scale={GIF_WIDTH}:-2:flags=lanczos",
            "-pix_fmt", "yuv444p",
            "-f", "yuv4mpegpipe", "pipe:1",
        ],
        cwd=ROOT, stdin=producer.stdout, stdout=subprocess.PIPE,
    )
    producer.stdout.close()
    assert ffmpeg.stdout is not None
    subprocess.run(
        [
            "gifski", "--quiet", "--extra",
            "--fps", str(GIF_FPS), "--width", str(GIF_WIDTH),
            "--quality", "95", "--motion-quality", "95", "--lossy-quality", "95",
            "--repeat", "0", "--output", str(OUTPUT), "-",
        ],
        cwd=ROOT, stdin=ffmpeg.stdout, check=True,
    )
    ffmpeg.stdout.close()
    if ffmpeg.wait() != 0:
        raise SystemExit("FFmpeg conversion failed")
    if producer.wait() != 0:
        raise SystemExit("Frame renderer failed")
    print(f"Verified: {len(a)} letters on each side; counts are identical.")
    print(OUTPUT)


if __name__ == "__main__":
    main()
