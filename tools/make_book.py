#!/usr/bin/env python3
"""쪽 이미지(PNG) 폴더를 서재용 책 폴더로 바꿉니다.

    python3 tools/make_book.py <PNG 폴더> books/<책 id>

PNG 파일은 이름순으로 정렬해 첫 장을 앞표지, 마지막 장을 뒤표지로 씁니다.
만들어지는 것:
    pages/p001.webp …   읽기 화면과 크게 보기에 쓰는 원본 크기 쪽
    thumbs/p001.webp …  목차와 쪽 이동 막대 미리보기용 작은 쪽
    cover.webp, back.webp  서재에 떠 있는 책의 앞·뒤 표지
"""
import sys
from pathlib import Path

from PIL import Image

PAGE_QUALITY = 84
THUMB_WIDTH = 180
COVER_WIDTH = 560


def to_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        return bg
    return img.convert("RGB")


def resized(img: Image.Image, width: int) -> Image.Image:
    height = round(img.height * width / img.width)
    return img.resize((width, height), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    files = sorted(p for p in src.iterdir() if p.suffix.lower() == ".png")
    if len(files) < 2:
        sys.exit(f"{src} 에 PNG가 두 장 이상 있어야 합니다.")

    (out / "pages").mkdir(parents=True, exist_ok=True)
    (out / "thumbs").mkdir(parents=True, exist_ok=True)

    total = 0
    for i, path in enumerate(files, start=1):
        img = to_rgb(Image.open(path))
        name = f"p{i:03d}.webp"
        page_path = out / "pages" / name
        img.save(page_path, "WEBP", quality=PAGE_QUALITY, method=6)
        resized(img, THUMB_WIDTH).save(out / "thumbs" / name, "WEBP", quality=78, method=6)
        total += page_path.stat().st_size
        if i == 1:
            resized(img, COVER_WIDTH).save(out / "cover.webp", "WEBP", quality=88, method=6)
        if i == len(files):
            resized(img, COVER_WIDTH).save(out / "back.webp", "WEBP", quality=88, method=6)

    print(f"{len(files)}쪽 → {out}  (쪽 이미지 합계 {total / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
