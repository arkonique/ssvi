// when the "Calibrate SVI" button is clicked, call slices and allslices endpoints
document.getElementById('calibrateButton').addEventListener('click', async () => {
  // remove scroll on body
  document.body.style.overflow = 'hidden';

  const waiter = document.querySelector('.waiter');
  //const waiter = {innerHTML: '', style: { display: 'block' }}; // dummy for now
  const output = document.querySelector('.outputs');
  //output.style.display = 'none';
  waiter.innerHTML = 'Fetching Data ...';
  const ticker = document.getElementById('tickerInput').value;
  const response = await fetch(`/api/allslices?symbol=${ticker}`).then(res => res.json());
  const { kArray, tjArray, wArray } = parseResponseToArrays(response);

  plotSurfaceAnimated(tjArray, kArray, wArray, true);
  plotIndividualSlices(tjArray, kArray, wArray);

  // 1) Build sorted unique list of maturities (round to kill float noise)
  const round6 = v => +(+v).toFixed(6);
  const tUnique = [...new Set(tjArray.map(round6))].sort((a,b)=>a-b);


// --- ADD: Preload & cache all slices for these maturities ---
const slider = document.getElementById('tjSlider');
const sliceCache = new Map();
const typeParam = 'call'; // or read from your UI if you have a toggle

// Preload all slices concurrently (robust to partial failures)
const preload = await Promise.allSettled(
  tUnique.map(async (t) => {
    const url = `/api/oneslice?symbol=${encodeURIComponent(ticker)}&t=${t.toFixed(6)}&type=${typeParam}`;
    const data = await fetch(url).then(r => r.json());
    // Normalize to numbers so downstream math is safe
    const toNum = (arr) => arr.map(v => +v);
    sliceCache.set(t, {
      t,
      K: toNum(data.K),
      k: toNum(data.k),
      bs_mid: toNum(data.bs_mid),
      bs_est: toNum(data.bs_est),
      w_obs: toNum(data.w_obs),
      w_est: toNum(data.w_est)
    });
  })
);

// stash cache & the ordered maturities on the element for easy access later
slider._tValues = tUnique;
slider._sliceCache = sliceCache;


  // 2) Make slider index-based: 0..N-1 with integer steps
  slider.min = 0;
  slider.max = Math.max(0, tUnique.length - 1);
  slider.step = 1;
  slider.value = 0; // start at earliest t

  // 3) Labels: min / max / current
  const tFmt = t => t.toFixed(2);
  document.getElementById('tjMinLabel').textContent = tFmt(tUnique[0]);
  document.getElementById('tjMaxLabel').textContent = tFmt(tUnique[tUnique.length - 1]);
  document.getElementById('tjValLabel').textContent = tFmt(tUnique[0]);

  // 4) Optional: show tick marks (sample up to ~10 so it’s not cluttered)
  const ticks = document.getElementById('tjTicks');
  ticks.innerHTML = '';
  const N = tUnique.length;
  const tickCount = Math.min(N, 15);
  for (let i = 0; i < tickCount; i++) {
    const idx = Math.round(i * (N - 1) / (tickCount - 1));
    const opt = document.createElement('option');
    opt.value = String(idx);            // slider uses indices
    opt.label = tUnique[idx].toFixed(2);
    ticks.appendChild(opt);
  }

  // Initial plot of first slice
  const firstSlice = sliceCache.get(tUnique[0]);
  plotTimeSlice(firstSlice.t, firstSlice.K, firstSlice.k, firstSlice.bs_mid, firstSlice.bs_est, firstSlice.w_obs, firstSlice.w_est);

  // 5) Update current label on slide; map index -> actual t
slider.oninput = async () => {
  const idx = parseInt(slider.value, 10);
  const t = slider._tValues[idx];
  document.getElementById('tjValLabel').textContent = t.toFixed(6);

  let slice = slider._sliceCache.get(t);

  // Fallback: if something failed during preload, fetch on-demand and cache it
  if (!slice) {
    try {
      const url = `/api/oneslice?symbol=${encodeURIComponent(ticker)}&t=${t.toFixed(6)}&type=${typeParam}`;
      const data = await fetch(url).then(r => r.json());
      const toNum = (arr) => arr.map(v => +v);
      slice = {
        t,
        K: toNum(data.K), k: toNum(data.k),
        bs_mid: toNum(data.bs_mid), bs_est: toNum(data.bs_est),
        w_obs: toNum(data.w_obs),   w_est: toNum(data.w_est)
      };
      slider._sliceCache.set(t, slice);
    } catch (e) {
      console.error('slice fetch failed', e);
      return;
    }
  }

  // Plot from cache (zero network!)
  const { K, k, bs_mid, bs_est, w_obs, w_est } = slice;
  plotTimeSlice(t, K, k, bs_mid, bs_est, w_obs, w_est);
};


  // (Optional) store the mapping on the element for later use elsewhere
    waiter.innerHTML = '';
    waiter.style.display = 'none';
    output.style.display = 'grid';
    output.scrollIntoView({ behavior: 'smooth' });
    document.body.style.overflow = 'auto';
});


