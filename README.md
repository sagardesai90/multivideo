# MultiVideo - Watch Multiple Streams Simultaneously

A Next.js application that allows you to watch up to 4 video streams simultaneously in a 2x2 grid layout. Perfect for watching multiple sports games, live streams, or videos at the same time.

## Features

- **2x2 Grid Layout**: Watch 4 videos simultaneously in equal quadrants
- **Multi-Source Support**: 
  - YouTube videos
  - Twitch streams
  - Direct video URLs (MP4, WebM, OGG)
  - HLS streams (.m3u8) for sports streaming sites
  - Other video sources supported by react-player
- **Click-to-Focus**: Click on any quadrant to focus it (green border indicator)
- **Expand Mode**: Expand any video to fill its quadrant completely
- **Persistent State**: Your video URLs are saved in localStorage and restored on page reload
- **Dark Theme**: Optimized for extended viewing sessions
- **ESC Key Support**: Press ESC to exit expand mode

## Getting Started

### Prerequisites

- Node.js 18.20.8 or higher (20.9.0+ recommended)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Adding Videos

1. **Select a Quadrant**: Click on one of the numbered buttons (1-4) at the top to select which quadrant you want to load a video into
2. **Paste URL**: Paste your video URL in the input field
3. **Load**: Click the "Load" button to start playing the video
4. **Clear**: Click "Clear" to remove a video from the selected quadrant

### Supported URL Examples

- **YouTube**: `https://www.youtube.com/watch?v=VIDEO_ID`
- **Twitch**: `https://www.twitch.tv/CHANNEL_NAME`
- **Direct Video**: `https://example.com/video.mp4`
- **HLS Stream**: `https://example.com/stream.m3u8`

### Controls

- **Focus**: Click on any quadrant to focus it (shows green border)
- **Expand**: Click the "⛶ Expand" button on a focused video to maximize it within its quadrant
- **Normal View**: Click "◱ Normal" or press ESC to return to normal view
- **Quadrant Selection**: Use the numbered buttons (1-4) to select which quadrant to modify

## Known Limitations

- **Netflix**: Netflix content cannot be embedded due to DRM restrictions
- **CORS**: Some streaming sites may have CORS restrictions that prevent embedding
- **Fullscreen**: The expand feature maximizes videos within their quadrant, not the entire screen (this is by design)
- **Audio**: All videos play their own audio - you may want to mute some streams

## Technology Stack

- **Next.js 16**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **react-player**: Universal video player component
- **hls.js**: HLS stream support

## Future Enhancements (iOS Support)

The app currently works best on desktop browsers. Future updates will include:

- PWA support for "Add to Home Screen" on iOS
- Touch gesture controls for mobile
- iOS-specific video player handling
- Orientation lock support
- Responsive grid for smaller screens

## Development

### Project Structure

```
multivideo/
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx             # Main page component
│   └── globals.css          # Global styles
├── components/
│   ├── VideoGrid.tsx        # 2x2 grid container with state management
│   ├── VideoPlayer.tsx      # Individual video player component
│   └── VideoInput.tsx       # URL input and quadrant selector
└── package.json
```

### Key Components

- **VideoGrid**: Manages the overall grid layout, state for 4 video slots, focus state, and localStorage persistence
- **VideoPlayer**: Handles individual video playback with multi-source support, error handling, and expand functionality
- **VideoInput**: Provides URL input, quadrant selection, and load/clear actions

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
