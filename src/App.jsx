// ============================================================
//  Advanced Scientific Calculator — PDA v4.0
//  Firebase Realtime Database History Integration Added
// ============================================================
import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, query, orderByChild, limitToLast, remove } from "firebase/database";
import "./App.css";

// ── 🔥 FIREBASE CONFIG — Apna config yahan paste karein ──────
// Firebase Console → Project Settings → Your Apps → SDK setup
const firebaseConfig = {
  apiKey: "AIzaSyCfPWd1y9whhnmeaC8x6S7YFAzesIMg5dY",
  authDomain: "scitifcalc.firebaseapp.com",
  databaseURL: "https://scitifcalc-default-rtdb.firebaseio.com",  // ← YEH ADD KARO
  projectId: "scitifcalc",
  storageBucket: "scitifcalc.firebasestorage.app",
  messagingSenderId: "1099350031574",
  appId: "1:1099350031574:web:ce4708f76bc776f72b5d77",
  measurementId: "G-2LM251RT43"
};

// Firebase initialize
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const HISTORY_REF = "calc_history"; // Database mein path

const FUNCTIONS = ["sin","cos","tan","asin","acos","atan","log","ln","sqrt","abs","ceil","floor"];
const OPERATORS = ["+","-","*","/","^","%"];
const THEMES = ["dark","light","neon","retro"];

// ── Audio ──────────────────────────────────────────────────
let audioCtx = null;
function getACtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq=440,type="sine",dur=0.08,vol=0.15) {
  try {
    const ctx=getACtx(), osc=ctx.createOscillator(), g=ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type=type; osc.frequency.setValueAtTime(freq,ctx.currentTime);
    g.gain.setValueAtTime(vol,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+dur);
  } catch{}
}
const playClick=()=>playTone(600,"triangle",0.06,0.1);
const playOp=()=>playTone(800,"sine",0.08,0.12);
const playEqual=()=>{playTone(1000,"sine",0.15,0.18);setTimeout(()=>playTone(1260,"sine",0.12,0.15),80);};
const playError=()=>playTone(200,"sawtooth",0.2,0.2);

// ── Tokenizer ──────────────────────────────────────────────
function tokenize(raw) {
  const tokens=[]; let i=0;
  while(i<raw.length) {
    if(/\s/.test(raw[i])){i++;continue;}
    let fm=false;
    for(const fn of FUNCTIONS){if(raw.startsWith(fn,i)){tokens.push(fn);i+=fn.length;fm=true;break;}}
    if(fm) continue;
    if(/[0-9.]/.test(raw[i])){let n="";while(i<raw.length&&/[0-9.]/.test(raw[i]))n+=raw[i++];tokens.push(n);continue;}
    tokens.push(raw[i++]);
  }
  return tokens;
}

function prec(op){if(["+","-"].includes(op))return 1;if(["*","/","%"].includes(op))return 2;if(op==="^")return 3;if(FUNCTIONS.includes(op))return 4;return 0;}
function isRA(op){return op==="^"||FUNCTIONS.includes(op);}

export function infixToPostfix(tokens) {
  const out=[],stk=[];
  for(const t of tokens){
    if(!isNaN(parseFloat(t))){out.push(parseFloat(t));}
    else if(FUNCTIONS.includes(t)){stk.push(t);}
    else if(t==="("){stk.push(t);}
    else if(t===")"){
      while(stk.length&&stk[stk.length-1]!=="(")out.push(stk.pop());
      if(!stk.length)throw new Error("Unbalanced parentheses");
      stk.pop();
      if(FUNCTIONS.includes(stk[stk.length-1]))out.push(stk.pop());
    } else if(OPERATORS.includes(t)){
      while(stk.length&&OPERATORS.includes(stk[stk.length-1])&&
        ((!isRA(t)&&prec(stk[stk.length-1])>=prec(t))||(isRA(t)&&prec(stk[stk.length-1])>prec(t))))
        out.push(stk.pop());
      stk.push(t);
    }
  }
  while(stk.length){const top=stk.pop();if(top==="("||top===")")throw new Error("Unbalanced parentheses");out.push(top);}
  return out;
}

function buildTree(tokens) {
  const out=[],stk=[];
  const popOp=()=>{
    const op=stk.pop();
    if(FUNCTIONS.includes(op)){const a=out.pop();out.push({type:"fn",val:op,left:a,right:null});}
    else{const b=out.pop(),a=out.pop();if(a&&b)out.push({type:"op",val:op,left:a,right:b});}
  };
  for(const t of tokens){
    if(!isNaN(parseFloat(t))){out.push({type:"num",val:t,left:null,right:null});}
    else if(FUNCTIONS.includes(t)){stk.push(t);}
    else if(t==="("){stk.push(t);}
    else if(t===")"){
      while(stk.length&&stk[stk.length-1]!=="(")popOp();
      if(stk.length)stk.pop();
      if(FUNCTIONS.includes(stk[stk.length-1]))popOp();
    } else if(OPERATORS.includes(t)){
      while(stk.length&&OPERATORS.includes(stk[stk.length-1])&&
        ((!isRA(t)&&prec(stk[stk.length-1])>=prec(t))||(isRA(t)&&prec(stk[stk.length-1])>prec(t))))popOp();
      stk.push(t);
    }
  }
  while(stk.length)popOp();
  return out[0]||null;
}

export function evaluatePostfix(pf,isDeg,vars={}) {
  const stk=[];
  const rad=v=>isDeg?v*Math.PI/180:v;
  for(const t of pf){
    if(typeof t==="number"){stk.push(t);}
    else if(typeof t==="string"&&vars[t]!==undefined){stk.push(vars[t]);}
    else if(FUNCTIONS.includes(t)){
      const a=stk.pop();
      if(t==="sin")stk.push(Math.sin(rad(a)));
      else if(t==="cos")stk.push(Math.cos(rad(a)));
      else if(t==="tan")stk.push(Math.tan(rad(a)));
      else if(t==="asin")stk.push(isDeg?Math.asin(a)*180/Math.PI:Math.asin(a));
      else if(t==="acos")stk.push(isDeg?Math.acos(a)*180/Math.PI:Math.acos(a));
      else if(t==="atan")stk.push(isDeg?Math.atan(a)*180/Math.PI:Math.atan(a));
      else if(t==="log"){if(a<=0)throw new Error("log(x): x must be > 0");stk.push(Math.log10(a));}
      else if(t==="ln"){if(a<=0)throw new Error("ln(x): x must be > 0");stk.push(Math.log(a));}
      else if(t==="sqrt"){if(a<0)throw new Error("sqrt: negative number");stk.push(Math.sqrt(a));}
      else if(t==="abs")stk.push(Math.abs(a));
      else if(t==="ceil")stk.push(Math.ceil(a));
      else if(t==="floor")stk.push(Math.floor(a));
      else throw new Error("Unknown function: "+t);
    } else if(OPERATORS.includes(t)){
      const b=stk.pop(),a=stk.pop();
      if(t==="+")stk.push(a+b);
      else if(t==="-")stk.push(a-b);
      else if(t==="*")stk.push(a*b);
      else if(t==="/"){if(b===0)throw new Error("Division by zero");stk.push(a/b);}
      else if(t==="^")stk.push(Math.pow(a,b));
      else if(t==="%")stk.push(a%b);
    }
  }
  if(stk.length!==1)throw new Error("Invalid expression");
  return stk[0];
}

function fmtNum(n){
  if(!isFinite(n))throw new Error("Result not finite");
  if(Math.abs(n)>1e12||(Math.abs(n)<1e-7&&n!==0))return n.toExponential(6);
  return parseFloat(n.toFixed(10)).toString();
}

