import { useRef, useEffect, useState, useCallback } from 'react'

// MediaPipe Pose skeleton connections (starting from shoulders/hips)
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
  [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
  [15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22],
  // Add connection to nose (0) from shoulders (11,12) for head position
  [11, 0], [12, 0]
]

function drawSkeleton(ctx, keypoints, width, height) {
  if (!keypoints || keypoints.length === 0) return

  const toPixel = (kp) => ({
    x: kp[0] * width,
    y: kp[1] * height,
  })

  // Draw connections
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#4ade80' // Bright green
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
  for (let i = 0; i < keypoints.length; i++) {
    // Skip detailed facial landmarks (1-10 are eyes/ears/mouth)
    // Keep 0 (Nose) as the head reference
    if (i > 0 && i < 11) continue 

    const p = toPixel(keypoints[i])
    ctx.fillStyle = '#4ade80' // Bright green
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2) // Tiny dots
    ctx.fill()
  }
}

export default function VideoPlayer({ results, videos, seekTime }) {
  const refVideoRef = useRef(null)
  const attVideoRef = useRef(null)
  const refCanvasRef = useRef(null)
  const attCanvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const lastSegRef = useRef(-1)

  const [playing, setPlaying] = useState(false)
  const [refPlaying, setRefPlaying] = useState(false)
  const [attPlaying, setAttPlaying] = useState(false)
  const [showSkeletons, setShowSkeletons] = useState(true)

  const [refTime, setRefTime] = useState(0)
  const [attTime, setAttTime] = useState(0)

  const [refDuration, setRefDuration] = useState(0)
  const [attDuration, setAttDuration] = useState(0)

  const [duration, setDuration] = useState(0) // Legacy for compatibility
  const [currentTime, setCurrentTime] = useState(0) // Legacy for compatibility

  const [segmentEnd, setSegmentEnd] = useState(null)
  const [attSegmentEnd, setAttSegmentEnd] = useState(null)

  const [refUrl, setRefUrl] = useState(null)
  const [attUrl, setAttUrl] = useState(null)

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
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Find the corresponding canvas and match its size to the video
        const isRef = entry.target === refVideoRef.current
        const canvas = isRef ? refCanvasRef.current : attCanvasRef.current
        if (canvas) {
          canvas.width = entry.target.clientWidth
          canvas.height = entry.target.clientHeight
          // Also set the CSS size so it overlays perfectly
          canvas.style.width = `${entry.target.clientWidth}px`
          canvas.style.height = `${entry.target.clientHeight}px`
        }
      }
    })

    if (refVideoRef.current) observer.observe(refVideoRef.current)
    if (attVideoRef.current) observer.observe(attVideoRef.current)

    return () => observer.disconnect()
  }, []) // Run once on mount

  const getFrameIndex = useCallback((time, fps, maxFrames) => {
    return Math.min(Math.floor(time * fps), maxFrames - 1)
  }, [])

  const renderFrame = useCallback(() => {
    if (!results) return

    const refVideo = refVideoRef.current
    const attVideo = attVideoRef.current
    if (!refVideo || !attVideo) return

    // Sync state to local variables for independent display
    setRefTime(refVideo.currentTime)
    setAttTime(attVideo.currentTime)
    setCurrentTime(refVideo.currentTime) // Sync global slider

    // Segment-wise synchronization
    let refFinished = false
    let attFinished = false

    if (playing) {
      if (segmentEnd !== null) {
        // Mode: Manual Segment Play (from heatmap)
        if (refVideo.currentTime >= segmentEnd) {
          refVideo.pause()
          refFinished = true
        }
        if (attVideo.currentTime >= attSegmentEnd) {
          attVideo.pause()
          attFinished = true
        }

        if (refFinished && attFinished) {
          setPlaying(false)
          setRefPlaying(false)
          setAttPlaying(false)
          setSegmentEnd(null)
          setAttSegmentEnd(null)
        }
      } else {
        // Mode: Normal Linear Play (syncing by segment boundaries)
        const refTime = refVideo.currentTime
        const segIdx = results.segment_scores?.findIndex(s => refTime >= s.start_time && refTime < s.end_time)
        
        if (segIdx !== undefined && segIdx !== -1 && segIdx !== lastSegRef.current) {
          const seg = results.segment_scores[segIdx]
          console.log(`DEBUG (Sync): Snapping to segment ${segIdx} at ${seg.user_start_time.toFixed(2)}s`)
          
          // Only snap if the drift is noticeable (e.g. > 100ms) or it's the start
          const drift = Math.abs(attVideo.currentTime - seg.user_start_time)
          if (drift > 0.1 || lastSegRef.current === -1) {
            attVideo.currentTime = seg.user_start_time
          }
          lastSegRef.current = segIdx
        }
      }
    }

    // Draw reference skeleton
    if (refCanvasRef.current) {
      const canvas = refCanvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (showSkeletons && results.ref_keypoints.length > 0) {
        const frameIdx = getFrameIndex(
          refVideo.currentTime,
          results.ref_fps,
          results.ref_keypoints.length
        )
        
        if (frameIdx >= 0 && frameIdx < results.ref_keypoints.length) {
          drawSkeleton(ctx, results.ref_keypoints[frameIdx], canvas.width, canvas.height)
        }
      }
    }

    // Draw user skeleton
    if (attCanvasRef.current) {
      const canvas = attCanvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (showSkeletons && results.user_keypoints.length > 0) {
        const frameIdx = getFrameIndex(
          attVideo.currentTime,
          results.user_fps,
          results.user_keypoints.length
        )
        if (frameIdx >= 0 && frameIdx < results.user_keypoints.length) {
          drawSkeleton(ctx, results.user_keypoints[frameIdx], canvas.width, canvas.height)
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(renderFrame)
  }, [results, getFrameIndex, playing, segmentEnd, attSegmentEnd, showSkeletons])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(renderFrame)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [renderFrame])

  useEffect(() => {
    if (seekTime && typeof seekTime === 'object') {
      console.log(`DEBUG (Frontend): Seeking aligned - Ref: ${seekTime.ref.toFixed(2)}s, Att: ${seekTime.att.toFixed(2)}s`)
      if (refVideoRef.current) refVideoRef.current.currentTime = seekTime.ref
      if (attVideoRef.current) attVideoRef.current.currentTime = seekTime.att
      setRefTime(seekTime.ref)
      setAttTime(seekTime.att)
      setCurrentTime(seekTime.ref)
      
      if (seekTime.isSegment) {
        setSegmentEnd(seekTime.end)
        setAttSegmentEnd(seekTime.attEnd)
        setPlaying(true)
        setRefPlaying(true)
        setAttPlaying(true)
        lastSegRef.current = -1
        refVideoRef.current?.play()
        attVideoRef.current?.play()
      }
    } else if (seekTime !== undefined && seekTime !== null) {
      console.log(`DEBUG (Frontend): Seeking simple - Time: ${seekTime.toFixed(2)}s`)
      if (refVideoRef.current) refVideoRef.current.currentTime = seekTime
      if (attVideoRef.current) attVideoRef.current.currentTime = seekTime
      setRefTime(seekTime)
      setAttTime(seekTime)
      setCurrentTime(seekTime)
      lastSegRef.current = -1
    }
  }, [seekTime])

  const togglePlay = useCallback(() => {
    // This is the global/compare play button
    const refV = refVideoRef.current
    const attV = attVideoRef.current
    if (playing) {
      refV?.pause()
      attV?.pause()
      setRefPlaying(false)
      setAttPlaying(false)
    } else {
      setSegmentEnd(null)
      setAttSegmentEnd(null)
      lastSegRef.current = -1 // Reset sync tracking on manual play
      refV?.play()
      attV?.play()
      setRefPlaying(true)
      setAttPlaying(true)
    }
    setPlaying(!playing)
  }, [playing])

  const startComparison = useCallback(() => {
    const refV = refVideoRef.current
    const attV = attVideoRef.current
    if (refV) refV.currentTime = 0
    if (attV) attV.currentTime = 0
    setSegmentEnd(null)
    setAttSegmentEnd(null)
    lastSegRef.current = -1
    refV?.play()
    attV?.play()
    setPlaying(true)
    setRefPlaying(true)
    setAttPlaying(true)
  }, [])

  const pauseBoth = () => {
    refVideoRef.current?.pause()
    attVideoRef.current?.pause()
    setPlaying(false)
    setRefPlaying(false)
    setAttPlaying(false)
  }

  const toggleRefPlay = () => {
    const v = refVideoRef.current
    if (refPlaying) v?.pause()
    else v?.play()
    setRefPlaying(!refPlaying)
    if (playing) setPlaying(false) // Break comparison mode if independent play toggled
  }

  const toggleAttPlay = () => {
    const v = attVideoRef.current
    if (attPlaying) v?.pause()
    else v?.play()
    setAttPlaying(!attPlaying)
    if (playing) setPlaying(false) // Break comparison mode
  }

  const handleRefSeek = (e) => {
    const t = parseFloat(e.target.value)
    if (refVideoRef.current) refVideoRef.current.currentTime = t
    setRefTime(t)
    if (playing) setPlaying(false)
  }

  const handleAttSeek = (e) => {
    const t = parseFloat(e.target.value)
    if (attVideoRef.current) attVideoRef.current.currentTime = t
    setAttTime(t)
    if (playing) setPlaying(false)
  }

  const handleLoadedMetadataRef = () => {
    const d = refVideoRef.current?.duration || 0
    setRefDuration(d)
    setDuration(d) // Legacy for compatibility
  }

  const handleLoadedMetadataAtt = () => {
    const d = attVideoRef.current?.duration || 0
    setAttDuration(d)
  }

  const handleSeek = (e) => {
    const t = parseFloat(e.target.value)
    if (refVideoRef.current) refVideoRef.current.currentTime = t
    if (attVideoRef.current) attVideoRef.current.currentTime = t
    setRefTime(t)
    setAttTime(t)
    setCurrentTime(t)
    lastSegRef.current = -1 // Reset sync tracking on seek
    if (playing) setPlaying(false)
  }

  const handleEndedRef = () => {
    setRefPlaying(false)
    if (playing) setPlaying(false)
  }

  const handleEndedAtt = () => {
    setAttPlaying(false)
    if (playing) setPlaying(false)
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="video-player">
      <div className="video-row">
        <div className="video-container">
          <div className="video-header">
            <h4>Reference</h4>
            <div className="video-controls-mini">
              <button className="mini-play-btn" onClick={toggleRefPlay}>{refPlaying ? 'Pause' : 'Play'}</button>
              <input
                className="mini-slider"
                type="range"
                min={0}
                max={refDuration || 0}
                step={0.01}
                value={refTime}
                onChange={handleRefSeek}
              />
              <span className="mini-time">{formatTime(refTime)} / {formatTime(refDuration)}</span>
            </div>
          </div>
          {refUrl && (
            <video
              ref={refVideoRef}
              src={refUrl}
              muted
              playsInline
              onLoadedMetadata={handleLoadedMetadataRef}
              onEnded={handleEndedRef}
            />
          )}
          <canvas ref={refCanvasRef} className="skeleton-canvas" />
        </div>

        <div className="video-container">
          <div className="video-header">
            <h4>Your Attempt</h4>
            <div className="video-controls-mini">
              <button className="mini-play-btn" onClick={toggleAttPlay}>{attPlaying ? 'Pause' : 'Play'}</button>
              <input
                className="mini-slider"
                type="range"
                min={0}
                max={attDuration || 0}
                step={0.01}
                value={attTime}
                onChange={handleAttSeek}
              />
              <span className="mini-time">{formatTime(attTime)} / {formatTime(attDuration)}</span>
            </div>
          </div>
          {attUrl && (
            <video 
              ref={attVideoRef} 
              src={attUrl} 
              muted 
              playsInline 
              onLoadedMetadata={handleLoadedMetadataAtt}
              onEnded={handleEndedAtt} 
            />
          )}
          <canvas ref={attCanvasRef} className="skeleton-canvas" />
        </div>
      </div>

      <div className="compare-btn-row">
        <button className="compare-btn toggle-videos-btn" onClick={togglePlay}>
          {playing ? 'Pause Videos' : 'Compare Videos'}
        </button>
        <button className="compare-btn pause-all-btn" onClick={startComparison}>
          Restart
        </button>
        <button className="compare-btn info-btn" onClick={() => setShowSkeletons(!showSkeletons)}>
          {showSkeletons ? 'Hide Skeletons' : 'Show Skeletons'}
        </button>
      </div>

    </div>
  )
}
