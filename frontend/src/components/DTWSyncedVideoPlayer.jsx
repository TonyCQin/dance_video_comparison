import { useRef, useEffect, useState, useCallback } from 'react'

// MediaPipe Pose skeleton connections
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
  [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
  [15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22],
]

function drawSkeleton(ctx, keypoints, width, height, color) {
  if (!keypoints || keypoints.length === 0) return

  const scale = Math.min(width, height) * 1.5
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
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

export default function DTWSyncedVideoPlayer({ results, videos }) {
  const refVideoRef = useRef(null)
  const attVideoRef = useRef(null)
  const refCanvasRef = useRef(null)
  const attCanvasRef = useRef(null)
  const animFrameRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [currentPathIndex, setCurrentPathIndex] = useState(0)
  const [duration, setDuration] = useState(0)

  const [refUrl, setRefUrl] = useState(null)
  const [attUrl, setAttUrl] = useState(null)

  // Build a map from ref frame index to user frame index
  const dtwMap = useCallback(() => {
    const map = {}
    if (results?.dtw_path) {
      for (const [refIdx, userIdx] of results.dtw_path) {
        map[refIdx] = userIdx
      }
    }
    return map
  }, [results])

  useEffect(() => {
    if (videos?.reference) {
      const url = URL.createObjectURL(videos.reference)
      setRefUrl(url)
      return () => URL.revokeObjectURL(url)
    } else setRefUrl(null)
  }, [videos?.reference])

  useEffect(() => {
    if (videos?.attempt) {
      const url = URL.createObjectURL(videos.attempt)
      setAttUrl(url)
      return () => URL.revokeObjectURL(url)
    } else setAttUrl(null)
  }, [videos?.attempt])

  useEffect(() => {
    const updateCanvasSize = () => {
      if (refCanvasRef.current) {
        refCanvasRef.current.width = refCanvasRef.current.offsetWidth
        refCanvasRef.current.height = refCanvasRef.current.offsetHeight
      }
      if (attCanvasRef.current) {
        attCanvasRef.current.width = attCanvasRef.current.offsetWidth
        attCanvasRef.current.height = attCanvasRef.current.offsetHeight
      }
    }

    updateCanvasSize()

    const observer = new ResizeObserver(updateCanvasSize)
    if (refCanvasRef.current) observer.observe(refCanvasRef.current)
    if (attCanvasRef.current) observer.observe(attCanvasRef.current)

    return () => observer.disconnect()
  }, [])

  const getFrameIndex = useCallback((time, fps, maxFrames) => {
    return Math.min(Math.floor(time * fps), maxFrames - 1)
  }, [])

  const renderFrame = useCallback(() => {
    if (!results) return

    const pathLength = results.dtw_path?.length || 0

    if (pathLength === 0) {
      animFrameRef.current = requestAnimationFrame(renderFrame)
      return
    }

    const [refIdx, userIdx] = results.dtw_path[currentPathIndex] || [0, 0]

    // Draw reference skeleton
    if (refCanvasRef.current && results.ref_keypoints.length > 0) {
      const canvas = refCanvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (refIdx >= 0 && refIdx < results.ref_keypoints.length) {
        drawSkeleton(ctx, results.ref_keypoints[refIdx], canvas.width, canvas.height, '#60a5fa')
      }
    }

    // Draw user skeleton
    if (attCanvasRef.current && results.user_keypoints.length > 0) {
      const canvas = attCanvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (userIdx >= 0 && userIdx < results.user_keypoints.length) {
        drawSkeleton(ctx, results.user_keypoints[userIdx], canvas.width, canvas.height, '#4ade80')
      }
    }

    animFrameRef.current = requestAnimationFrame(renderFrame)
  }, [results, currentPathIndex])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(renderFrame)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [renderFrame])

  const togglePlay = async () => {
    if (playing) {
      setPlaying(false)
    } else {
      setPlaying(true)
    }
  }

  const handleLoadedMetadata = () => {
    if (results?.dtw_path) {
      setDuration(results.dtw_path.length)
    }
  }

  const handleSeek = (e) => {
    const idx = parseInt(e.target.value)
    setCurrentPathIndex(idx)
  }

  useEffect(() => {
    if (!playing || !results?.dtw_path) return

    const interval = setInterval(() => {
      setCurrentPathIndex((prev) => {
        const next = prev + 1
        if (next >= results.dtw_path.length) {
          setPlaying(false)
          return prev
        }
        return next
      })
    }, 33) // ~30fps

    return () => clearInterval(interval)
  }, [playing, results])

  const formatFrameCount = (count) => {
    const secs = (count / 30).toFixed(1)
    return `${count} (${secs}s)`
  }

  return (
    <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
      <h2>DTW-Synced Playback</h2>
      <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
        Poses synced using Dynamic Time Warping - frames are matched based on pose similarity, not time
      </p>

      <div style={{ marginBottom: '20px' }}>
        <div className="playback-controls">
          <button className="play-btn" onClick={togglePlay}>
            {playing ? 'Pause' : 'Play'}
          </button>
          {results?.dtw_path && (
            <>
              <input
                className="time-slider"
                type="range"
                min={0}
                max={Math.max(0, results.dtw_path.length - 1)}
                step={1}
                value={currentPathIndex}
                onChange={handleSeek}
              />
              <span className="time-label">
                {formatFrameCount(currentPathIndex)} / {formatFrameCount(duration - 1)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="skeleton-overlay-container">
        <h3 className="skeleton-overlay-title">Pose Alignment</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="skeleton-overlay-box">
            <canvas 
              ref={refCanvasRef} 
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%', 
                height: '100%',
                display: 'block'
              }} 
            />
          </div>
          <div className="skeleton-overlay-box">
            <canvas 
              ref={attCanvasRef} 
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%', 
                height: '100%',
                display: 'block'
              }} 
            />
          </div>
        </div>
      </div>

      <div className="dtw-info-box">
        <p>
          <strong>DTW Path:</strong> {results?.dtw_path?.length || 0} alignment pairs
        </p>
        <p>
          <strong>How it works:</strong> Each frame pair represents matched poses between the reference and attempt videos.
          Poses are displayed step-by-step through their optimal alignment.
        </p>
      </div>
    </div>
  )
}
