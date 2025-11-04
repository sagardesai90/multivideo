# Usage Tips & Tricks

## Quick Start Guide

### Watching Sports Streams

For sports streaming sites like StreamEast:

1. Navigate to the stream you want to watch on the streaming site
2. Look for the direct video URL (often ends in .m3u8 for HLS streams)
3. Copy the video URL
4. Paste it into the MultiVideo app
5. Repeat for up to 4 different games

**Note**: Some streaming sites may have protections that prevent embedding. In those cases, you may need to use the site's direct video URL or find an alternative stream.

### Watching YouTube Videos

1. Go to any YouTube video
2. Copy the URL from the address bar (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
3. Select a quadrant (1-4)
4. Paste the URL and click "Load"

### Watching Twitch Streams

1. Navigate to a Twitch channel (e.g., `https://www.twitch.tv/channel_name`)
2. Copy the channel URL
3. Load it into any quadrant

## Pro Tips

### Audio Management

Since all 4 videos play audio simultaneously:

- **Mute unwanted streams**: Click on each video's mute button to silence it
- **Focus on one game**: Keep only one stream unmuted at a time
- **Monitor multiple games**: Mute all until something exciting happens, then unmute

### Keyboard Shortcuts

- **ESC**: Exit expand mode on any video
- **Tab**: Navigate between input fields and buttons

### Best Practices

1. **Start with one video**: Load one stream first to test it works
2. **Check your internet**: 4 simultaneous HD streams require good bandwidth
3. **Use quality settings**: Lower video quality if streams are buffering
4. **Bookmark the page**: Your videos will persist even after closing the browser

### Layout Tips

**Best for Desktop**:
- Minimum screen size: 1920x1080 recommended
- Each quadrant will be 960x540 pixels at 1080p
- Use a large monitor or TV for the best experience

**Quadrant Positioning**:
```
┌─────────┬─────────┐
│    1    │    2    │
├─────────┼─────────┤
│    3    │    4    │
└─────────┴─────────┘
```

## Troubleshooting

### Video won't load

- **Check the URL**: Make sure it's a valid video URL
- **Try a different source**: Some sites block embedding
- **Check console**: Open browser DevTools (F12) to see error messages
- **CORS issues**: Direct video files from some servers may have CORS restrictions

### Video is laggy

- **Lower quality**: Reduce video quality in each player
- **Check bandwidth**: Run a speed test
- **Close other tabs**: Free up browser resources
- **Reduce simultaneous streams**: Try watching only 2-3 at a time

### Videos are out of sync

- This is normal - live streams may have different delays
- Use the seek controls to manually sync if needed (for recorded content)

### Netflix/Prime Video won't work

- These services use DRM protection and cannot be embedded
- The app will show an error message for these services

## Finding Stream URLs

### For Sports (StreamEast, etc.)

1. Open browser DevTools (F12)
2. Go to the Network tab
3. Filter by "m3u8"
4. Play the video on the streaming site
5. Look for .m3u8 URLs in the network requests
6. Copy the full URL and paste it into MultiVideo

**Warning**: Ensure you have the right to access and view the streams you're watching.

### For HLS Streams

Many sports streaming sites use HLS (HTTP Live Streaming) which uses .m3u8 playlist files:
- Look for URLs ending in `.m3u8`
- These are supported natively by the app

## Performance Optimization

### For 4K/High Quality Streams

- **GPU Acceleration**: Ensure hardware acceleration is enabled in your browser
- **RAM**: Close unnecessary applications
- **CPU**: More powerful processors handle multiple streams better

### Recommended Settings

For optimal performance with 4 simultaneous streams:
- **Internet**: 50+ Mbps download speed
- **RAM**: 8GB+ 
- **Browser**: Latest Chrome, Edge, or Firefox
- **Resolution**: 1080p per stream or lower

## Privacy & Storage

### LocalStorage

The app saves your video URLs in browser localStorage:
- Data persists between sessions
- Data is stored only on your device
- No data is sent to any server
- Clear your browser data to remove saved URLs

### Clearing Data

To reset the app:
1. Right-click anywhere on the page
2. Select "Inspect" or press F12
3. Go to Application > Storage > Local Storage
4. Delete the `videoSlots` entry
5. Refresh the page

Or simply clear all video URLs using the "Clear" button for each quadrant.