function calculate(expr,isDeg,vars={}){
  let raw=expr
    .replace(/π/g,"3.14159265358979")
    .replace(/τ/g,"6.28318530717959")
    .replace(/φ/g,"1.61803398874989")
    .replace(/e(?![a-z])/g,"2.71828182845905")
    .replace(/×/g,"*").replace(/÷/g,"/").replace(/−/g,"-");
  Object.entries(vars).forEach(([k,v])=>{
    raw=raw.replace(new RegExp(`\\b${k}\\b`,"g"),`(${v})`);
  });
  return fmtNum(evaluatePostfix(infixToPostfix(tokenize(raw)),isDeg,vars));
}

// ── Complex Numbers ────────────────────────────────────────
function parseComplex(s){
  s=s.trim().replace(/\s/g,"");
  if(!s.includes("i")){const n=parseFloat(s);if(!isNaN(n))return{re:n,im:0};throw new Error("Invalid");}
  if(/^[+-]?i$/.test(s))return{re:0,im:s==="-i"?-1:1};
  if(/^[+-]?\d*\.?\d+i$/.test(s)){const m=s.match(/^([+-]?\d*\.?\d+)i$/);return{re:0,im:parseFloat(m[1])};}
  const m=s.match(/^([+-]?\d*\.?\d+)([+-]\d*\.?\d*i)$/);
  if(!m)throw new Error("Format: 3+4i or -2i");
  const re=parseFloat(m[1]);
  const imPart=m[2].replace("i","");
  const im=imPart==="+"?1:imPart==="-"?-1:parseFloat(imPart);
  return{re,im};
}
function complexOp(a,b,op){
  if(op==="+")return{re:a.re+b.re,im:a.im+b.im};
  if(op==="-")return{re:a.re-b.re,im:a.im-b.im};
  if(op==="*")return{re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re};
  if(op==="/"){const d=b.re*b.re+b.im*b.im;if(!d)throw new Error("Division by zero");return{re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};}
  throw new Error("Unsupported op");
}
function fmtCx(c){
  const re=parseFloat(c.re.toFixed(6)),im=parseFloat(c.im.toFixed(6));
  if(im===0)return`${re}`;if(re===0)return`${im}i`;
  return`${re} ${im>=0?"+":"-"} ${Math.abs(im)}i`;
}

// ── Matrix ─────────────────────────────────────────────────
function parseMat(s){
  const rows=s.trim().split(";").map(r=>r.trim().split(",").map(Number));
  if(rows.some(r=>r.some(isNaN)))throw new Error("Invalid matrix values");
  const c=rows[0].length;if(rows.some(r=>r.length!==c))throw new Error("Unequal row lengths");
  return rows;
}
function matAdd(A,B){
  if(A.length!==B.length||A[0].length!==B[0].length)throw new Error("Size mismatch");
  return A.map((r,i)=>r.map((v,j)=>v+B[i][j]));
}
function matMul(A,B){
  if(A[0].length!==B.length)throw new Error("Incompatible dimensions");
  return A.map(r=>B[0].map((_,j)=>r.reduce((s,v,k)=>s+v*B[k][j],0)));
}
function matDet(M){
  const n=M.length;
  if(M.some(r=>r.length!==n))throw new Error("Must be square");
  if(n===1)return M[0][0];if(n===2)return M[0][0]*M[1][1]-M[0][1]*M[1][0];
  return M[0].reduce((s,v,j)=>s+v*(j%2===0?1:-1)*matDet(M.slice(1).map(r=>r.filter((_,c)=>c!==j))),0);
}
function matTrans(M){return M[0].map((_,j)=>M.map(r=>r[j]));}
function fmtMat(M){return M.map(r=>"[ "+r.map(v=>parseFloat(v.toFixed(4)).toString().padStart(9)).join("  ")+" ]").join("\n");}

// ── Unit Converter ─────────────────────────────────────────
const UCATS={
  Length:{units:["km","m","cm","mm","mi","ft","in","yd"],b:{km:1000,m:1,cm:0.01,mm:0.001,mi:1609.344,ft:0.3048,in:0.0254,yd:0.9144}},
  Temp:{units:["°C","°F","K"],b:null},
  Weight:{units:["kg","g","mg","lb","oz"],b:{kg:1,g:0.001,mg:0.000001,lb:0.453592,oz:0.028349}},
  Area:{units:["m²","km²","cm²","ft²","acre"],b:{"m²":1,"km²":1e6,"cm²":0.0001,"ft²":0.092903,"acre":4046.86}},
  Speed:{units:["m/s","km/h","mph","knot"],b:{"m/s":1,"km/h":0.277778,"mph":0.44704,"knot":0.514444}},
  Data:{units:["B","KB","MB","GB","TB"],b:{B:1,KB:1024,MB:1048576,GB:1073741824,TB:1099511627776}},
};
function convUnit(val,from,to,cat){
  if(cat==="Temp"){
    let c=from==="°C"?val:from==="°F"?(val-32)*5/9:val-273.15;
    return to==="°C"?c:to==="°F"?c*9/5+32:c+273.15;
  }
  return val*UCATS[cat].b[from]/UCATS[cat].b[to];
}

// ── Graph eval ─────────────────────────────────────────────
function evalGraph(expr,x){
  let raw=expr.replace(/π/g,"3.14159265358979").replace(/e(?![a-z])/g,"2.71828182845905")
    .replace(/\bx\b/g,`(${x})`).replace(/×/g,"*").replace(/÷/g,"/").replace(/−/g,"-");
  try{return evaluatePostfix(infixToPostfix(tokenize(raw)),false);}catch{return NaN;}
}