// plot a single time slice of k vs w, with market and fitted volatilities
function plotTimeSlice(t, K, k, bs_mid, bs_est, w_obs, w_est) {
  const el1 = document.querySelector('.prices');
  const el2 = document.querySelector('.vols');
  // subplot left - option prices
  const priceTraceMid = {
    type: 'scatter',
    mode: 'lines+markers',
    x: K,
    y: bs_mid,
    name: 'Market',
    marker: { color: 'blue', size: 6 },
    hovertemplate: `t=${t.toFixed(4)}<br>K=%{x:.2f}<br>w=%{y:.4f}<extra></extra>`
  };
    const priceTraceEst = {
    type: 'scatter',
    mode: 'lines+markers',
    x: K,
    y: bs_est,
    name: 'SVI Fit',
    marker: { color: 'orange', size: 6 },
    hovertemplate: `t=${t.toFixed(4)}<br>K=%{x:.2f}<br>w=%{y:.4f}<extra></extra>`
  };
  // subplot right - implied volatilities
  const volTraceObs = {
    type: 'scatter',
    mode: 'lines+markers',
    x: k,
    y: w_obs.map(v => Math.sqrt(v / t)), // convert w to σ
    name: 'Market',
    marker: { color: 'red', size: 6 },
    hovertemplate: `t=${t.toFixed(4)}<br>k=%{x:.2f}<br>σ=%{y:.4f}<extra></extra>`
    };
    const volTraceEst = {
    type: 'scatter',
    mode: 'lines+markers',
    x: k,
    y: w_est.map(v => Math.sqrt(v / t)), // convert w to σ
    name: 'SVI Fit',
    marker: { color: 'green', size: 6 },
    hovertemplate: `t=${t.toFixed(4)}<br>k=%{x:.2f}<br>σ=%{y:.4f}<extra></extra>`
  };

    const layout = {
      title: `SVI Slice at t=${t.toFixed(4)}`,
      xaxis: { title: { text: 'Strike Price \nK ($)' }, zeroline: false },
      yaxis: { title: { text: 'Black-Scholes Price ($)' }, zeroline: false },
      margin: { l: 60, r: 30, t: 40, b: 60 },
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      showlegend: true
    };
    const layout2 = {
      title: `SVI Slice at t=${t.toFixed(4)}`,
      xaxis: { title: { text: 'Log Moneyness\nk = ln(K/F)' }, zeroline: false },
      yaxis: { title: { text: 'Implied Volatility\nσ = √(w/t)' }, zeroline: false },
      margin: { l: 60, r: 30, t: 40, b: 60 },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
      showlegend: true
    };

    // legend at the bottom
    layout.legend = { orientation: 'h', y: -0.3 };
    layout2.legend = { orientation: 'h', y: -0.3 };

    Plotly.react(el1, [volTraceObs, volTraceEst], layout2);
    Plotly.react(el2, [priceTraceMid, priceTraceEst], layout);
}

