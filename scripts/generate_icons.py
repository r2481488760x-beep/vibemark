from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
SIZES = [16, 32, 48, 128, 512]


def rounded_rectangle(draw, xy, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_icon(size):
    scale = max(4, 512 // size)
    canvas_size = size * scale
    factor = canvas_size / 512

    def p(value):
        return int(round(value * factor))

    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    rounded_rectangle(draw, [0, 0, canvas_size, canvas_size], p(112), fill="#111318")
    rounded_rectangle(draw, [p(62), p(62), p(450), p(450)], p(84), fill="#F6F7F9")
    draw.line([(p(139), p(143)), (p(229), p(369)), (p(283), p(369)), (p(373), p(143))], fill="#111318", width=p(58), joint="curve")

    return image.resize((size, size), Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    for size in SIZES:
        draw_icon(size).save(OUT / f"icon-{size}.png")


if __name__ == "__main__":
    main()
