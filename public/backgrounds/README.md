# Background Images

This folder contains default background images for the VRM Assistant application.

## Structure

```
public/backgrounds/
├── README.md                    # This file
├── cyberpunk-city.jpg          # Default backgrounds (1920x1080 recommended)
├── neon-grid.jpg
├── space-station.jpg
├── digital-void.jpg
├── hologram-lab.jpg            # Pro-only backgrounds
├── matrix-code.jpg
└── thumbs/                     # Thumbnail versions (200x112 recommended)
    ├── cyberpunk-city-thumb.jpg
    ├── neon-grid-thumb.jpg
    ├── space-station-thumb.jpg
    ├── digital-void-thumb.jpg
    ├── hologram-lab-thumb.jpg
    └── matrix-code-thumb.jpg
```

## Image Requirements

### Full Size Images
- **Resolution**: 1920x1080 (16:9 aspect ratio) recommended
- **Format**: JPG, PNG, or WebP
- **Size**: Under 2MB for optimal loading
- **Quality**: High quality for immersive experience

### Thumbnails
- **Resolution**: 200x112 (16:9 aspect ratio)
- **Format**: JPG recommended for smaller file size
- **Size**: Under 50KB
- **Quality**: Medium quality for fast loading

## Adding New Default Backgrounds

1. Add the full-size image to `/public/backgrounds/`
2. Create a thumbnail and add to `/public/backgrounds/thumbs/`
3. Update `DEFAULT_BACKGROUNDS` array in `src/lib/background-manager.ts`

Example:
```typescript
{
  id: 'new-background',
  name: 'New Background',
  url: '/backgrounds/new-background.jpg',
  type: 'default',
  isPro: false, // or true for Pro-only
  thumbnail: '/backgrounds/thumbs/new-background-thumb.jpg',
}
```

## Background Categories

### Free Backgrounds
- Cyberpunk City - Futuristic cityscape
- Neon Grid - Digital grid pattern
- Space Station - Sci-fi space environment
- Digital Void - Abstract digital space

### Pro Backgrounds
- Hologram Lab - Advanced laboratory setting
- Matrix Code - Digital matrix effect

## Technical Notes

- Images are loaded as textures and mapped to a sphere geometry
- The sphere is rendered with `THREE.BackSide` for 360° effect
- Images should be seamless or designed for spherical mapping
- Fallback gradients are used if image loading fails

## Performance Considerations

- Use compressed images to reduce loading time
- Thumbnails improve gallery performance
- Consider WebP format for better compression
- Test on mobile devices for performance impact

## Creating Seamless Backgrounds

For best results, backgrounds should be designed for 360° spherical mapping:
1. Use equirectangular projection
2. Ensure horizontal edges match when wrapped
3. Avoid important details at the poles (top/bottom)
4. Test the spherical mapping in a 3D viewer

## Placeholder Images

Currently using placeholder images. Replace with actual cyberpunk/sci-fi themed backgrounds:
- Use royalty-free or licensed images
- Ensure images match the cyberpunk aesthetic
- Consider generating AI backgrounds for consistency
- Maintain high visual quality for professional use