// plot a 2d plot of k vs w for each slice of constant t
function plotIndividualSlices(tjArray, kArray, wArray) {
  // --- helpers (scoped here, no globals) ---
  const round6 = v => +(+v).toFixed(6);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [0,0,0];
  };
  const rgbToHex = ([r,g,b]) =>
    '#' + [r,g,b].map(v => Math.max(0, Math.min(255, Math.round(v)))
                  .toString(16).padStart(2,'0')).join('');

  // Viridis stops (Plotly’s built-in colorscale stops)
  const VIRIDIS = [
    [0.0,   "#440154"], [0.111, "#482878"], [0.222, "#3e4989"],
    [0.333, "#31688e"], [0.444, "#26828e"], [0.556, "#1f9e89"],
    [0.667, "#35b779"], [0.778, "#6ece58"], [0.889, "#b5de2b"],
    [1.0,   "#fde725"]
  ];
  const viridis = (u) => {
    const t = Math.min(1, Math.max(0, u));
    for (let i = 1; i < VIRIDIS.length; i++) {
      const [p1, c1] = VIRIDIS[i-1];
      const [p2, c2] = VIRIDIS[i];
      if (t <= p2) {
        const f = (t - p1) / (p2 - p1);
        const rgb = hexToRgb(c1).map((v, j) => lerp(v, hexToRgb(c2)[j], f));
        return rgbToHex(rgb);
      }
    }
    return VIRIDIS[VIRIDIS.length - 1][1];
  };

  // --- data prep ---
  const tRounded = tjArray.map(round6);
  const uniqueT = [...new Set(tRounded)].sort((a,b) => a - b);
  const tMin = uniqueT[0] ?? 0;
  const tMax = uniqueT[uniqueT.length - 1] ?? 1;
  const norm = (t) => (tMax === tMin) ? 0.5 : (t - tMin) / (tMax - tMin);

  const el = document.querySelector('.slices');

  // build one line trace per t, colored by Viridis(t)
  const traces = uniqueT.map(t => {
    const kSlice = [];
    const wSlice = [];
    for (let i = 0; i < tRounded.length; i++) {
      if (tRounded[i] === t) { kSlice.push(+kArray[i]); wSlice.push(+wArray[i]); }
    }
    const order = [...kSlice.keys()].sort((i,j) => kSlice[i] - kSlice[j]);
    const kS = order.map(i => kSlice[i]);
    const wS = order.map(i => wSlice[i]);

    return {
      type: 'scatter',
      mode: 'lines',
      x: kS,
      y: wS,
      line: { color: viridis(norm(t)), width: 2 },
      hovertemplate: `t=${t.toFixed(4)}<br>k=%{x:.2f}<br>w=%{y:.4f}<extra></extra>`,
      showlegend: false
    };
  });

  // invisible trace to render a Viridis colorbar keyed to t
  traces.push({
    type: 'scatter',
    mode: 'markers',
    x: [null, null],
    y: [null, null],
    marker: {
      color: [tMin, tMax],
      colorscale: 'Viridis',
      cmin: tMin,
      cmax: tMax,
      showscale: true,
      colorbar: { title: 'Time to Expiry (t)\n(years)' },
      size: 0.0001,
      opacity: 0
    },
    hoverinfo: 'skip',
    showlegend: false
  });

  const layout = {
    title: 'SVI Slices',
    xaxis: { title: { text: 'Log Moneyness (k)' }, zeroline: false },
    yaxis: { title: { text: 'Total Implied Variance (w)' }, zeroline: false },
    margin: { l: 60, r: 30, t: 40, b: 60 },
    plot_bgcolor: 'rgba(0,0,0,0)',
    paper_bgcolor: 'rgba(0,0,0,0)',
    showlegend: false
  };

  Plotly.react(el, traces, layout);
}



// convert responses to arrays
function parseResponseToArrays(response2) {
// get arrays of k, tj, w from response2.slices_df
    const kArray = response2.slices_df.map(item => item.k);
    const tjArray = response2.slices_df.map(item => item.tj);
    const wArray = response2.slices_df.map(item => item.w);
    return { kArray, tjArray, wArray };
}

function gridifyForSurface(tArr, kArr, wArr) {
  const x = [...new Set(tArr)].sort((a,b)=>a-b);   // unique t (cols)
  const y = [...new Set(kArr)].sort((a,b)=>a-b);   // unique k (rows)
  const z = y.map(()=>Array(x.length).fill(null)); // 2-D grid

  // fill grid (assumes each (t,k) appears at most once)
  const xIndex = new Map(x.map((v,i)=>[v,i]));
  const yIndex = new Map(y.map((v,i)=>[v,i]));
  for (let i = 0; i < wArr.length; i++) {
    const xi = xIndex.get(tArr[i]);
    const yi = yIndex.get(kArr[i]);
    if (xi !== undefined && yi !== undefined) z[yi][xi] = wArr[i];
  }
  return { x, y, z };
}

