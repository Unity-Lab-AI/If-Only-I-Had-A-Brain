const B='/run/media/sponge/External/DataHorde/Development2/UnityAILab/Brain/js/brain/sparse-matrix.js';
const { SparseMatrix } = await import(B);
const rows=20000, cols=20000, density=300/cols;
const M=new SparseMatrix(rows,cols); M.initRandom(density,0.8,0.3);

// TRUE f64 reference: re-draw values at full precision, THEN round a copy to f32.
// (The previous probe widened an already-f32 array and measured exactly zero —
//  a tautology, not a result.)
const f64=new Float64Array(M.nnz);
for(let i=0;i<M.nnz;i++) f64[i]=(Math.random()*2-1)*0.3;   // same scale as strength
const f32=new Float32Array(f64);                            // the lossy step

const spikes=new Float64Array(cols);
for(let i=0;i<cols;i++) spikes[i]=Math.random()<0.05?1:0;
const prop=(v)=>{const I=new Float64Array(rows);
  for(let i=0;i<rows;i++){let s=0;for(let k=M.rowPtr[i];k<M.rowPtr[i+1];k++)s+=v[k]*spikes[M.colIdx[k]];I[i]=s;}return I;};
const a=prop(f32), b=prop(f64);

let maxRel=0,sumSq=0,magSum=0,magSq=0;
for(let i=0;i<rows;i++){const d=Math.abs(a[i]-b[i]),m=Math.abs(b[i]);
  if(m>1e-9)maxRel=Math.max(maxRel,d/m); sumSq+=d*d; magSum+=m; magSq+=b[i]*b[i];}
const rms=Math.sqrt(sumSq/rows), sig=Math.sqrt(magSq/rows);
console.log('nnz               =',M.nnz.toLocaleString(),' fanout ~300');
console.log('RMS signal        =',sig.toExponential(4));
console.log('RMS deviation     =',rms.toExponential(4));
console.log('rel RMS error     =',(rms/sig).toExponential(4));
console.log('max rel error     =',maxRel.toExponential(4));
console.log('SNR (dB)          =',(20*Math.log10(sig/rms)).toFixed(1));
let flips=0; for(let i=0;i<rows;i++) if((a[i]>=sig)!==(b[i]>=sig)) flips++;
console.log('threshold flips   =',flips,'/',rows,'=',(100*flips/rows).toFixed(4)+'%');

// Is the max-rel outlier just a near-zero-current row (cancellation), or structural?
let wi=-1,wr=0;
for(let i=0;i<rows;i++){const d=Math.abs(a[i]-b[i]),m=Math.abs(b[i]);if(m>1e-9&&d/m>wr){wr=d/m;wi=i;}}
console.log('\nworst row', wi, ' |current| =', Math.abs(b[wi]).toExponential(3),
            ' vs RMS signal', sig.toExponential(3),
            ' ratio', (Math.abs(b[wi])/sig).toExponential(2));
console.log('worst-row ABS dev =', Math.abs(a[wi]-b[wi]).toExponential(3));
// distribution of rel error restricted to rows carrying real signal
let big=0,cnt=0,mx=0;
for(let i=0;i<rows;i++){const m=Math.abs(b[i]); if(m>0.1*sig){cnt++;const r=Math.abs(a[i]-b[i])/m; mx=Math.max(mx,r); if(r>1e-6)big++;}}
console.log('rows >10% of RMS  =',cnt,' max rel err among them =',mx.toExponential(3),' (#>1e-6:',big+')');
