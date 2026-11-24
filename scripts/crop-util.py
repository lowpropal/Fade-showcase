import sys
from PIL import Image

def main():
    if len(sys.argv) < 8:
        print("Usage: python3 crop-util.py <src_png> <dst_png> <x> <y> <w> <h> <scale> [check_type]")
        sys.exit(1)

    src = sys.argv[1]
    dst = sys.argv[2]
    x = float(sys.argv[3])
    y = float(sys.argv[4])
    w = float(sys.argv[5])
    h = float(sys.argv[6])
    scale = float(sys.argv[7])
    check_type = sys.argv[8] if len(sys.argv) > 8 else "default"

    im = Image.open(src)
    left = int(round(x * scale))
    top = int(round(y * scale))
    right = int(round((x + w) * scale))
    bottom = int(round((y + h) * scale))

    # Clamp to image size
    left = max(0, left)
    top = max(0, top)
    right = min(im.width, right)
    bottom = min(im.height, bottom)

    if right <= left or bottom <= top:
        print(f"FAIL: Invalid crop coordinates: ({left}, {top}, {right}, {bottom})")
        sys.exit(2)

    cropped = im.crop((left, top, right, bottom))
    cropped.save(dst)

    # Automated validation:
    if cropped.width < 100 or cropped.height < 50:
        print(f"FAIL: Cropped image too small: {cropped.size}")
        sys.exit(2)

    # Left-side black bar check (catching CDP offset bug where sidebar was black)
    left_sample_col = [cropped.getpixel((5, py)) for py in range(10, min(80, cropped.height))]
    all_black = all(p[:3] == (0, 0, 0) for p in left_sample_col)
    center_pixel = cropped.getpixel((cropped.width // 2, cropped.height // 2))
    
    # In FADE dark mode, card background is surface-1 (#18181B / rgb(24, 24, 27)), NOT pure black (0, 0, 0)
    if all_black and center_pixel[:3] != (0, 0, 0):
        print("FAIL: Artificial pure black border/offset detected on left edge!")
        sys.exit(3)

    print(f"SUCCESS: Cropped to {cropped.size}")
    sys.exit(0)

if __name__ == "__main__":
    main()
