"""Creates upload fixtures: a big JPEG, a PNG, a one-page PDF and a fake image (text file named .png)."""
from PIL import Image, ImageDraw
import os, random
os.makedirs('fixtures', exist_ok=True)
random.seed(1)
im = Image.effect_noise((4000, 3000), 90).convert('RGB')           # noisy => compresses badly => several MB
ImageDraw.Draw(im).rectangle([200, 200, 3800, 900], fill=(155, 80, 51))
im.save('fixtures/large-photo.jpg', quality=95)
Image.open('../db/seed/images/05.webp').save('fixtures/poster.png')
Image.open('../db/seed/images/02.webp').convert('RGB').save('fixtures/poster-from-pdf.pdf', 'PDF', resolution=100)
open('fixtures/not-an-image.png', 'w').write('this is just text pretending to be a PNG')
for f in sorted(os.listdir('fixtures')): print(f, os.path.getsize('fixtures/' + f) // 1024, 'KB')
