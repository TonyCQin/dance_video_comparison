import { useState, useRef, useCallback } from 'react'

const API_BASE = '/api'

function DropZone({ label, file, onFile }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()
  const previewUrl = file ? URL.createObjectURL(file) : null

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && dropped.type.startsWith('video/')) {
      onFile(dropped)
    }
  }, [onFile])

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  return (
    <div
      className={`drop-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      <h3>{label}</h3>
      {file ? (
        <>
          <p className="file-name">{file.name}</p>
          {previewUrl && <video src={previewUrl} muted playsInline />}
        </>
      ) : (
        <p>Drag & drop a video here, or click to browse</p>
      )}
    </div>
  )
}

export default function UploadPage({ onResults }) {
  const [reference, setReference] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')

  const handleCompare = async () => {
    if (!reference || !attempt) return
    setLoading(true)
    setError('')
    setStatusMsg('Uploading videos...')

    try {
      const formData = new FormData()
      formData.append('reference', reference)
      formData.append('attempt', attempt)

      const res = await fetch(`${API_BASE}/compare`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Upload failed')
      const { job_id } = await res.json()

      // Poll for status
      while (true) {
        await new Promise((r) => setTimeout(r, 1000))
        const statusRes = await fetch(`${API_BASE}/status/${job_id}`)
        const status = await statusRes.json()

        if (status.status === 'complete') {
          setStatusMsg('Fetching results...')
          const resultsRes = await fetch(`${API_BASE}/results/${job_id}`)
          const results = await resultsRes.json()
          onResults(results, { reference, attempt })
          return
        } else if (status.status === 'error') {
          throw new Error(status.message || 'Processing failed')
        } else {
          setStatusMsg(status.message || 'Processing...')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="upload-page">
        <div className="progress-section">
          <h2>Analyzing your dance...</h2>
          <div className="progress-bar-container">
            <div className="progress-bar" />
          </div>
          <p className="progress-message">{statusMsg}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="upload-page">
      <div className="upload-zones">
        <DropZone label="Reference Video" file={reference} onFile={setReference} />
        <DropZone label="Your Attempt" file={attempt} onFile={setAttempt} />
      </div>

      <button
        className="compare-btn"
        disabled={!reference || !attempt}
        onClick={handleCompare}
      >
        Compare Dances
      </button>

      {error && <div className="error-message">{error}</div>}
    </div>
  )
}
