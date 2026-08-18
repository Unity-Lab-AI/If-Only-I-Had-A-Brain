#!/bin/bash
# band + drop watch — 15s cadence, ~60min, logs vitals + flags events
LOG=".bandwatch.log"
: > "$LOG"
PREV_SNAP=0
PREV_DONORS=-1
for i in $(seq 1 240); do
  TS=$(date -u +%H:%M:%S)
  OUT=$(curl -s --max-time 12 "https://if-only-i-had-a-brain.git.unityailab.com/public-state.json" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
try{const j=JSON.parse(d);const s=j.state||{};const c=s.curriculum||{};const l=c.liveness||{};
const cl=(((s.profiling||{}).clients||{}).list||[]).filter(x=>x.donorAppVersion&&x.donorAppVersion!=='browser');
const d0=cl[0]||{};
const ph=(c.phaseWork&&c.phaseWork.label)||c.activePhase||'';
console.log([j.snapshotAt,c.currentCellKey,String(ph).slice(0,30),l.teachCallsPerMin,cl.length,d0.rttMs||-1,((d0.bufferedAmount||0)/1048576).toFixed(1),(c.substratePause&&c.substratePause.active)?1:0].join('|'));
}catch(e){console.log('ERR|'+e.message.slice(0,60));}});" 2>/dev/null)
  echo "$TS $OUT" >> "$LOG"
  SNAP=$(echo "$OUT" | cut -d'|' -f1)
  DONORS=$(echo "$OUT" | cut -d'|' -f5)
  if [ "$SNAP" = "$PREV_SNAP" ] && [ -n "$SNAP" ] && [ "$SNAP" != "ERR" ]; then
    echo "$TS *** SNAPSHOT STALE — loop pin suspected ***" >> "$LOG"
  fi
  if [ "$PREV_DONORS" = "1" ] && [ "$DONORS" = "0" ]; then
    echo "$TS *** DONOR DROPPED ***" >> "$LOG"
  fi
  PREV_SNAP="$SNAP"
  PREV_DONORS="$DONORS"
  sleep 15
done