// ── Statistics ─────────────────────────────────────────────
function parseDataset(s){
  const nums=s.split(/[,\s]+/).map(Number).filter(n=>!isNaN(n));
  if(nums.length===0)throw new Error("Enter numbers separated by commas");
  return nums;
}
function statMean(d){return d.reduce((a,b)=>a+b,0)/d.length;}
function statMedian(d){const s=[...d].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function statMode(d){
  const freq={};d.forEach(n=>{freq[n]=(freq[n]||0)+1;});
  const max=Math.max(...Object.values(freq));
  const modes=Object.keys(freq).filter(k=>freq[k]===max).map(Number);
  return modes.length===d.length?"No mode":modes.join(", ");
}
function statStdDev(d,pop=false){
  const m=statMean(d);
  return Math.sqrt(d.reduce((s,n)=>s+(n-m)**2,0)/(pop?d.length:d.length-1));
}
function statVariance(d,pop=false){const m=statMean(d);return d.reduce((s,n)=>s+(n-m)**2,0)/(pop?d.length:d.length-1);}
function statRange(d){return Math.max(...d)-Math.min(...d);}
function statQ1(d){const s=[...d].sort((a,b)=>a-b);return statMedian(s.slice(0,Math.floor(s.length/2)));}
function statQ3(d){const s=[...d].sort((a,b)=>a-b);const h=Math.ceil(s.length/2);return statMedian(s.slice(h));}

// ── Equation Solver ────────────────────────────────────────
function solveQuadratic(a,b,c){
  const disc=b*b-4*a*c;
  if(a===0){
    if(b===0)return c===0?"Infinite solutions":"No solution";
    return[`x = ${fmtNum(-c/b)}`];
  }
  if(disc<0){
    const re=fmtNum(-b/(2*a));
    const im=fmtNum(Math.sqrt(-disc)/(2*a));
    return[`x₁ = ${re} + ${im}i`,`x₂ = ${re} - ${im}i`];
  }
  const x1=(-b+Math.sqrt(disc))/(2*a);
  const x2=(-b-Math.sqrt(disc))/(2*a);
  return disc===0?[`x = ${fmtNum(x1)}`]:[`x₁ = ${fmtNum(x1)}`,`x₂ = ${fmtNum(x2)}`];
}

function solveNewton(exprStr,initial=0){
  let x=initial;
  const h=1e-7;
  for(let i=0;i<100;i++){
    const evalX=(val)=>{
      let raw=exprStr.replace(/\bx\b/g,`(${val})`).replace(/π/g,"3.14159265358979").replace(/e(?![a-z])/g,"2.71828182845905");
      return evaluatePostfix(infixToPostfix(tokenize(raw)),false);
    };
    const fx=evalX(x);
    const dfx=(evalX(x+h)-evalX(x-h))/(2*h);
    if(Math.abs(dfx)<1e-14)break;
    const xn=x-fx/dfx;
    if(Math.abs(xn-x)<1e-10){x=xn;break;}
    x=xn;
  }
  return parseFloat(x.toFixed(10));
}

// ── Number Base Converter ──────────────────────────────────
function convertBase(val,fromBase,toBase){
  const n=parseInt(val,fromBase);
  if(isNaN(n))throw new Error("Invalid number for base "+fromBase);
  return n.toString(toBase).toUpperCase();
}

// ── Calculus ───────────────────────────────────────────────
function derivative(exprStr,x,isDeg=false){
  const h=1e-7;
  const evalAt=(v)=>{
    let raw=exprStr.replace(/\bx\b/g,`(${v})`).replace(/π/g,"3.14159265358979").replace(/e(?![a-z])/g,"2.71828182845905");
    return evaluatePostfix(infixToPostfix(tokenize(raw)),isDeg);
  };
  return (evalAt(x+h)-evalAt(x-h))/(2*h);
}

function integral(exprStr,a,b,n=1000){
  if(n%2!==0)n++;
  const h=(b-a)/n;
  const evalAt=(v)=>{
    let raw=exprStr.replace(/\bx\b/g,`(${v})`).replace(/π/g,"3.14159265358979").replace(/e(?![a-z])/g,"2.71828182845905");
    return evaluatePostfix(infixToPostfix(tokenize(raw)),false);
  };
  let sum=evalAt(a)+evalAt(b);
  for(let i=1;i<n;i++){
    sum+=(i%2===0?2:4)*evalAt(a+i*h);
  }
  return (h/3)*sum;
}

// ── Currency ───────────────────────────────────────────────
const CURRENCIES={USD:1,EUR:0.92,GBP:0.79,JPY:149.5,INR:83.1,CAD:1.36,AUD:1.53,CNY:7.24,CHF:0.89,SGD:1.34,AED:3.67,MXN:17.2};

// ── Constants ──────────────────────────────────────────────
const CONSTANTS=[
  {name:"π (Pi)",sym:"π",val:"3.14159265358979",cat:"Math"},
  {name:"τ (Tau)",sym:"τ",val:"6.28318530717959",cat:"Math"},
  {name:"φ (Golden Ratio)",sym:"φ",val:"1.61803398874989",cat:"Math"},
  {name:"e (Euler)",sym:"e",val:"2.71828182845905",cat:"Math"},
  {name:"√2",sym:"√2",val:"1.41421356237310",cat:"Math"},
  {name:"c (Speed of Light m/s)",sym:"c",val:"299792458",cat:"Physics"},
  {name:"g (Gravity m/s²)",sym:"g",val:"9.80665",cat:"Physics"},
  {name:"h (Planck J·s)",sym:"h",val:"6.62607015e-34",cat:"Physics"},
  {name:"kB (Boltzmann J/K)",sym:"kB",val:"1.380649e-23",cat:"Physics"},
  {name:"NA (Avogadro /mol)",sym:"NA",val:"6.02214076e23",cat:"Physics"},
  {name:"R (Gas Const J/mol·K)",sym:"R",val:"8.314462618",cat:"Physics"},
  {name:"e (Electron charge C)",sym:"qe",val:"1.602176634e-19",cat:"Physics"},
  {name:"me (Electron mass kg)",sym:"me",val:"9.1093837015e-31",cat:"Physics"},
  {name:"G (Gravitational m³/kg·s²)",sym:"G",val:"6.674e-11",cat:"Physics"},
  {name:"ε₀ (Permittivity F/m)",sym:"eps0",val:"8.8541878e-12",cat:"Physics"},
];

// ── Keyboard Shortcuts ─────────────────────────────────────
const SHORTCUTS=[
  {key:"0-9",desc:"Enter digits"},
  {key:"+ - * /",desc:"Operators"},
  {key:"Enter / =",desc:"Calculate"},
  {key:"Backspace",desc:"Delete last"},
  {key:"Escape",desc:"Clear all"},
  {key:"^ ",desc:"Power (xʸ)"},
  {key:"% ",desc:"Modulo"},
  {key:"( )",desc:"Parentheses"},
  {key:"Ctrl+H",desc:"Toggle history"},
  {key:"Ctrl+T",desc:"Toggle tree"},
  {key:"Ctrl+S",desc:"Toggle sound"},
  {key:"Ctrl+M",desc:"Cycle theme"},
];

// ── Tree Node ──────────────────────────────────────────────
function TreeNode({node}){
  if(!node)return null;
  const color=node.type==="op"?"var(--blue)":node.type==="fn"?"var(--purple)":"var(--teal)";
  return(
    <div className="tree-node">
      <span className="tree-val" style={{color}}>{node.val}</span>
      {(node.left||node.right)&&(
        <div className="tree-children">
          {node.left&&<TreeNode node={node.left}/>}
          {node.right&&<TreeNode node={node.right}/>}
        </div>
      )}
    </div>
  );
}

// ── Graph Panel ────────────────────────────────────────────
function GraphPanel({theme}){
  const ref=useRef(null);
  const[fn1,setFn1]=useState("sin(x)");
  const[fn2,setFn2]=useState("cos(x)");
  const[xMin,setXMin]=useState(-10);
  const[xMax,setXMax]=useState(10);

  const draw=useCallback(()=>{
    const cv=ref.current;if(!cv)return;
    const c=cv.getContext("2d"),W=cv.width,H=cv.height,dark=theme!=="light";
    c.fillStyle=dark?"#060609":"#f0f0f6";c.fillRect(0,0,W,H);
    const xR=xMax-xMin,step=Math.pow(10,Math.floor(Math.log10(xR/5)));
    c.strokeStyle=dark?"#1a1a2e":"#dde4f0";c.lineWidth=1;
    for(let x=Math.ceil(xMin/step)*step;x<=xMax;x+=step){const px=((x-xMin)/xR)*W;c.beginPath();c.moveTo(px,0);c.lineTo(px,H);c.stroke();}
    c.strokeStyle=dark?"#334455":"#aabbcc";c.lineWidth=1.5;
    const zx=((0-xMin)/xR)*W,zy=H/2;
    c.beginPath();c.moveTo(zx,0);c.lineTo(zx,H);c.stroke();
    c.beginPath();c.moveTo(0,zy);c.lineTo(W,zy);c.stroke();
    c.fillStyle=dark?"#557799":"#667788";c.font="9px 'JetBrains Mono',monospace";c.textAlign="center";
    for(let x=Math.ceil(xMin/step)*step;x<=xMax;x+=step){if(Math.abs(x)<1e-10)continue;const px=((x-xMin)/xR)*W;c.fillText(parseFloat(x.toFixed(3)),px,zy+13);}
    const colors=theme==="neon"?["#00ff88","#ff00ff"]:theme==="retro"?["#ff6b35","#ffd700"]:theme==="light"?["#0066cc","#aa33ff"]:["#4fc3f7","#b388ff"];
    [fn1,fn2].forEach((fn,fi)=>{
      if(!fn.trim())return;
      c.strokeStyle=colors[fi];c.lineWidth=2;c.beginPath();let first=true;
      for(let px=0;px<W;px++){
        const x=xMin+(px/W)*xR,y=evalGraph(fn,x);
        if(!isFinite(y)||Math.abs(y)>50){first=true;continue;}
        const py=zy-(y/10)*(H/2);
        if(first){c.moveTo(px,py);first=false;}else c.lineTo(px,py);
      }
      c.stroke();
      c.fillStyle=colors[fi];c.font="10px 'JetBrains Mono',monospace";c.textAlign="left";
      c.fillText((fi===0?"f":"g")+"(x)="+fn,8,14+fi*16);
    });
  },[fn1,fn2,xMin,xMax,theme]);

  useEffect(()=>{draw();},[draw]);

  return(
    <div className="graph-panel">
      <div className="graph-inputs">
        <div className="graph-row"><span className="graph-label" style={{color:"var(--teal)"}}>f(x) =</span><input className="graph-input" value={fn1} onChange={e=>setFn1(e.target.value)} placeholder="sin(x)"/></div>
        <div className="graph-row"><span className="graph-label" style={{color:"var(--purple)"}}>g(x) =</span><input className="graph-input" value={fn2} onChange={e=>setFn2(e.target.value)} placeholder="cos(x)"/></div>
        <div className="graph-row">
          <span className="graph-label">x:</span>
          <input className="graph-input small" type="number" value={xMin} onChange={e=>setXMin(+e.target.value)}/>
          <span className="graph-label">→</span>
          <input className="graph-input small" type="number" value={xMax} onChange={e=>setXMax(+e.target.value)}/>
          <button className="graph-btn" onClick={draw}>Plot ▶</button>
        </div>
      </div>
      <canvas ref={ref} className="graph-canvas" width={340} height={220}/>
      <div className="graph-hint">Use x as variable — e.g. x^2, sin(x)*x</div>
    </div>
  );
}

// ── Matrix Panel ───────────────────────────────────────────
function MatrixPanel(){
  const[matA,setMatA]=useState("1,2;3,4");
  const[matB,setMatB]=useState("5,6;7,8");
  const[op,setOp]=useState("add");
  const[result,setResult]=useState("");
  const[err,setErr]=useState("");

  const compute=()=>{
    try{
      setErr("");
      const A=parseMat(matA);
      let res;
      if(op==="det")res="det(A) = "+parseFloat(matDet(A).toFixed(8));
      else if(op==="trans")res=fmtMat(matTrans(A));
      else{const B=parseMat(matB);res=fmtMat(op==="add"?matAdd(A,B):matMul(A,B));}
      setResult(res);
    }catch(e){setErr(e.message);setResult("");}
  };

  return(
    <div className="matrix-panel">
      <div className="mat-label">Matrix A <span className="mat-hint">(rows=";", cols=",")</span></div>
      <textarea className="mat-input" value={matA} onChange={e=>setMatA(e.target.value)} rows={2} placeholder="1,2;3,4"/>
      {(op==="add"||op==="mul")&&<>
        <div className="mat-label">Matrix B</div>
        <textarea className="mat-input" value={matB} onChange={e=>setMatB(e.target.value)} rows={2} placeholder="5,6;7,8"/>
      </>}
      <div className="mat-ops">
        {[["add","A + B"],["mul","A × B"],["det","det(A)"],["trans","Aᵀ"]].map(([v,l])=>(
          <button key={v} className={`mat-op-btn${op===v?" active":""}`} onClick={()=>setOp(v)}>{l}</button>
        ))}
      </div>
      <button className="mat-compute" onClick={compute}>Compute</button>
      {err&&<div className="mat-error">{err}</div>}
      {result&&<pre className="mat-result">{result}</pre>}
    </div>
  );
}

// ── Unit Panel ─────────────────────────────────────────────
function UnitPanel(){
  const[cat,setCat]=useState("Length");
  const[val,setVal]=useState("1");
  const[from,setFrom]=useState("km");
  const[to,setTo]=useState("mi");

  const units=UCATS[cat].units;
  const result=(()=>{try{const v=parseFloat(val);if(isNaN(v))return"—";return parseFloat(convUnit(v,from,to,cat).toFixed(8)).toString();}catch{return"Error";}})();
  const handleCat=c=>{setCat(c);const u=UCATS[c].units;setFrom(u[0]);setTo(u[1]);};

  return(
    <div className="unit-panel">
      <div className="unit-cats">
        {Object.keys(UCATS).map(c=>(
          <button key={c} className={`unit-cat-btn${cat===c?" active":""}`} onClick={()=>handleCat(c)}>{c}</button>
        ))}
      </div>
      <div className="unit-conv-box">
        <div className="unit-row">
          <input className="unit-input" type="number" value={val} onChange={e=>setVal(e.target.value)}/>
          <select className="unit-select" value={from} onChange={e=>setFrom(e.target.value)}>
            {units.map(u=><option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="unit-arrow">⬇</div>
        <div className="unit-row">
          <div className="unit-result">{result}</div>
          <select className="unit-select" value={to} onChange={e=>setTo(e.target.value)}>
            {units.map(u=><option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Complex Panel ──────────────────────────────────────────
function ComplexPanel(){
  const[a,setA]=useState("3+4i");
  const[b,setB]=useState("1-2i");
  const[op,setOp]=useState("+");
  const[result,setResult]=useState("");
  const[err,setErr]=useState("");

  const compute=()=>{
    try{
      setErr("");
      const ca=parseComplex(a),cb=parseComplex(b);
      const res=complexOp(ca,cb,op);
      const mag=Math.sqrt(res.re**2+res.im**2);
      const ang=Math.atan2(res.im,res.re)*180/Math.PI;
      setResult(`Result:    ${fmtCx(res)}\nMagnitude: |z| = ${parseFloat(mag.toFixed(6))}\nAngle:     ∠ = ${parseFloat(ang.toFixed(4))}°\nConjugate: ${fmtCx({re:res.re,im:-res.im})}`);
    }catch(e){setErr(e.message);setResult("");}
  };

  return(
    <div className="complex-panel">
      <div className="cx-row"><span className="cx-label">z₁ =</span><input className="cx-input" value={a} onChange={e=>setA(e.target.value)} placeholder="3+4i"/></div>
      <div className="cx-ops">
        {["+","-","*","/"].map(o=>(
          <button key={o} className={`cx-op-btn${op===o?" active":""}`} onClick={()=>setOp(o)}>{o}</button>
        ))}
      </div>
      <div className="cx-row"><span className="cx-label">z₂ =</span><input className="cx-input" value={b} onChange={e=>setB(e.target.value)} placeholder="1-2i"/></div>
      <button className="cx-compute" onClick={compute}>Calculate</button>
      {err&&<div className="cx-error">{err}</div>}
      {result&&<pre className="cx-result">{result}</pre>}
    </div>
  );
}

// ── Statistics Panel ───────────────────────────────────────
function StatsPanel(){
  const[data,setData]=useState("4, 8, 15, 16, 23, 42");
  const[result,setResult]=useState(null);
  const[err,setErr]=useState("");

  const compute=()=>{
    try{
      setErr("");
      const d=parseDataset(data);
      const sorted=[...d].sort((a,b)=>a-b);
      setResult({
        n:d.length,sum:d.reduce((a,b)=>a+b,0),mean:statMean(d),median:statMedian(d),
        mode:statMode(d),stdDev:statStdDev(d),popStdDev:statStdDev(d,true),
        variance:statVariance(d),popVariance:statVariance(d,true),range:statRange(d),
        min:Math.min(...d),max:Math.max(...d),q1:statQ1(d),q3:statQ3(d),
        iqr:statQ3(d)-statQ1(d),sorted:sorted.join(", "),
      });
    }catch(e){setErr(e.message);setResult(null);}
  };

  return(
    <div className="stats-panel">
      <div className="panel-label">Dataset <span className="panel-hint">(comma separated)</span></div>
      <textarea className="panel-textarea" value={data} onChange={e=>setData(e.target.value)} rows={2} placeholder="1, 2, 3, 4, 5"/>
      <button className="panel-compute-btn" onClick={compute}>Analyze ▶</button>
      {err&&<div className="panel-error">{err}</div>}
      {result&&(
        <div className="stats-grid">
          {[["Count (n)",result.n],["Sum",parseFloat(result.sum.toFixed(6))],["Mean",parseFloat(result.mean.toFixed(6))],
            ["Median",parseFloat(result.median.toFixed(6))],["Mode",result.mode],
            ["Std Dev (s)",parseFloat(result.stdDev.toFixed(6))],["Std Dev (σ)",parseFloat(result.popStdDev.toFixed(6))],
            ["Variance (s²)",parseFloat(result.variance.toFixed(6))],["Min",result.min],["Max",result.max],
            ["Range",parseFloat(result.range.toFixed(6))],["Q1",parseFloat(result.q1.toFixed(6))],
            ["Q3",parseFloat(result.q3.toFixed(6))],["IQR",parseFloat(result.iqr.toFixed(6))],
          ].map(([k,v])=>(
            <div key={k} className="stat-row">
              <span className="stat-key">{k}</span>
              <span className="stat-val">{v}</span>
            </div>
          ))}
          <div className="stat-row full">
            <span className="stat-key">Sorted</span>
            <span className="stat-val small">{result.sorted}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Equation Panel ─────────────────────────────────────────
function EquationPanel(){
  const[mode,setMode]=useState("quadratic");
  const[a,setA]=useState("1");
  const[b,setB]=useState("-5");
  const[c,setC]=useState("6");
  const[expr,setExpr]=useState("x^3-6*x^2+11*x-6");
  const[initial,setInitial]=useState("1");
  const[result,setResult]=useState(null);
  const[err,setErr]=useState("");

  const solve=()=>{
    try{
      setErr("");
      if(mode==="quadratic"){
        const av=parseFloat(a),bv=parseFloat(b),cv=parseFloat(c);
        if(isNaN(av)||isNaN(bv)||isNaN(cv))throw new Error("Enter valid numbers");
        setResult(solveQuadratic(av,bv,cv));
      } else {
        const root=solveNewton(expr,parseFloat(initial)||0);
        setResult([`x ≈ ${root}`]);
      }
    }catch(e){setErr(e.message);setResult(null);}
  };

  return(
    <div className="eq-panel">
      <div className="eq-tabs">
        {[["quadratic","Quadratic ax²+bx+c"],["newton","f(x)=0 (Newton)"]].map(([v,l])=>(
          <button key={v} className={`eq-tab-btn${mode===v?" active":""}`} onClick={()=>{setMode(v);setResult(null);setErr("");}}>{l}</button>
        ))}
      </div>
      {mode==="quadratic"?(
        <div className="eq-inputs">
          <div className="eq-row"><span className="eq-label">a =</span><input className="eq-input" value={a} onChange={e=>setA(e.target.value)} placeholder="1"/></div>
          <div className="eq-row"><span className="eq-label">b =</span><input className="eq-input" value={b} onChange={e=>setB(e.target.value)} placeholder="-5"/></div>
          <div className="eq-row"><span className="eq-label">c =</span><input className="eq-input" value={c} onChange={e=>setC(e.target.value)} placeholder="6"/></div>
        </div>
      ):(
        <div className="eq-inputs">
          <div className="panel-label">f(x) =</div>
          <input className="eq-input full" value={expr} onChange={e=>setExpr(e.target.value)} placeholder="x^3-6*x^2+11*x-6"/>
          <div className="eq-row"><span className="eq-label">x₀ =</span><input className="eq-input" value={initial} onChange={e=>setInitial(e.target.value)} placeholder="1"/></div>
        </div>
      )}
      <button className="panel-compute-btn" onClick={solve}>Solve ▶</button>
      {err&&<div className="panel-error">{err}</div>}
      {result&&(
        <div className="eq-result">
          {Array.isArray(result)?result.map((r,i)=><div key={i} className="eq-root">{r}</div>):<div className="eq-root">{result}</div>}
        </div>
      )}
    </div>
  );
}

// ── Base Panel ─────────────────────────────────────────────
function BasePanel(){
  const[val,setVal]=useState("255");
  const[fromBase,setFromBase]=useState(10);
  const[err,setErr]=useState("");
  const bases=[{b:2,name:"BIN"},{b:8,name:"OCT"},{b:10,name:"DEC"},{b:16,name:"HEX"}];
  const getConverted=(toBase)=>{try{return convertBase(val,fromBase,toBase);}catch{return "—";}};
  const handleInput=(v)=>{setVal(v);setErr("");};

  return(
    <div className="base-panel">
      <div className="base-from-row">
        <div className="panel-label">Input Base</div>
        <div className="base-btns">
          {bases.map(({b,name})=>(
            <button key={b} className={`base-btn${fromBase===b?" active":""}`} onClick={()=>{setFromBase(b);setVal("0");}}>{name}</button>
          ))}
        </div>
      </div>
      <input className="base-input" value={val} onChange={e=>handleInput(e.target.value)} placeholder={`Enter ${bases.find(x=>x.b===fromBase)?.name} number`}/>
      {err&&<div className="panel-error">{err}</div>}
      <div className="base-results">
        {bases.map(({b,name})=>(
          <div key={b} className={`base-result-row${fromBase===b?" active-base":""}`}>
            <span className="base-label">{name} ({b})</span>
            <span className="base-value" onClick={()=>{setVal(getConverted(b));setFromBase(b);}}>{getConverted(b)}</span>
          </div>
        ))}
      </div>
      <div className="graph-hint">Click a result to use it as input</div>
    </div>
  );
}

// ── Calculus Panel ─────────────────────────────────────────
function CalcPanel(){
  const[mode,setMode]=useState("derivative");
  const[expr,setExpr]=useState("sin(x)*x^2");
  const[xVal,setXVal]=useState("1");
  const[aVal,setAVal]=useState("0");
  const[bVal,setBVal]=useState("3.14159");
  const[result,setResult]=useState(null);
  const[err,setErr]=useState("");

  const compute=()=>{
    try{
      setErr("");
      if(mode==="derivative"){
        const x=parseFloat(xVal);
        if(isNaN(x))throw new Error("Enter valid x");
        const d=derivative(expr,x);
        setResult(`f'(${x}) ≈ ${parseFloat(d.toFixed(10))}`);
      } else {
        const a=parseFloat(aVal),b=parseFloat(bVal);
        if(isNaN(a)||isNaN(b))throw new Error("Enter valid bounds");
        const v=integral(expr,a,b);
        setResult(`∫[${a},${b}] f(x)dx ≈ ${parseFloat(v.toFixed(10))}`);
      }
    }catch(e){setErr(e.message);setResult(null);}
  };

  return(
    <div className="calc-panel-inner">
      <div className="eq-tabs">
        {[["derivative","f′(x) Derivative"],["integral","∫ Integral"]].map(([v,l])=>(
          <button key={v} className={`eq-tab-btn${mode===v?" active":""}`} onClick={()=>{setMode(v);setResult(null);setErr("");}}>{l}</button>
        ))}
      </div>
      <div className="eq-inputs">
        <div className="panel-label">f(x) =</div>
        <input className="eq-input full" value={expr} onChange={e=>setExpr(e.target.value)} placeholder="sin(x)*x^2"/>
        {mode==="derivative"?(
          <div className="eq-row"><span className="eq-label">x =</span><input className="eq-input" value={xVal} onChange={e=>setXVal(e.target.value)} placeholder="1"/></div>
        ):(
          <>
            <div className="eq-row"><span className="eq-label">a =</span><input className="eq-input" value={aVal} onChange={e=>setAVal(e.target.value)} placeholder="0"/></div>
            <div className="eq-row"><span className="eq-label">b =</span><input className="eq-input" value={bVal} onChange={e=>setBVal(e.target.value)} placeholder="3.14159"/></div>
          </>
        )}
      </div>
      <button className="panel-compute-btn" onClick={compute}>Compute ▶</button>
      {err&&<div className="panel-error">{err}</div>}
      {result&&<div className="calc-result">{result}</div>}
      <div className="graph-hint">{mode==="derivative"?"Numerical differentiation (central difference)":"Numerical integration (Simpson's rule, n=1000)"}</div>
    </div>
  );
}

// ── Currency Panel ─────────────────────────────────────────
function CurrencyPanel(){
  const[amount,setAmount]=useState("1");
  const[from,setFrom]=useState("USD");
  const[to,setTo]=useState("INR");
  const currencies=Object.keys(CURRENCIES);
  const convert=()=>{const v=parseFloat(amount);if(isNaN(v))return"—";const usd=v/CURRENCIES[from];return parseFloat((usd*CURRENCIES[to]).toFixed(4)).toString();};

  return(
    <div className="currency-panel">
      <div className="currency-note">📡 Static rates (USD base) — for live rates connect to an API</div>
      <div className="unit-conv-box">
        <div className="unit-row">
          <input className="unit-input" type="number" value={amount} onChange={e=>setAmount(e.target.value)}/>
          <select className="unit-select" value={from} onChange={e=>setFrom(e.target.value)}>
            {currencies.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="unit-arrow">⬇</div>
        <div className="unit-row">
          <div className="unit-result">{convert()}</div>
          <select className="unit-select" value={to} onChange={e=>setTo(e.target.value)}>
            {currencies.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="currency-rates">
        {currencies.map(c=>(
          <div key={c} className="currency-rate-row">
            <span className="currency-code">{c}</span>
            <span className="currency-val">{parseFloat((CURRENCIES[c]/CURRENCIES[from]*parseFloat(amount||1)).toFixed(4))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Programmer Panel ───────────────────────────────────────
function ProgPanel(){
  const[val,setVal]=useState("42");
  const n=parseInt(val)||0;
  const ops=[
    {label:"AND 0xFF",result:(n&0xFF).toString()},
    {label:"OR 0x01",result:(n|0x01).toString()},
    {label:"XOR 0xFF",result:(n^0xFF).toString()},
    {label:"NOT (~)",result:(~n).toString()},
    {label:"<< 1",result:(n<<1).toString()},
    {label:">> 1",result:(n>>1).toString()},
    {label:">>> 1",result:(n>>>1).toString()},
  ];
  return(
    <div className="prog-panel">
      <div className="panel-label">Integer Value</div>
      <input className="eq-input full" type="number" value={val} onChange={e=>setVal(e.target.value)} placeholder="42"/>
      <div className="base-results" style={{marginTop:8}}>
        <div className="base-result-row"><span className="base-label">BIN</span><span className="base-value prog-bin">{(n>>>0).toString(2).padStart(16,"0").replace(/(.{4})/g,"$1 ").trim()}</span></div>
        <div className="base-result-row"><span className="base-label">OCT</span><span className="base-value">{(n>>>0).toString(8)}</span></div>
        <div className="base-result-row"><span className="base-label">HEX</span><span className="base-value">0x{(n>>>0).toString(16).toUpperCase().padStart(8,"0")}</span></div>
      </div>
      <div className="panel-label" style={{marginTop:10}}>Bitwise Operations</div>
      <div className="prog-ops">
        {ops.map(({label,result})=>(
          <div key={label} className="prog-op-row">
            <span className="prog-op-label">{label}</span>
            <span className="prog-op-val">{result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Constants Panel ────────────────────────────────────────
function ConstantsPanel({onInsert}){
  const[cat,setCat]=useState("All");
  const cats=["All","Math","Physics"];
  const filtered=cat==="All"?CONSTANTS:CONSTANTS.filter(c=>c.cat===cat);
  return(
    <div className="constants-panel">
      <div className="unit-cats" style={{marginBottom:8}}>
        {cats.map(c=>(
          <button key={c} className={`unit-cat-btn${cat===c?" active":""}`} onClick={()=>setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="constants-list">
        {filtered.map(({name,sym,val,cat:c})=>(
          <div key={sym} className="constant-row" onClick={()=>onInsert(val)}>
            <span className="constant-sym">{sym}</span>
            <span className="constant-name">{name}</span>
            <span className="constant-val">{val}</span>
          </div>
        ))}
      </div>
      <div className="graph-hint">Click to insert into calculator</div>
    </div>
  );
}

// ── Variables Panel ────────────────────────────────────────
function VariablesPanel({vars,setVars,onInsert}){
  const[newKey,setNewKey]=useState("");
  const[newVal,setNewVal]=useState("");
  const[err,setErr]=useState("");
  const addVar=()=>{
    if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newKey)){setErr("Invalid name (letters/numbers only)");return;}
    const v=parseFloat(newVal);
    if(isNaN(v)){setErr("Invalid value");return;}
    setVars(prev=>({...prev,[newKey]:v}));
    setNewKey("");setNewVal("");setErr("");
  };
  return(
    <div className="vars-panel">
      <div className="vars-add-row">
        <input className="vars-input" value={newKey} onChange={e=>setNewKey(e.target.value)} placeholder="name"/>
        <span className="eq-label">=</span>
        <input className="vars-input" value={newVal} onChange={e=>setNewVal(e.target.value)} placeholder="value" type="number"/>
        <button className="vars-add-btn" onClick={addVar}>Add</button>
      </div>
      {err&&<div className="panel-error">{err}</div>}
      {Object.keys(vars).length===0?(
        <div className="panel-empty">No variables yet. Add one above.</div>
      ):(
        <div className="vars-list">
          {Object.entries(vars).map(([k,v])=>(
            <div key={k} className="var-row">
              <span className="var-key" onClick={()=>onInsert(k)}>{k}</span>
              <span className="var-eq">=</span>
              <span className="var-val">{v}</span>
              <button className="var-del" onClick={()=>setVars(prev=>{const n={...prev};delete n[k];return n;})}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="graph-hint">Click variable name to insert into expression</div>
    </div>
  );
}

// ── Shortcuts Panel ────────────────────────────────────────
function ShortcutsPanel(){
  return(
    <div className="shortcuts-panel">
      {SHORTCUTS.map(({key,desc})=>(
        <div key={key} className="shortcut-row">
          <span className="shortcut-key">{key}</span>
          <span className="shortcut-desc">{desc}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  🔥 FIREBASE HISTORY HOOK
// ══════════════════════════════════════════════════════════
function useFirebaseHistory() {
  const [calcLog, setCalcLog] = useState([]);
  const [fbStatus, setFbStatus] = useState("connecting"); // "connecting" | "ok" | "error"

  // Firebase se real-time history load karna
  useEffect(() => {
    try {
      const histRef = query(
        ref(db, HISTORY_REF),
        orderByChild("timestamp"),
        limitToLast(50)
      );

      const unsubscribe = onValue(histRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const items = Object.entries(data)
            .map(([key, val]) => ({ ...val, _key: key }))
            .sort((a, b) => b.timestamp - a.timestamp); // newest first
          setCalcLog(items);
        } else {
          setCalcLog([]);
        }
        setFbStatus("ok");
      }, (error) => {
        console.error("Firebase error:", error);
        setFbStatus("error");
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase init error:", e);
      setFbStatus("error");
    }
  }, []);

  // Naya calculation Firebase mein save karna
  const saveToHistory = useCallback(async (expr, result) => {
    try {
      const histRef = ref(db, HISTORY_REF);
      await push(histRef, {
        expr,
        result,
        time: new Date().toLocaleTimeString("en-IN", { hour12: true }),
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error("Firebase save error:", e);
    }
  }, []);

  // Poori history clear karna
  const clearHistory = useCallback(async () => {
    try {
      await remove(ref(db, HISTORY_REF));
    } catch (e) {
      console.error("Firebase clear error:", e);
    }
  }, []);

  // Ek item delete karna
  const deleteItem = useCallback(async (key) => {
    try {
      await remove(ref(db, `${HISTORY_REF}/${key}`));
    } catch (e) {
      console.error("Firebase delete error:", e);
    }
  }, []);

  return { calcLog, saveToHistory, clearHistory, deleteItem, fbStatus };
}

// ── Main App ───────────────────────────────────────────────
export default function App(){
  const[expr,setExpr]=useState("");
  const[result,setResult]=useState("0");
  const[history,setHistory]=useState("");
  const[error,setError]=useState(false);
  const[sciMode,setSciMode]=useState(false);
  const[isDeg,setIsDeg]=useState(true);
  const[stackPrev,setStackPrev]=useState([]);
  const[activeTab,setActiveTab]=useState("calc");
  const[activeSubTab,setActiveSubTab]=useState("calc");
  const[theme,setTheme]=useState("dark");
  const[soundOn,setSoundOn]=useState(true);
  const[showTree,setShowTree]=useState(false);
  const[exprTree,setExprTree]=useState(null);
  const[showShortcuts,setShowShortcuts]=useState(false);
  const[showConstants,setShowConstants]=useState(false);
  const[showVars,setShowVars]=useState(false);
  const[histSearch,setHistSearch]=useState("");
  const[showHistSearch,setShowHistSearch]=useState(false);
  const[userVars,setUserVars]=useState({});
  const thIdx=useRef(0);

  // 🔥 Firebase History
  const { calcLog, saveToHistory, clearHistory, deleteItem, fbStatus } = useFirebaseHistory();

  useEffect(()=>{document.documentElement.setAttribute("data-theme",theme);},[theme]);

  useEffect(()=>{
    try{
      let raw=expr.replace(/π/g,"3").replace(/τ/g,"6").replace(/φ/g,"1.6").replace(/e(?![a-z])/g,"2");
      const toks=tokenize(raw),stk=[];
      for(const t of toks){
        if(OPERATORS.includes(t)){while(stk.length&&OPERATORS.includes(stk[stk.length-1])&&prec(stk[stk.length-1])>=prec(t))stk.pop();stk.push(t);}
        else if(FUNCTIONS.includes(t))stk.push(t);
        else if(t==="(")stk.push(t);
        else if(t===")"){while(stk.length&&stk[stk.length-1]!=="(")stk.pop();if(stk.length)stk.pop();}
      }
      setStackPrev([...stk]);
      try{setExprTree(buildTree(tokenize(raw)));}catch{setExprTree(null);}
    }catch{setStackPrev([]);setExprTree(null);}
  },[expr]);

  const inp=useCallback((ch)=>{
    if(soundOn)playClick();
    setError(false);
    setExpr(prev=>{
      const ops=["+","-","*","/","^","%"];
      const last=prev.slice(-1);
      if(ops.includes(ch)&&ops.includes(last))return prev.slice(0,-1)+ch;
      if(ch==="pi")return prev+"π";
      if(ch==="e_c")return prev+"e";
      return prev+ch;
    });
  },[soundOn]);

  const backspace=useCallback(()=>{if(soundOn)playClick();setError(false);setExpr(p=>p.slice(0,-1));},[soundOn]);
  
  const clearAll=useCallback(()=>{
    if(soundOn)playClick();
    setExpr("");setResult("0");setHistory("");setError(false);setStackPrev([]);setExprTree(null);
  },[soundOn]);

  const evaluate=useCallback(()=>{
    if(!expr.trim())return;
    try{
      const res=calculate(expr,isDeg,userVars);
      if(soundOn)playEqual();
      setHistory(expr+" =");
      setResult(res);
      setExpr(res);
      setError(false);
      // 🔥 Firebase mein save karo
      saveToHistory(expr, res);
    }catch(e){
      if(soundOn)playError();
      setResult(e.message);setError(true);setExpr("");
    }
  },[expr,isDeg,soundOn,userVars,saveToHistory]);

  const cycleTheme=useCallback(()=>{
    thIdx.current=(thIdx.current+1)%THEMES.length;
    setTheme(THEMES[thIdx.current]);
    if(soundOn)playTone(700,"sine",0.1,0.12);
  },[soundOn]);

  useEffect(()=>{
    const h=e=>{
      if(activeTab!=="calc")return;
      if(e.ctrlKey||e.metaKey){
        if(e.key==="h"){e.preventDefault();setShowHistSearch(s=>!s);}
        else if(e.key==="t"){e.preventDefault();setShowTree(s=>!s);}
        else if(e.key==="s"){e.preventDefault();setSoundOn(s=>!s);}
        else if(e.key==="m"){e.preventDefault();cycleTheme();}
        return;
      }
      if(e.key>="0"&&e.key<="9")inp(e.key);
      else if(e.key===".")inp(".");
      else if(e.key==="+")inp("+");
      else if(e.key==="-")inp("-");
      else if(e.key==="*")inp("*");
      else if(e.key==="/"){e.preventDefault();inp("/");}
      else if(e.key==="^")inp("^");
      else if(e.key==="%")inp("%");
      else if(e.key==="(")inp("(");
      else if(e.key===")")inp(")");
      else if(e.key==="Enter"||e.key==="=")evaluate();
      else if(e.key==="Backspace")backspace();
      else if(e.key==="Escape")clearAll();
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[inp,evaluate,backspace,clearAll,activeTab,cycleTheme]);

  const dispExpr=expr.replace(/\*/g,"×").replace(/\//g,"÷").replace(/-/g,"−");
  const filteredLog=histSearch
    ?calcLog.filter(i=>i.expr.includes(histSearch)||i.result.includes(histSearch))
    :calcLog;

  const MAIN_TABS=[
    {id:"calc",label:"CALC"},
    {id:"graph",label:"GRAPH"},
    {id:"matrix",label:"MATRIX"},
    {id:"more",label:"MORE ▾"},
  ];

  const MORE_TABS=[
    {id:"stats",label:"STATS"},
    {id:"equation",label:"SOLVE"},
    {id:"base",label:"BASE"},
    {id:"calculus",label:"∫ d/dx"},
    {id:"currency",label:"FOREX"},
    {id:"programmer",label:"PROG"},
    {id:"units",label:"UNITS"},
    {id:"complex",label:"COMPLEX"},
  ];

  const insertToCalc=(val)=>{
    setActiveTab("calc");
    setExpr(prev=>prev+val);
    if(soundOn)playClick();
  };

  // Firebase status indicator color
  const fbStatusColor = fbStatus==="ok" ? "var(--green)" : fbStatus==="error" ? "var(--red)" : "var(--yellow)";
  const fbStatusLabel = fbStatus==="ok" ? "🔥" : fbStatus==="error" ? "⚠" : "⏳";

  return(
    <div className="calc-wrapper">
      <div className="calc-container">
        {/* Header */}
        <div className="calc-header">
          <span className="calc-brand">PDA CALC</span>
          <span className="calc-version">v4.0</span>
          {/* 🔥 Firebase status badge */}
          <span
            className="fb-status-badge"
            title={fbStatus==="ok"?"Firebase connected":fbStatus==="error"?"Firebase error":"Connecting..."}
            style={{color: fbStatusColor}}
          >
            {fbStatusLabel} DB
          </span>
          <div className="header-actions">
            <button className="icon-btn" title="Constants (insert)" onClick={()=>{setShowConstants(s=>!s);setShowVars(false);setShowShortcuts(false);}}>⚛</button>
            <button className="icon-btn" title="Variables" onClick={()=>{setShowVars(s=>!s);setShowConstants(false);setShowShortcuts(false);}}>𝑥</button>
            <button className="icon-btn" title="Shortcuts" onClick={()=>{setShowShortcuts(s=>!s);setShowConstants(false);setShowVars(false);}}>⌨</button>
            <button className="icon-btn" onClick={()=>{setSoundOn(s=>!s);}} title="Sound">{soundOn?"♪":"♩"}</button>
            <button className="icon-btn" onClick={cycleTheme} title="Theme">◑</button>
          </div>
        </div>

        {/* Overlay Panels */}
        {showShortcuts&&(
          <div className="overlay-panel">
            <div className="overlay-header"><span>Keyboard Shortcuts</span><button className="overlay-close" onClick={()=>setShowShortcuts(false)}>✕</button></div>
            <ShortcutsPanel/>
          </div>
        )}
        {showConstants&&(
          <div className="overlay-panel">
            <div className="overlay-header"><span>Math & Physics Constants</span><button className="overlay-close" onClick={()=>setShowConstants(false)}>✕</button></div>
            <ConstantsPanel onInsert={(v)=>{insertToCalc(v);setShowConstants(false);}}/>
          </div>
        )}
        {showVars&&(
          <div className="overlay-panel">
            <div className="overlay-header"><span>Variable Store</span><button className="overlay-close" onClick={()=>setShowVars(false)}>✕</button></div>
            <VariablesPanel vars={userVars} setVars={setUserVars} onInsert={(v)=>{insertToCalc(v);setShowVars(false);}}/>
          </div>
        )}

        {/* Main Tab Bar */}
        <div className="tab-bar">
          {MAIN_TABS.map(t=>(
            <button key={t.id} className={`tab-btn${activeTab===t.id?" active":""}`}
              onClick={()=>{setActiveTab(t.id);if(soundOn)playTone(500,"sine",0.06,0.08);}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* More Sub-tabs */}
        {activeTab==="more"&&(
          <div className="sub-tab-bar">
            {MORE_TABS.map(t=>(
              <button key={t.id} className={`sub-tab-btn${activeSubTab===t.id?" active":""}`}
                onClick={()=>setActiveSubTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── CALC Tab ── */}
        {activeTab==="calc"&&(
          <>
            <div className={`display${error?" shake":""}`}>
              <div className="display-history">{history||"\u00a0"}</div>
              <div className="display-expr">{dispExpr||"\u00a0"}</div>
              <div className={`display-result${error?" error":""}`}>
                {error?result:(expr?dispExpr:result)}<span className="cursor"/>
              </div>
            </div>

            {/* History Search + Clear Button */}
            <div className="history-search-row">
              <button className={`mode-btn${showHistSearch?" active":""}`} style={{flex:"none",padding:"5px 10px"}}
                onClick={()=>setShowHistSearch(s=>!s)}>🔍 History</button>
              {showHistSearch&&<input className="hist-search-input" value={histSearch} onChange={e=>setHistSearch(e.target.value)} placeholder="Search expressions..."/>}
              {/* 🔥 Firebase Clear All button */}
              {calcLog.length>0&&(
                <button
                  className="mode-btn"
                  style={{flex:"none",padding:"5px 8px",color:"var(--red)",fontSize:"10px"}}
                  onClick={()=>{if(window.confirm("Poori history delete karein?"))clearHistory();}}
                  title="Firebase se poori history delete karo"
                >
                  🗑 Clear
                </button>
              )}
            </div>

            {/* 🔥 Firebase History Log */}
            {calcLog.length>0&&(
              <div className="history-log">
                {filteredLog.length===0
                  ?<div className="history-item"><span className="hist-expr" style={{opacity:0.4}}>No matches</span></div>
                  :filteredLog.map((item,idx)=>(
                  <div key={item._key||idx} className="history-item" title="Click to reuse result">
                    {/* Result click karo to use karo */}
                    <span className="hist-time">{item.time}</span>
                    <span className="hist-expr" onClick={()=>setExpr(item.result)} style={{cursor:"pointer"}}>
                      {item.expr.replace(/\*/g,"×").replace(/\//g,"÷")}
                    </span>
                    <span className="hist-eq">=</span>
                    <span className="hist-result" onClick={()=>setExpr(item.result)} style={{cursor:"pointer"}}>
                      {item.result}
                    </span>
                    {/* 🗑 Single item delete */}
                    <button
                      className="hist-del-btn"
                      onClick={()=>item._key&&deleteItem(item._key)}
                      title="Is entry ko delete karo"
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="mode-row">
              <button className={`mode-btn${!sciMode?" active":""}`} onClick={()=>{setSciMode(false);if(soundOn)playClick();}}>Basic</button>
              <button className={`mode-btn${sciMode?" active":""}`} onClick={()=>{setSciMode(true);if(soundOn)playClick();}}>Scientific</button>
              <button className="mode-btn" onClick={()=>{setIsDeg(d=>!d);if(soundOn)playClick();}}>{isDeg?"DEG":"RAD"}</button>
              <button className={`mode-btn${showTree?" active":""}`} onClick={()=>{setShowTree(s=>!s);if(soundOn)playClick();}}>Tree</button>
            </div>

            {sciMode&&(
              <div className="sci-grid">
                {[["sin(","sin"],["cos(","cos"],["tan(","tan"],["asin(","asin"],["acos(","acos"],["atan(","atan"],
                  ["log(","log"],["ln(","ln"],["sqrt(","√"],["abs(","|x|"],["ceil(","⌈x⌉"],["floor(","⌊x⌋"],
                  ["pi","π"],["e_c","e"],["(","("]].map(([v,l])=>(
                  <button key={l} className="btn fn" onClick={()=>{inp(v);if(soundOn)playOp();}}>{l}</button>
                ))}
              </div>
            )}

            <div className="main-grid">
              <button className="btn clear" onClick={()=>{clearAll();if(soundOn)playOp();}}>AC</button>
              <button className="btn backspace" onClick={backspace}>⌫</button>
              <button className="btn op" onClick={()=>{inp("%");if(soundOn)playOp();}}>%</button>
              <button className="btn op" onClick={()=>{inp("/");if(soundOn)playOp();}}>÷</button>

              {["7","8","9"].map(n=><button key={n} className="btn num" onClick={()=>inp(n)}>{n}</button>)}
              <button className="btn op" onClick={()=>{inp("*");if(soundOn)playOp();}}>×</button>

              {["4","5","6"].map(n=><button key={n} className="btn num" onClick={()=>inp(n)}>{n}</button>)}
              <button className="btn op" onClick={()=>{inp("-");if(soundOn)playOp();}}>−</button>

              {["1","2","3"].map(n=><button key={n} className="btn num" onClick={()=>inp(n)}>{n}</button>)}
              <button className="btn op" onClick={()=>{inp("+");if(soundOn)playOp();}}>+</button>

              <button className="btn num" onClick={()=>inp("(")}>(</button>
              <button className="btn num" onClick={()=>inp("0")}>0</button>
              <button className="btn num" onClick={()=>inp(")")}>)</button>
              <button className="btn op" onClick={()=>{inp("^");if(soundOn)playOp();}}>xʸ</button>

              <button className="btn num" onClick={()=>inp(".")}>.</button>
              <button className="btn eq span2" onClick={evaluate}>=</button>
              <button className="btn num" onClick={()=>inp("e_c")}>e</button>
            </div>

            {showTree&&exprTree&&(
              <div className="tree-panel">
                <div className="tree-title">Expression Tree</div>
                <div className="tree-root"><TreeNode node={exprTree}/></div>
              </div>
            )}

            <div className="stack-vis">
              <div className="stack-label">PDA Operator Stack</div>
              <div className="stack-items">
                {stackPrev.length===0
                  ?<span className="stack-empty">empty</span>
                  :stackPrev.map((item,i)=>(
                    <span key={i} className={`stack-item${OPERATORS.includes(item)?" op":" fn"}`}>{item}</span>
                  ))
                }
              </div>
            </div>
          </>
        )}

        {activeTab==="graph"&&<GraphPanel theme={theme}/>}
        {activeTab==="matrix"&&<MatrixPanel/>}

        {activeTab==="more"&&(
          <>
            {activeSubTab==="stats"&&<StatsPanel/>}
            {activeSubTab==="equation"&&<EquationPanel/>}
            {activeSubTab==="base"&&<BasePanel/>}
            {activeSubTab==="calculus"&&<CalcPanel/>}
            {activeSubTab==="currency"&&<CurrencyPanel/>}
            {activeSubTab==="programmer"&&<ProgPanel/>}
            {activeSubTab==="units"&&<UnitPanel/>}
            {activeSubTab==="complex"&&<ComplexPanel/>}
          </>
        )}
      </div>
    </div>
  );
}