function plotSurface(tj2Array, kArray, wArray) {
  // if wArray is flat (scattered), gridify via existing gridifyForSurface; if it's already 2D, use as-is
  let x, y, z;
  if (Array.isArray(wArray[0])) {
    x = tj2Array.map(Number);
    y = kArray.map(Number);
    z = wArray.map(row => row.map(Number));
  } else {
    const g = gridifyForSurface(tj2Array, kArray, wArray);
    x = g.x.map(Number);
    y = g.y.map(Number);
    z = g.z.map(v => Array.isArray(v) ? v.map(Number) : v);
  }

  // compute contour step sizes for a clean "wireframe" look
  const xMin = Math.min(...x), xMax = Math.max(...x);
  const yMin = Math.min(...y), yMax = Math.max(...y);
  const xSize = (xMax - xMin) / 12 || 1;   // fallback avoids 0
  const ySize = (yMax - yMin) / 12 || 1;

  const trace = {
    type: 'surface',
    x, y, z,
    // choose a vibrant, readable colormap; swap to 'Viridis', 'Portland', or 'RdBu' if you like
    colorscale: 'Portland',
    showscale: true,
    opacity: 0.98,
    // draw grid lines on the surface (wireframe effect)
    contours: {
      x: { show: true, start: xMin, end: xMax, size: xSize, color: 'rgba(0,0,0,0.28)', width: 1 },
      y: { show: true, start: yMin, end: yMax, size: ySize, color: 'rgba(0,0,0,0.28)', width: 1 },
      z: { show: false }
    },
    // subtle lighting for depth; tweak if your monitor is dim/bright
    lighting: { ambient: 0.55, diffuse: 0.7, specular: 0.25, roughness: 0.85, fresnel: 0.15 },
    lightposition: { x: 120, y: 180, z: 200 }
  };

  const layout = {
    title: 'SVI Surface',
    plot_bgcolor: 'rgba(0,0,0,0)',
    paper_bgcolor: 'rgba(0,0,0,0)',
    scene: {
      xaxis: { title: 't (years)', showgrid: true, gridcolor: 'rgba(0,0,0,0.12)', gridwidth: 1, zeroline: false },
      yaxis: { title: 'k = ln(K/F)', showgrid: true, gridcolor: 'rgba(0,0,0,0.12)', gridwidth: 1, zeroline: false },
      zaxis: { title: 'w = σ²·t',   showgrid: true, gridcolor: 'rgba(0,0,0,0.12)', gridwidth: 1, zeroline: false },
      aspectmode: 'cube',
      aspectratio: { x: 1.2, y: 1.0, z: 0.75 },
      // preset camera angle
      camera: {
        eye:    { x: -2.2, y: 0, z: 0.1 },
        center: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: 1 }
      }
    },
    margin: { l: 0, r: 0, t: 40, b: 0 },
    // keeps the chosen camera when you update data (change/remove if you don’t want that)
    uirevision: 'SVI-surface'
  };

  // add x y and z axis titles
  const xAxisTitle = 't (years)';
  const yAxisTitle = 'k = ln(K/F)';
  const zAxisTitle = 'w = σ²·t';
    layout.scene.xaxis.title.text = xAxisTitle;
    layout.scene.yaxis.title.text = yAxisTitle;
    layout.scene.zaxis.title.text = zAxisTitle;

  const el = document.querySelector('.surface');
  Plotly.react(el, [trace], layout);
}


