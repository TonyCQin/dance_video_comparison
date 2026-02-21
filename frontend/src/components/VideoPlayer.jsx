import { useRef, useEffect, useState, useCallback } from 'react'

// MediaPipe Pose skeleton connections
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
  [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
  [15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22],
]

function drawSkeleton(ctx, keypoints, width, height, color, problemColor) {
  if (!keypoints || keypoints.length === 0) return

  // Keypoints are normalized relative to hip midpoint, need to un-normalize for display
  // Center at middle of canvas and scale
  const scale = Math.min(width, height) * 0.8
  const cx = width / 2
  const cy = height / 2

  const toPixel = (kp) => ({
    x: cx + kp[0] * scale,
    y: cy + kp[1] * scale,
  })

  // Draw connections
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.8
  for (const [a, b] of CONNECTIONS) {
    if (a >= keypoints.length || b >= keypoints.length) continue
    const pa = toPixel(keypoints[a])
    const pb = toPixel(keypoints[b])
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }

  // Draw joints
  ctx.globalAlpha = 1
  for (let i = 0; i < keypoints.length; i++) {
    const p = toPixel(keypoints[i])
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

export default function VideoPlayer({ results, videos, seekTime }) {
  const refVideoRef = useRef(null)
  const attVideoRef = useRef(null)
  const refCanvasRef = useRef(null)
  const attCanvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const refUrl = videos.reference ? URL.createObjectURL(videos.reference) : null
  const attUrl = videos.attempt ? URL.createObjectURL(videos.attempt) : null

  const getFrameIndex = useCallback((time, fps, maxFrames) => {
    return Math.min(Math.floor(time * fps), maxFrames - 1)
  }, [])

  const renderFrame = useCallback(() => {
    if (!results) return

    const refVideo = refVideoRef.current
    const attVideo = attVideoRef.current

    // Draw reference skeleton
    if (refCanvasRef.current && results.ref_keypoints.length > 0) {
      const canvas = refCanvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const frameIdx = getFrameIndex(
        refVideo?.currentTime || 0,
        results.ref_fps,
        results.ref_keypoints.length
      )
      if (frameIdx >= 0 && frameIdx < results.ref_keypoints.length) {
        drawSkeleton(ctx, results.ref_keypoints[frameIdx], canvas.width, canvas.height, '#60a5fa')
      }
    }

    // Draw user skeleton
    if (attCanvasRef.current && results.user_keypoints.length > 0) {
      const canvas = attCanvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const frameIdx = getFrameIndex(
        attVideo?.currentTime || 0,
        results.user_fps,
        results.user_keypoints.length
      )
      if (frameIdx >= 0 && frameIdx < results.user_keypoints.length) {
        drawSkeleton(ctx, results.user_keypoints[frameIdx], canvas.width, canvas.height, '#4ade80')
      }
    }

    animFrameRef.current = requestAnimationFrame(renderFrame)
  }, [results, getFrameIndex])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(renderFrame)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [renderFrame])

  useEffect(() => {
    if (seekTime !== undefined && seekTime !== null) {
      if (refVideoRef.current) refVideoRef.current.currentTime = seekTime
      if (attVideoRef.current) attVideoRef.current.currentTime = seekTime
      setCurrentTime(seekTime)
    }
  }, [seekTime])

  const togglePlay = () => {
    const refV = refVideoRef.current
    const attV = attVideoRef.current
    if (playing) {
      refV?.pause()
      attV?.pause()
    } else {
      refV?.play()
      attV?.play()
    }
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => {
    const t = refVideoRef.current?.currentTime || 0
    setCurrentTime(t)
  }

  const handleLoadedMetadata = () => {
    const d = refVideoRef.current?.duration || 0
    setDuration(d)
  }

  const handleSeek = (e) => {
    const t = parseFloat(e.target.value)
    if (refVideoRef.current) refVideoRef.current.currentTime = t
    if (attVideoRef.current) attVideoRef.current.currentTime = t
    setCurrentTime(t)
  }

  const handleEnded = () => setPlaying(false)

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="video-player">
      <div className="video-container">
        <h4>Reference</h4>
        {refUrl && (
          <video
            ref={refVideoRef}
            src={refUrl}
            muted
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
          />
        )}
        <canvas ref={refCanvasRef} className="skeleton-canvas" />
      </div>

      <div className="video-container">
        <h4>Your Attempt</h4>
        {attUrl && (
          <video ref={attVideoRef} src={attUrl} muted playsInline onEnded={handleEnded} />
        )}
        <canvas ref={attCanvasRef} className="skeleton-canvas" />
      </div>

      <div className="playback-controls">
        <button className="play-btn" onClick={togglePlay}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          className="time-slider"
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
        />
        <span className="time-label">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
