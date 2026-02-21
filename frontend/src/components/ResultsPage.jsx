function ExtendedErrorList({ results, onSeek }) {
  if (!results || !Array.isArray(results.extended_moments) || results.extended_moments.length === 0) return null;
  return (
    <div style={{
      background: '#23233a',
      color: '#fff',
      borderRadius: 8,
      margin: '32px 0',
      padding: 18,
      boxShadow: '0 2px 8px #000a',
      maxWidth: 900,
      marginLeft: 'auto',
      marginRight: 'auto',
    }}>
      <h3 style={{marginTop:0, marginBottom:10}}>Extended Error List (score &lt; 70%)</h3>
      <ul style={{margin:'6px 0 0 16px', padding:0, maxHeight:'220px', overflowY:'auto'}}>
        {results.extended_moments.map((moment, idx) => {
          const timestamp = (typeof moment.ref_frame === 'number' && results.ref_fps)
            ? (moment.ref_frame / results.ref_fps)
            : null;
          return (
            <li key={idx} style={{marginBottom:2}}>
              <span
                style={{cursor:'pointer', color:'#f87171', textDecoration:'underline'}}
                onClick={() => onSeek && timestamp !== null && onSeek(timestamp)}
              >
                {moment.joint}
              </span>
              {` (score: ${moment.score}%, frame: ${moment.ref_frame}, time: ${timestamp !== null ? timestamp.toFixed(2) : 'N/A'}s)`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
import { useState } from 'react'
import ScoreDisplay from './ScoreDisplay'
import VideoPlayer from './VideoPlayer'
import TimelineHeatmap from './TimelineHeatmap'

function ScoreDebugPanel({ results }) {
  if (!results || !results.segment_scores) return null;
  const angleRaw = results.debug?.segment_angle_sims_raw || [];
  const angleScaled = results.debug?.segment_angle_sims_scaled || [];
  const posRaw = results.debug?.segment_pos_sims_raw || [];
  const posScaled = results.debug?.segment_pos_sims_scaled || [];
  const spineRaw = results.debug?.segment_spine_sims_raw || [];
  const spineScaled = results.debug?.segment_spine_sims_scaled || [];
  const motionRaw = results.debug?.segment_motion_sims_raw || [];
  const motionScaled = results.debug?.segment_motion_sims_scaled || [];
  // Debug table commented out
  // return (
  //   <div className="score-debug-panel" style={{
  //     background: '#181824',
  //     color: '#b4a0ff',
  //     borderRadius: 10,
  //     margin: '32px 0 0 0',
  //     padding: 24,
  //     boxShadow: '0 2px 16px #000a',
  //     maxWidth: 1100,
  //     marginLeft: 'auto',
  //     marginRight: 'auto',
  //   }}>
  //     <h3 style={{marginTop:0, marginBottom:12, color:'#fff'}}>Score Debug Breakdown</h3>
  //     <div style={{fontSize:'1.05em', marginBottom:12}}>
  //       <strong>Overall Score:</strong> {results.overall_score} 
  //       <span style={{marginLeft:16, color:'#93c5fd'}}>Angle: 40%</span>
  //       <span style={{marginLeft:8, color:'#fbbf24'}}>Position: 25%</span>
  //       <span style={{marginLeft:8, color:'#a78bfa'}}>Spine: 20%</span>
  //       <span style={{marginLeft:8, color:'#34d399'}}>Motion: 15%</span>
  //     </div>
  //     <div style={{overflowX:'auto'}}>
  //       <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85em'}}>
  //         <thead>
  //           <tr style={{background:'#23233a', color:'#b4a0ff'}}>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a'}}>Seg</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a'}}>Time</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a'}}>Score</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#2a2a4a'}}>Ang R</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#2a2a4a'}}>Ang S</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#2a3a2a'}}>Pos MSE</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#2a3a2a'}}>Pos S</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#2a2a3a'}}>Spine R</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#2a2a3a'}}>Spine S</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#1f3a2a'}}>Mot R</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a', backgroundColor: '#1f3a2a'}}>Mot S</th>
  //             <th style={{padding:'5px 6px', border:'1px solid #23233a'}}>Problems</th>
  //           </tr>
  //         </thead>
  //         <tbody>
  //           {results.segment_scores.map((seg, i) => (
  //             <tr key={i} style={{background: i%2 ? '#15151e' : '#23233a'}}>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center'}}>{i+1}</td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', fontSize:'0.8em'}}>
  //                 {seg.start_time.toFixed(1)}-{seg.end_time.toFixed(1)}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', fontWeight:'bold'}}>{seg.score}</td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#93c5fd', backgroundColor: '#1a1a2a'}}>
  //                 {angleRaw[i] !== undefined ? (angleRaw[i]*100).toFixed(1) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#93c5fd', backgroundColor: '#1a1a2a'}}>
  //                 {angleScaled[i] !== undefined ? (angleScaled[i]*100).toFixed(1) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#fbbf24', backgroundColor: '#1a1a1a'}}>
  //                 {posRaw[i] !== undefined ? posRaw[i].toFixed(3) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#fbbf24', backgroundColor: '#1a1a1a'}}>
  //                 {posScaled[i] !== undefined ? (posScaled[i]*100).toFixed(1) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#a78bfa', backgroundColor: '#1a1a1f'}}>
  //                 {spineRaw[i] !== undefined ? (spineRaw[i]*100).toFixed(1) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#a78bfa', backgroundColor: '#1a1a1f'}}>
  //                 {spineScaled[i] !== undefined ? (spineScaled[i]*100).toFixed(1) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#34d399', backgroundColor: '#1a1f1a'}}>
  //                 {motionRaw[i] !== undefined ? (motionRaw[i]*100).toFixed(1) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', textAlign:'center', color:'#34d399', backgroundColor: '#1a1f1a'}}>
  //                 {motionScaled[i] !== undefined ? (motionScaled[i]*100).toFixed(1) : '-'}
  //               </td>
  //               <td style={{padding:'5px 6px', border:'1px solid #23233a', color:'#f87171', fontSize:'0.8em'}}>
  //                 {seg.problem_joints && seg.problem_joints.length > 0 ? seg.problem_joints.join(', ') : <span style={{color:'#4ade80'}}>None</span>}
  //               </td>
  //             </tr>
  //           ))}
  //         </tbody>
  //       </table>
  //     </div>
  //     <div style={{marginTop:18, color:'#aaa', fontSize:'0.9em'}}>
  //       <strong>Columns:</strong> R=Raw, S=Scaled. <strong>Ang</strong>=Joint angles, <strong>Pos</strong>=Spatial position, <strong>Spine</strong>=Body orientation to gravity (0\u00b0=upright, 90\u00b0=horizontal), <strong>Mot</strong>=Movement magnitude.
  //     </div>
  //   </div>
  // );
  return null;
}

function FeedbackPanel({ results, onSeek }) {
  if (!results || !results.segment_scores) return null;
  return (
    <div style={{
      background: '#23233a',
      color: '#fff',
      borderRadius: 8,
      margin: '32px 0',
      padding: 18,
      boxShadow: '0 2px 8px #000a',
      maxWidth: 700,
      marginLeft: 'auto',
      marginRight: 'auto',
    }}>
      <h3 style={{marginTop:0, marginBottom:10}}>Feedback: Most Offset Joints</h3>
      {/* Worst 5 moments globally */}
      {Array.isArray(results.worst_moments) && results.worst_moments.length > 0 && (
        <div style={{marginBottom:18}}>
          <strong>Worst 5 Moments (Global):</strong>
          <ul style={{margin:'6px 0 0 16px', padding:0}}>
            {results.worst_moments.map((moment, idx) => {
              const timestamp = (typeof moment.ref_frame === 'number' && results.ref_fps)
                ? (moment.ref_frame / results.ref_fps)
                : null;
              return (
                <li key={idx} style={{marginBottom:2}}>
                  <span
                    style={{cursor:'pointer', color:'#f87171', textDecoration:'underline'}}
                    onClick={() => onSeek && timestamp !== null && onSeek(timestamp)}
                  >
                    {moment.joint}
                  </span>
                  {` (score: ${moment.score}%, frame: ${moment.ref_frame}, time: ${timestamp !== null ? timestamp.toFixed(2) : 'N/A'}s)`}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Segment-by-segment info removed; only global worst moments shown */}
    </div>
  );
}

export default function ResultsPage({ results, videos, onReset }) {
  const [seekTime, setSeekTime] = useState(null)

  return (
    <div className="results-page">
      <div className="results-top-bar">
        <button className="back-btn" onClick={onReset}>
          &larr; New Comparison
        </button>
      </div>

      <ScoreDisplay score={results.overall_score} />

      <div style={{display:'flex', gap:'32px', alignItems:'flex-start', justifyContent:'center', marginTop:'24px', marginBottom:'24px'}}>
        <VideoPlayer results={results} videos={videos} seekTime={seekTime} />
        <FeedbackPanel results={results} onSeek={setSeekTime} />
      </div>

      <TimelineHeatmap
        segments={results.segment_scores}
        onSeek={(t) => setSeekTime(t)}
      />

      <ScoreDebugPanel results={results} />

      <ExtendedErrorList results={results} onSeek={setSeekTime} />
    </div>
  )
}