function plotSurfaceAnimated(tj2Array, kArray, wArray, spin = false, rotSpeed = 0.25) {
  // Build grid if needed (keeps your existing helper)
  let x, y, z;
  if (Array.isArray(wArray[0])) {
    x = tj2Array.map(Number);
    y = kArray.map(Number);
    z = wArray.map(row => row.map(Number));
  } else {
    const g = gridifyForSurface(tj2Array, kArray, wArray);
    x = g.x.map(Number);
    y = g.y.map(Number);
    z = g.z.map(v => Array.isArray(v) ? v.map(Number) : v);
  }

  const xMin = Math.min(...x), xMax = Math.max(...x);
  const yMin = Math.min(...y), yMax = Math.max(...y);

  // Surface trace (nice colormap + wireframe grid)
  const trace = {
    type: 'surface',
    x, y, z,
    colorscale: 'Autumn',  // try also 'Portland', 'Viridis', or 'RdBu'
    showscale: true,
    opacity: 0.98,
    contours: {
      x: { show: true, start: xMin, end: xMax, size: (xMax - xMin) / 12 || 1, color: 'rgba(0,0,0,0.28)', width: 1 },
      y: { show: true, start: yMin, end: yMax, size: (yMax - yMin) / 12 || 1, color: 'rgba(0,0,0,0.28)', width: 1 },
      z: { show: false }
    },
    lighting: { ambient: 0.55, diffuse: 0.7, specular: 0.25, roughness: 0.85, fresnel: 0.15 },
    lightposition: { x: 120, y: 180, z: 200 }
  };

  const layout = {
    title: 'SVI Surface',
    plot_bgcolor: 'rgba(0,0,0,0)',
    paper_bgcolor: 'rgba(0,0,0,0)',
    scene: {
      xaxis: { title: { text: 't (years)' }, showgrid: true, gridcolor: 'rgba(0,0,0,0.12)', gridwidth: 1, zeroline: false },
      yaxis: { title: { text: 'k = ln(K/F)' }, showgrid: true, gridcolor: 'rgba(0,0,0,0.12)', gridwidth: 1, zeroline: false },
      zaxis: { title: { text: 'w = σ²·t' },   showgrid: true, gridcolor: 'rgba(0,0,0,0.12)', gridwidth: 1, zeroline: false },
      aspectmode: 'cube',
      aspectratio: { x: 1.2, y: 1.0, z: 0.75 },
      // default angle (you can tweak)
      camera: { eye: { x: -2.0, y: 0.0, z: 0.25 }, up: { x: 0, y: 0, z: 1 } }
    },
    margin: { l: 0, r: 0, t: 40, b: 0 },
    uirevision: 'SVI-surface'
  };

  const el = document.querySelector('.surface');

  // Stop any prior spin
  if (el.__spin && el.__spin.raf) cancelAnimationFrame(el.__spin.raf);
  el.__spin = { running: false, raf: null, angle: (el.__spin?.angle || 0), internal: false };

  Plotly.react(el, [trace], layout).then(() => {
    // One-time handlers to stop on user interaction (but ignore our own relayouts)
    if (!el.__spinHandlersAttached) {
      el.__spinHandlersAttached = true;
      const stopIfUser = (/*e*/) => {
        if (el.__spin.running && !el.__spin.internal) {
          el.__spin.running = false;
          if (el.__spin.raf) cancelAnimationFrame(el.__spin.raf);
        }
      };
      el.on('plotly_hover', stopIfUser);
      el.on('plotly_unhover', stopIfUser);
      el.on('plotly_click', stopIfUser);
      el.on('plotly_selected', stopIfUser);
      el.on('plotly_doubleclick', stopIfUser);
      el.on('plotly_deselect', stopIfUser);
      el.on('plotly_relayout', (e) => {
        // Ignore relayouts we initiate; stop on genuine user relayouts (rotate/zoom)
        if (!el.__spin.internal) stopIfUser(e);
      });
    }

    if (!spin) return;

    // Spin config
    const speed = rotSpeed;   // radians/sec
    const radius = 2.0;  // camera distance
    const eyeZ   = 0.25; // camera height during spin

    el.__spin.running = true;
    let t0 = null;

    const animate = (ts) => {
      if (!el.__spin.running) return;
      if (t0 === null) t0 = ts;
      const dt = (ts - t0) / 1000; // s
      t0 = ts;
      el.__spin.angle += speed * dt;

      const ex = radius * Math.cos(el.__spin.angle);
      const ey = radius * Math.sin(el.__spin.angle);
      const ez = eyeZ;

      // Mark relayout as internal to avoid self-cancelling
      el.__spin.internal = true;
      Plotly.relayout(el, { 'scene.camera': { eye: { x: ex, y: ey, z: ez }, up: { x: 0, y: 0, z: 1 } } })
        .then(() => { el.__spin.internal = false; });

      el.__spin.raf = requestAnimationFrame(animate);
    };

    el.__spin.raf = requestAnimationFrame(animate);
  });
}
