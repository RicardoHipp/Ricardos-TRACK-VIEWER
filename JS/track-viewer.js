const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');

// Views
const uploadView = document.getElementById('dropZone');
const galleryView = document.getElementById('galleryView');
const workspace = document.getElementById('workspace');

// Buttons
const backBtn = document.getElementById('backBtn');
const galleryBtn = document.getElementById('galleryBtn');

// Gallery Elements
const galleryGrid = document.getElementById('galleryGrid');
const libraryCount = document.getElementById('libraryCount');
const searchLibrary = document.getElementById('searchLibrary');

// Editor Canvas
const canvas = document.getElementById('trackCanvas');
const ctx = canvas.getContext('2d');
const cursorCanvas = document.getElementById('cursorCanvas');
const cursorCtx = cursorCanvas.getContext('2d');

// Optimization Cache
const patternCacheCanvas = document.createElement('canvas');
patternCacheCanvas.width = 1200;
patternCacheCanvas.height = 1200;
const patternCacheCtx = patternCacheCanvas.getContext('2d');
let isPatternCacheValid = false;
let isCirclePreview = false;

// Controls
const circlesSlider = document.getElementById('circlesSlider');
const circlesInput = document.getElementById('circlesInput');
const thicknessSlider = document.getElementById('thicknessSlider');
const thicknessValue = document.getElementById('thicknessValue');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const fineSlider = document.getElementById('fineSlider');
const fineInput = document.getElementById('fineInput');
const progressSlider = document.getElementById('progressSlider');
const playBtn = document.getElementById('playBtn');

progressSlider.addEventListener('input', (e) => {
    selectedIndex = -1; // Exit edit mode
    const idx = parseInt(e.target.value);
    playCursor.index = idx;
    playCursor.t = 0.0;
    
    if (currentTrackData.length > 0) {
        const safeIdx = Math.min(idx, currentTrackData.length - 1);
        const p = currentTrackData[safeIdx];
        lastDrawnPoint = getXY(p.theta, p.rho);
    }

    fullRedraw(idx);
    updateCodeScroll(idx);
});
const codePreview = document.getElementById('codePreview');
const rangeActions = document.getElementById('rangeActions');
const rangeCount = document.getElementById('rangeCount');
const fixStartModal = document.getElementById('fixStartModal');
const modalCurrentStart = document.getElementById('modalCurrentStart');

// State
let library = []; 
let currentTrackData = [];
let originalTrackData = [];
let originalFilename = "track.thr";
let pendingTrackData = null; 
let showRotationHint = true;
let undoStack = [];
let selectedIndex = -1;
let p1Index = -1;
let p2Index = -1;
let previewPath = null;

// Playback State
let isPlaying = false;
let playCursor = { index: 0, t: 0.0 };
let lastDrawnPoint = null;
let animationId = null;

// ---NAVIGATION ---
function showUpload() {
    stopPlay();
    uploadView.style.display = 'block';
    galleryView.style.display = 'none';
    workspace.style.display = 'none';
    backBtn.style.display = 'none';
    galleryBtn.style.display = 'none';
    fileInput.value = '';
    folderInput.value = '';
}

function showGallery() {
    stopPlay();
    uploadView.style.display = 'none';
    galleryView.style.display = 'block';
    workspace.style.display = 'none';
    backBtn.style.display = 'inline-block';
    backBtn.innerText = "⬅ Close Folder";
    backBtn.onclick = resetView;
    galleryBtn.style.display = 'none';
    renderGallery();
}

function showEditor() {
    uploadView.style.display = 'none';
    galleryView.style.display = 'none';
    workspace.style.display = 'flex';
    if (library.length > 0) {
        backBtn.style.display = 'none';
        galleryBtn.style.display = 'inline-block';
    } else {
        backBtn.style.display = 'inline-block';
        backBtn.innerText = "⬅ Load New File";
        backBtn.onclick = resetView;
        galleryBtn.style.display = 'none';
    }
}

function resetView() {
    library = [];
    currentTrackData = [];
    originalTrackData = [];
    showUpload();
}

// --- FOLDER & LIBRARY ---
async function triggerFolderSelect() {
    if ('showDirectoryPicker' in window) {
        try {
            const dirHandle = await window.showDirectoryPicker();
            showGallery();
            libraryCount.innerText = "Scanning folder...";
            const files = await scanDirectory(dirHandle);
            if (files.length === 0) {
                libraryCount.innerText = "No .thr files found.";
                return;
            }
            handleFiles(files);
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn("Folder Access API failed or cancelled, using fallback.", err);
        }
    } else {
        folderInput.click();
    }
}

async function scanDirectory(dirHandle) {
    let files = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            if (entry.name.toLowerCase().endsWith('.thr')) {
                files.push(await entry.getFile());
            }
        } else if (entry.kind === 'directory') {
            const subFiles = await scanDirectory(entry);
            files = files.concat(subFiles);
        }
    }
    return files;
}

folderInput.addEventListener('change', (e) => { handleFiles(e.target.files); });
searchLibrary.addEventListener('input', (e) => { renderGallery(e.target.value); });

async function handleFiles(files) {
    const fileArray = Array.from(files);
    let validFiles = [];
    for (let i = 0; i < fileArray.length; i++) {
        if (fileArray[i].name.toLowerCase().endsWith('.thr')) validFiles.push(fileArray[i]);
    }
    if (validFiles.length === 0) return;
    if (validFiles.length === 1 && library.length === 0) {
        handleFile(validFiles[0]);
        return;
    }
    showGallery();
    libraryCount.innerText = `Loading ${validFiles.length} files...`;
    for (const file of validFiles) {
        if (library.find(i => i.name === file.name)) continue;
        const text = await file.text();
        const points = parseTrackPoints(text);
        const thumb = await generateThumbnail(points);
        library.push({ name: file.name, file: file, points: points, thumbnail: thumb, count: points.length });
        renderGallery(searchLibrary.value);
        libraryCount.innerText = `(${library.length} files)`;
    }
}

function renderGallery(filter = "") {
    galleryGrid.innerHTML = '';
    const term = filter.toLowerCase();
    library.forEach((item, index) => {
        if (!item.name.toLowerCase().includes(term)) return;
        const card = document.createElement('div');
        card.className = 'track-card';
        card.onclick = () => loadFromLibrary(index);
        const imgContainer = document.createElement('div');
        imgContainer.className = 'thumbnail-container';
        imgContainer.appendChild(item.thumbnail);
        const title = document.createElement('div');
        title.className = 'track-title';
        title.innerText = item.name;
        title.title = item.name;
        const meta = document.createElement('div');
        meta.className = 'track-meta';
        meta.innerText = `${item.count} pts`;
        card.appendChild(imgContainer); card.appendChild(title); card.appendChild(meta);
        galleryGrid.appendChild(card);
    });
}

function loadFromLibrary(index) {
    let realItem; let visualIndex = 0; const term = searchLibrary.value.toLowerCase();
    for(let i=0; i<library.length; i++) {
        if(library[i].name.toLowerCase().includes(term)) {
            if(visualIndex === index) { realItem = library[i]; break; }
            visualIndex++;
        }
    }
    if(!realItem) return;
    originalFilename = realItem.name;
    checkStartAndLoad(realItem.points);
}

async function generateThumbnail(points) {
    const cvs = document.createElement('canvas');
    cvs.width = 200; cvs.height = 200;
    const c = cvs.getContext('2d');
    c.fillStyle = '#1e293b'; c.fillRect(0, 0, 200, 200);
    if (points.length < 2) return cvs;
    const cx = 100; const cy = 100; const r = 90;
    c.beginPath(); c.strokeStyle = '#38bdf8'; c.lineWidth = 1; c.globalAlpha = 0.8;
    const p0 = points[0];
    c.moveTo(cx + (p0.rho * r) * Math.cos(p0.theta), cy + (p0.rho * r) * Math.sin(p0.theta));
    for(let i=1; i<points.length; i++) {
        const p = points[i];
        c.lineTo(cx + (p.rho * r) * Math.cos(p.theta), cy + (p.rho * r) * Math.sin(p.theta));
    }
    c.stroke();
    return cvs;
}

// --- CORE EDITOR LOGIC ---
function handleFile(file) {
    originalFilename = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        const tempTrack = parseTrackPoints(e.target.result);
        checkStartAndLoad(tempTrack);
    };
    reader.readAsText(file);
}

function checkStartAndLoad(tempTrack) {
    if (tempTrack.length > 0) {
        const firstP = tempTrack[0];
        if (Math.abs(firstP.theta) > 0.1) {
            pendingTrackData = tempTrack;
            modalCurrentStart.textContent = `Current Start: ${firstP.theta.toFixed(5)} ${firstP.rho.toFixed(5)}`;
            fixStartModal.classList.add('active');
            return;
        }
    }
    finishLoading(tempTrack);
}

function confirmFixStart(shouldFix) {
    fixStartModal.classList.remove('active');
    let track = pendingTrackData;
    if (shouldFix && track.length > 0) {
        const firstP = track[0];
        let startRho = 0.0;
        const isHighRotation = Math.abs(firstP.theta) > 4 * Math.PI;
        const patternStartsAtEdge = firstP.rho > 0.5;
        if (isHighRotation) { startRho = patternStartsAtEdge ? 0.0 : 1.0; } 
        else { startRho = patternStartsAtEdge ? 1.0 : 0.0; }
        track = [{ theta: 0.0, rho: startRho }, ...track];
    }
    finishLoading(track);
}

function finishLoading(track) {
    isPatternCacheValid = false;
    patternCacheCtx.clearRect(0, 0, 1200, 1200);
    undoStack = []; // Clear undo history for the new file
    updateUndoButton(); // Reset the UI label
    const detected = detectExistingCleaning(track);
    originalTrackData = detected.cleanTrack;
    if (detected.found) {
        document.getElementById('preCleanCheck').checked = true;
        circlesSlider.value = detected.circles;
        circlesInput.value = detected.circles;
        const startPosRadios = document.getElementsByName('startPos');
        if (detected.patternStartRho > 0.5) { for (const r of startPosRadios) { if (r.value === 'center') r.checked = true; } } 
        else { for (const r of startPosRadios) { if (r.value === 'edge') r.checked = true; } }
    } else {
        document.getElementById('preCleanCheck').checked = false;
    }
    applyRotations(true);
    showEditor();
}

function parseTrackPoints(text) {
    const points = [];
    const lines = text.split('\n');
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            const theta = parseFloat(parts[0]);
            const rho = parseFloat(parts[1]);
            if (!isNaN(theta) && !isNaN(rho)) {
                if (points.length > 0) {
                    const last = points[points.length - 1];
                    if (Math.abs(last.theta - theta) < 0.000001 && Math.abs(last.rho - rho) < 0.000001) return;
                }
                points.push({ theta, rho });
            }
        }
    });
    return points;
}

function detectExistingCleaning(track) {
    if (track.length < 2) return { found: false, cleanTrack: track };
    const p0 = track[0]; const p1 = track[1];
    const signedDTheta = p1.theta - p0.theta;
    const dTheta = Math.abs(signedDTheta);
    const dRho = Math.abs(p1.rho - p0.rho);
    if (dTheta > Math.PI && dRho > 0.8) {
        const circles = Math.round(signedDTheta / (2 * Math.PI));
        return { found: true, circles: circles, patternStartRho: p1.rho, cleanTrack: track.slice(1) };
    }
    return { found: false, cleanTrack: track };
}

function handlePreCleanChange() {
    const isChecked = document.getElementById('preCleanCheck').checked;
    const currentVal = parseInt(circlesSlider.value);
    if (isChecked && Math.abs(currentVal) <= 1) {
        circlesSlider.value = 25; circlesInput.value = 25;
    } else if (!isChecked) {
        circlesSlider.value = 0; circlesInput.value = 0;
    }
    isPatternCacheValid = false;
    applyRotations();
}

function updateAndApply(source, target) {
    target.value = source.value;
    if (source.id === 'fineSlider' || source.id === 'fineInput') {
        previewRotation(source.value);
    } else if (source.id === 'circlesSlider' || source.id === 'circlesInput') {
        isCirclePreview = true;
        if (parseInt(source.value) > 0) document.getElementById('preCleanCheck').checked = true;
        applyRotations();
    } else {
        isCirclePreview = false;
        applyRotations();
    }
}

function commitCircles() { isCirclePreview = false; applyRotations(); }

let storedRotationStart = 0;
function previewRotation(degrees) {
    const diff = parseFloat(degrees) - storedRotationStart;
    canvas.style.transform = `rotate(${diff}deg)`;
}
function commitRotation() {
    canvas.style.transform = 'none';
    storedRotationStart = parseFloat(fineSlider.value);
    isPatternCacheValid = false;
    applyRotations();
}

circlesSlider.addEventListener('input', (e) => updateAndApply(e.target, circlesInput));
circlesSlider.addEventListener('change', (e) => commitCircles());
circlesInput.addEventListener('input', (e) => updateAndApply(e.target, circlesSlider));
circlesInput.addEventListener('change', (e) => commitCircles());
fineSlider.addEventListener('input', (e) => updateAndApply(e.target, fineInput));
fineSlider.addEventListener('change', (e) => commitRotation());
fineInput.addEventListener('input', (e) => updateAndApply(e.target, fineSlider));
fineInput.addEventListener('change', (e) => commitRotation());
thicknessSlider.addEventListener('input', (e) => { thicknessValue.textContent = e.target.value + 'px'; if (isPlaying) stopPlay(); else fullRedraw(); });
speedSlider.addEventListener('input', (e) => { speedValue.textContent = e.target.value + 'x'; });

function togglePlay() {
    if (isPlaying) {
        pausePlay();
    } else {
        selectedIndex = -1; // Exit edit mode
        isPlaying = true;
        playBtn.textContent = "⏸ Pause";
        playBtn.style.backgroundColor = "#eab308";
        
        // If we are at the end or haven't started, reset to start
        if (!lastDrawnPoint || playCursor.index >= currentTrackData.length - 1) {
            playCursor = { index: 0, t: 0.0 };
            fullRedraw(0);
            const startPt = currentTrackData[0];
            lastDrawnPoint = getXY(startPt.theta, startPt.rho);
        }
        animate();
    }
}

function pausePlay() {
    isPlaying = false;
    if (animationId) cancelAnimationFrame(animationId);
    playBtn.textContent = "▶ Resume";
    playBtn.style.backgroundColor = "var(--accent-color)";
    // Redraw up to current point to ensure clean state
    fullRedraw(playCursor.index);
    // Keep code view at current position
    updateCodeScroll(playCursor.index);
}

function stopPlay() {
    isPlaying = false;
    selectedIndex = -1; // Reset selection
    if (animationId) cancelAnimationFrame(animationId);
    playBtn.textContent = "▶ Play";
    playBtn.style.backgroundColor = "var(--accent-color)";
    fullRedraw();
    playCursor = { index: currentTrackData.length - 1, t: 1.0 };
    lastDrawnPoint = null;
    updateStats(); // Restore static view
}

function updateCodeScroll(currentIndex) {
    if (!currentTrackData.length) {
        codePreview.innerHTML = '';
        return;
    }
    
    const visibleLines = 25; // 20 past + 1 current + 4 future
    const preferredPast = 20;
    
    let start = currentIndex - preferredPast;
    
    // Adjust start if it goes below 0 (Start of track)
    if (start < 0) {
        start = 0;
    }
    
    let end = start + visibleLines;
    
    // Adjust end if it goes beyond track length (End of track)
    if (end > currentTrackData.length) {
        end = currentTrackData.length;
        // Try to pull start back to fill the window
        start = Math.max(0, end - visibleLines);
    }

    let html = '';
    for (let i = start; i < end; i++) {
        const p = currentTrackData[i];
        const lineText = `${i + 1}: ${p.theta.toFixed(5)} ${p.rho.toFixed(5)}`;
        
        let classes = 'code-line';
        let content = `<span>${lineText}</span>`;
        let buttons = '';

        // Check if this is P1 or P2
        if (i === p1Index) {
            classes += ' marker-p1';
            content = `<span class="marker-badge p1-badge">P1</span> ` + content;
        } else if (i === p2Index) {
            classes += ' marker-p2';
            content = `<span class="marker-badge p2-badge">P2</span> ` + content;
        }

        // Highlight range
        if (p1Index !== -1 && p2Index !== -1) {
            const s = Math.min(p1Index, p2Index);
            const e = Math.max(p1Index, p2Index);
            if (i > s && i < e) {
                classes += ' selected-range';
            }
        }
        
        // Selection Logic (Current Interaction Target)
        if (i === selectedIndex) {
            classes += ' selected';
            
            // Trash Button
            buttons += `<button class="action-btn delete-btn" title="Delete Point">🗑️</button>`;
            
            // P1 Button (Show if not already P1)
            if (i !== p1Index) {
                buttons += `<button class="action-btn set-p1-btn" title="Set Start Point (P1)">🚩 A</button>`;
            }
            
            // P2 Button (Show only if P1 is set and this is not P1/P2)
            if (p1Index !== -1 && i !== p1Index && i !== p2Index) {
                buttons += `<button class="action-btn set-p2-btn" title="Set End Point (P2)">🏁 B</button>`;
            }
        } 
        
        // Also Blue Highlight for the playhead/view limit
        if (i === currentIndex) {
            classes += ' highlight-line';
        }
        
        html += `<div class="${classes}" data-index="${i}">${content}<div style="display:flex; gap:4px;">${buttons}</div></div>`;
    }
    codePreview.innerHTML = html;
}

function animate() {
    if (!isPlaying) return;
    const speedVal = parseInt(speedSlider.value) || 10;
    const moveBudget = speedVal * 0.01;
    let remainingMove = moveBudget;
    const thickness = parseInt(thicknessSlider.value) || 2;
    const patternIdx = getPatternStartIdx();
    let currentPath = new Path2D();
    currentPath.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
    let currentMode = playCursor.index >= patternIdx ? 'pattern' : 'spiral';
    let hasPointsInPath = false;

    while (remainingMove > 0 && playCursor.index < currentTrackData.length - 1) {
        const p1 = currentTrackData[playCursor.index];
        const p2 = currentTrackData[playCursor.index + 1];
        const mode = playCursor.index >= patternIdx ? 'pattern' : 'spiral';
        if (mode !== currentMode) {
            if (hasPointsInPath) renderPathBatch(currentPath, currentMode, thickness);
            currentPath = new Path2D();
            currentPath.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
            currentMode = mode;
            hasPointsInPath = false;
        }
        const dTheta = p2.theta - p1.theta;
        const dRho = p2.rho - p1.rho;
        const segLen = Math.sqrt(dTheta*dTheta + dRho*dRho * 20);
        if (segLen < 0.0001) { playCursor.index++; playCursor.t = 0; continue; }
        let stepT = Math.min(remainingMove / segLen, 1.0 - playCursor.t);
        remainingMove -= stepT * segLen;
        const startT = playCursor.t; const nextT = startT + stepT;
        const frameDTheta = (p2.theta - p1.theta) * (nextT - startT);
        const subSteps = Math.ceil(Math.abs(frameDTheta) / 0.05);
        for (let s = 1; s <= subSteps; s++) {
            const factor = s / subSteps;
            const iT = startT + (nextT - startT) * factor;
            const iXY = getXY(p1.theta + (p2.theta - p1.theta) * iT, p1.rho + (p2.rho - p1.rho) * iT);
            currentPath.lineTo(iXY.x, iXY.y);
            lastDrawnPoint = iXY;
        }
        hasPointsInPath = true;
        playCursor.t = nextT;
        if (playCursor.t >= 0.9999) { playCursor.index++; playCursor.t = 0.0; }
    }
    if (hasPointsInPath) renderPathBatch(currentPath, currentMode, thickness);
    
    // REDRAW ALL CURSORS (Blue animated, Red static)
    cursorCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (lastDrawnPoint) {
        let angle = null;
        if (playCursor.index < currentTrackData.length - 1) {
            const p1 = currentTrackData[playCursor.index];
            const p2 = currentTrackData[playCursor.index + 1];
            angle = Math.atan2(getXY(p2.theta, p2.rho).y - getXY(p1.theta, p1.rho).y, getXY(p2.theta, p2.rho).x - getXY(p1.theta, p1.rho).x);
        }
        drawCursorAt(lastDrawnPoint, angle, false); // Draw Blue Playhead (animated)
    }
    
    // Always draw Red Selection if it exists
    if (selectedIndex !== -1 && selectedIndex < currentTrackData.length) {
        const pSel = currentTrackData[selectedIndex];
        const posSel = getXY(pSel.theta, pSel.rho);
        let angleSel = null;
        if (selectedIndex < currentTrackData.length - 1) {
            const pNext = currentTrackData[selectedIndex + 1];
            angleSel = Math.atan2(getXY(pNext.theta, pNext.rho).y - posSel.y, getXY(pNext.theta, pNext.rho).x - posSel.x);
        }
        drawCursorAt(posSel, angleSel, true); // Draw Red Selection (static)
    }
    
    // Update scrolling code view and slider
    updateCodeScroll(playCursor.index);
    progressSlider.value = playCursor.index;

    if (playCursor.index >= currentTrackData.length - 1) stopPlay();
    else animationId = requestAnimationFrame(animate);
}

function renderPathBatch(path, mode, thickness) {
    ctx.lineCap = (mode === 'spiral') ? 'butt' : 'round';
    ctx.lineJoin = 'round';
    if (mode === 'spiral') {
        setSpiralShadowStyle(ctx, thickness); ctx.stroke(path);
        setSpiralMainStyle(ctx, thickness); ctx.stroke(path);
    } else {
        setPatternShadowStyle(ctx, thickness); ctx.stroke(path);
        setPatternHighlightStyle(ctx, thickness); ctx.stroke(path);
    }
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1200;
const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2;
const MAX_RADIUS = (CANVAS_WIDTH / 2) - 20;

function getXY(theta, rho) {
    return { x: CENTER_X + (rho * MAX_RADIUS) * Math.cos(theta), y: CENTER_Y + (rho * MAX_RADIUS) * Math.sin(theta) };
}

let cachedPatternStartIdx = -1;
function getPatternStartIdx() {
    if (cachedPatternStartIdx !== -1) return cachedPatternStartIdx;
    if (originalTrackData.length > 0) {
        if (document.getElementById('preCleanCheck').checked && (parseInt(circlesSlider.value) || 0) > 0) {
            cachedPatternStartIdx = currentTrackData.length - originalTrackData.length + findStartIndex(originalTrackData);
            return cachedPatternStartIdx;
        }
    }
    cachedPatternStartIdx = 0;
    return 0;
}

function setSpiralShadowStyle(ctx, t) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = t;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1.0;
}

function setSpiralMainStyle(ctx, t) {
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = Math.max(1, t * 0.4);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1.0;
}

function setPatternShadowStyle(ctx, t) {
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = t;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = t;
    ctx.shadowColor = '#000000';
    ctx.globalAlpha = 0.6;
}

function setPatternHighlightStyle(ctx, t) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(1, t * 0.5);
    ctx.lineCap = 'round';
    ctx.shadowBlur = t * 0.2;
    ctx.shadowColor = '#bae6fd';
    ctx.globalAlpha = 1.0;
}

function drawCursorAt(pos, angle = null, isSelection = false) {
    const primaryColor = isSelection ? '#f43f5e' : '#38bdf8'; // Red vs Blue
    
    // Draw Arrow if angle is provided
    if (angle !== null && !isNaN(angle)) {
        cursorCtx.save();
        cursorCtx.translate(pos.x, pos.y);
        cursorCtx.rotate(angle);
        cursorCtx.beginPath();
        cursorCtx.moveTo(25, 0); 
        cursorCtx.lineTo(10, -8);
        cursorCtx.lineTo(10, 8);
        cursorCtx.closePath();
        cursorCtx.fillStyle = '#eab308'; // Always Yellow for best contrast
        cursorCtx.shadowColor = 'black';
        cursorCtx.shadowBlur = 4;
        cursorCtx.fill();
        cursorCtx.restore();
    }

    // Draw the Ball
    cursorCtx.beginPath(); cursorCtx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
    const grad = cursorCtx.createRadialGradient(pos.x - 3, pos.y - 3, 1, pos.x, pos.y, 8);
    
    if (isSelection) {
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#9f1239'); 
    } else {
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#94a3b8'); 
    }
    
    cursorCtx.fillStyle = grad; cursorCtx.shadowColor = '#000000'; cursorCtx.shadowBlur = 10; cursorCtx.fill();
    cursorCtx.beginPath(); cursorCtx.arc(pos.x - 3, pos.y - 3, 2, 0, Math.PI * 2);
    cursorCtx.fillStyle = 'white'; cursorCtx.shadowBlur = 0; cursorCtx.fill();
}

function drawCursor(index) {
    cursorCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 1. Draw Blue Playhead (Normal Cursor)
    const safeIndex = Math.min(Math.max(0, index), currentTrackData.length - 1);
    if (safeIndex >= 0) {
        const p1 = currentTrackData[safeIndex];
        const pos1 = getXY(p1.theta, p1.rho);
        let angle = null;
        if (safeIndex < currentTrackData.length - 1) {
            const p2 = currentTrackData[safeIndex + 1];
            angle = Math.atan2(getXY(p2.theta, p2.rho).y - pos1.y, getXY(p2.theta, p2.rho).x - pos1.x);
        }
        drawCursorAt(pos1, angle, false); // isSelection = false (Blue)
    }

    // 2. Draw Red Selection Point (if exists)
    if (selectedIndex !== -1 && selectedIndex < currentTrackData.length) {
        const pSel = currentTrackData[selectedIndex];
        const posSel = getXY(pSel.theta, pSel.rho);
        let angleSel = null;
        if (selectedIndex < currentTrackData.length - 1) {
            const pNext = currentTrackData[selectedIndex + 1];
            angleSel = Math.atan2(getXY(pNext.theta, pNext.rho).y - posSel.y, getXY(pNext.theta, pNext.rho).x - posSel.x);
        }
        drawCursorAt(posSel, angleSel, true); // isSelection = true (Red)
    }

    // 3. Draw P1 and P2 Markers
    if (p1Index !== -1 && p1Index < currentTrackData.length) {
        drawMarker(p1Index, "P1", "#22c55e"); // Green
    }
    if (p2Index !== -1 && p2Index < currentTrackData.length) {
        drawMarker(p2Index, "P2", "#e11d48"); // Red
    }
}

function drawMarker(index, label, color) {
    const p = currentTrackData[index];
    const pos = getXY(p.theta, p.rho);
    
    cursorCtx.save();
    cursorCtx.translate(pos.x, pos.y);
    
    // Pin/Flag shape
    cursorCtx.beginPath();
    cursorCtx.moveTo(0, 0);
    cursorCtx.lineTo(-10, -25);
    cursorCtx.lineTo(10, -25);
    cursorCtx.closePath();
    cursorCtx.fillStyle = color;
    cursorCtx.fill();
    
    // Label
    cursorCtx.font = "bold 14px sans-serif";
    cursorCtx.fillStyle = "white";
    cursorCtx.textAlign = "center";
    cursorCtx.fillText(label, 0, -30);
    
    cursorCtx.restore();
}

function drawSegment(startIndex, endIndex, targetCtx = null) {
    const c = targetCtx || ctx;
    if (startIndex >= endIndex || currentTrackData.length < 2) return;
    const thickness = parseInt(thicknessSlider.value) || 2;
    const patternStartIdx = getPatternStartIdx();
    const spiralEnd = Math.min(patternStartIdx, endIndex);
    const spiralStart = Math.min(patternStartIdx, startIndex);
    if (spiralStart < spiralEnd) {
        const spiralPath = new Path2D();
        let startP = getXY(currentTrackData[spiralStart].theta, currentTrackData[spiralStart].rho);
        spiralPath.moveTo(startP.x, startP.y);
        for (let i = spiralStart; i < spiralEnd; i++) {
            let p1 = currentTrackData[i]; let p2 = currentTrackData[i+1];
            let dTheta = p2.theta - p1.theta;
            const steps = Math.ceil(Math.abs(dTheta) / 0.1);
            if (steps <= 1) { spiralPath.lineTo(getXY(p2.theta, p2.rho).x, getXY(p2.theta, p2.rho).y); } 
            else { for (let s = 1; s <= steps; s++) { const t = s / steps; const iP = getXY(p1.theta + dTheta * t, p1.rho + (p2.rho - p1.rho) * t); spiralPath.lineTo(iP.x, iP.y); } }
        }
        setSpiralShadowStyle(c, thickness); c.stroke(spiralPath);
        setSpiralMainStyle(c, thickness); c.stroke(spiralPath);
    }
    const patternStart = Math.max(patternStartIdx, startIndex);
    const patternEnd = endIndex;
    if (patternStart < patternEnd) {
        const BATCH_SIZE = 50;
        let currentIdx = patternStart;
        while (currentIdx < patternEnd) {
            const batchEnd = Math.min(currentIdx + BATCH_SIZE, patternEnd);
            const patternPath = new Path2D();
            let p = currentTrackData[currentIdx];
            patternPath.moveTo(getXY(p.theta, p.rho).x, getXY(p.theta, p.rho).y);
            for (let i = currentIdx; i < batchEnd; i++) {
                let p1 = currentTrackData[i]; let p2 = currentTrackData[i+1];
                let dTheta = p2.theta - p1.theta;
                const steps = Math.ceil(Math.abs(dTheta) / 0.1);
                if (steps <= 1) { patternPath.lineTo(getXY(p2.theta, p2.rho).x, getXY(p2.theta, p2.rho).y); } 
                else { for (let s = 1; s <= steps; s++) { const t = s / steps; const iP = getXY(p1.theta + dTheta * t, p1.rho + (p2.rho - p1.rho) * t); patternPath.lineTo(iP.x, iP.y); } }
            }
            setPatternShadowStyle(c, thickness); c.stroke(patternPath);
            setPatternHighlightStyle(c, thickness); c.stroke(patternPath);
            currentIdx = batchEnd;
        }
    }
}

function fullRedraw(limitIndex = -1) {
    // Determine the target point index we want to draw up to.
    // If limitIndex is -1, we want the last point (length - 1).
    // If limitIndex is specified (e.g. 10), we want point 10.
    const targetIndex = (limitIndex === -1 || limitIndex >= currentTrackData.length) 
        ? currentTrackData.length - 1 
        : limitIndex;

    const patternIdx = getPatternStartIdx();
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 2;
    ctx.arc(CENTER_X, CENTER_Y, MAX_RADIUS, 0, Math.PI * 2); ctx.stroke();
    
    if (currentTrackData.length < 2) return;

    // Optimization Logic adapted for targetIndex
    if (isCirclePreview && isPatternCacheValid && patternIdx > 0 && limitIndex === -1) {
        ctx.drawImage(patternCacheCanvas, 0, 0); 
        drawSegment(0, patternIdx);
    } else {
        if (isCirclePreview && !isPatternCacheValid && patternIdx > 0 && limitIndex === -1) {
            patternCacheCtx.clearRect(0,0,1200,1200); 
            // Cache draws everything from patternIdx to End
            drawSegment(patternIdx, currentTrackData.length - 1, patternCacheCtx);
            isPatternCacheValid = true;
        }
        
        if (isCirclePreview && isPatternCacheValid && limitIndex === -1) {
            drawSegment(0, patternIdx); 
            ctx.drawImage(patternCacheCanvas, 0, 0);
        } else {
            // Standard drawing (dynamic or no cache)
            drawSegment(0, targetIndex);
            
            if (limitIndex === -1 && !isPatternCacheValid) {
                 patternCacheCtx.clearRect(0,0,1200,1200); 
                 drawSegment(patternIdx, currentTrackData.length - 1, patternCacheCtx);
                 isPatternCacheValid = true;
            }
        }
    }
    drawRotationHandle(); 

    // Draw Preview Path (Red smoothed line) - DRAW ON TOP OF EVERYTHING ELSE
    if (previewPath && previewPath.length > 1) {
        ctx.save();
        ctx.beginPath();
        const startP = getXY(previewPath[0].theta, previewPath[0].rho);
        ctx.moveTo(startP.x, startP.y);
        for(let i=1; i<previewPath.length; i++) {
             const p = getXY(previewPath[i].theta, previewPath[i].rho);
             ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 5; // Thicker
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(244, 63, 94, 0.8)';
        ctx.stroke();
        ctx.restore();
    }

    drawCursor(targetIndex);
}

function drawRotationHandle() {
    const fineVal = parseFloat(fineSlider.value) || 0;
    const handleAngle = (fineVal / 360) * Math.PI * 2;
    const handleX = CENTER_X + MAX_RADIUS * Math.cos(handleAngle);
    const handleY = CENTER_Y + MAX_RADIUS * Math.sin(handleAngle);
    ctx.beginPath(); ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'; ctx.lineWidth = 2;
    ctx.arc(CENTER_X, CENTER_Y, MAX_RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.fillStyle = '#38bdf8'; ctx.shadowColor = 'rgba(56, 189, 248, 0.8)'; ctx.shadowBlur = 15;
    ctx.arc(handleX, handleY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 0; ctx.arc(handleX, handleY, 4, 0, Math.PI * 2); ctx.fill();
    if (showRotationHint) {
        const hintDist = MAX_RADIUS - 70;
        const hintX = CENTER_X + hintDist * Math.cos(handleAngle); const hintY = CENTER_Y + hintDist * Math.sin(handleAngle);
        ctx.font = 'bold 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const text = "Drag to Rotate"; const metrics = ctx.measureText(text); const bw = metrics.width + 24; const bh = 34;
        ctx.beginPath(); ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'; ctx.lineWidth = 2; ctx.moveTo(hintX, hintY); ctx.lineTo(handleX, handleY); ctx.stroke();
        ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(hintX - bw / 2, hintY - bh / 2, bw, bh, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f8fafc'; ctx.fillText(text, hintX, hintY);
    }
}

function applyRotations(forceRaw = false) {
    cachedPatternStartIdx = -1;
    const cleaningCircles = parseInt(circlesSlider.value) || 0;
    const degrees = parseFloat(fineSlider.value) || 0;
    const doPreClean = document.getElementById('preCleanCheck').checked;
    const idx = findStartIndex(originalTrackData);
    if (idx >= originalTrackData.length) return; 
    const currentPatternStartTheta = originalTrackData[idx].theta;
    let targetStartTheta;
    if (forceRaw) {
        targetStartTheta = currentPatternStartTheta;
        const currentRotations = targetStartTheta / (Math.PI * 2);
        const circles = Math.floor(currentRotations);
        let remainder = currentRotations - circles;
        if (remainder < 0) remainder += 1; 
        let deg = Math.round(remainder * 360); if (deg === 360) deg = 0;
        circlesSlider.value = circles; circlesInput.value = circles; fineSlider.value = deg; fineInput.value = deg;
        let startRho = originalTrackData[idx].rho;
        const startPosRadios = document.getElementsByName('startPos');
        if (startRho > 0.5) { for (const r of startPosRadios) { if (r.value === 'center') r.checked = true; } } 
        else { for (const r of startPosRadios) { if (r.value === 'edge') r.checked = true; } }
    } else {
        targetStartTheta = (cleaningCircles + (degrees / 360.0)) * Math.PI * 2;
    }
    const delta = targetStartTheta - currentPatternStartTheta;
    let patternPoints = [];
    if (forceRaw) { patternPoints = originalTrackData.map(p => ({...p})); } 
    else { for (let i = idx; i < originalTrackData.length; i++) { let p = { ...originalTrackData[i] }; p.theta += delta; patternPoints.push(p); } }
    currentTrackData = [];
    if (doPreClean) {
        const startPos = document.querySelector('input[name="startPos"]:checked').value;
        const wipeStartRho = startPos === 'edge' ? 1.0 : 0.0;
        const wipeEndRho = (wipeStartRho > 0.5) ? 0.0 : 1.0;
        const patternStartRho = patternPoints.length > 0 ? patternPoints[0].rho : (startPos === 'edge' ? 0.0 : 1.0);

        // 1. Cleaning Spiral (Full Swipe)
        currentTrackData.push({ theta: 0.0, rho: wipeStartRho });
        currentTrackData.push({ theta: targetStartTheta, rho: wipeEndRho });

        // Start of BLUE rendering should be the end of the spiral
        cachedPatternStartIdx = 1; 

        // 2. Transfer Line (if needed) - This will be BLUE
        if (Math.abs(wipeEndRho - patternStartRho) > 0.001) {
            currentTrackData.push({ theta: targetStartTheta, rho: patternStartRho });
        }

        // Append Pattern
        if (patternPoints.length > 0) {
            const last = currentTrackData[currentTrackData.length - 1];
            const first = patternPoints[0];
            if (Math.abs(last.theta - first.theta) < 0.001 && Math.abs(last.rho - first.rho) < 0.001) {
                patternPoints.shift();
            }
        }
        currentTrackData = currentTrackData.concat(patternPoints);
        } else {
            currentTrackData = [...patternPoints]; cachedPatternStartIdx = 0;
    
            // Only restore/force a start point if the ORIGINAL data had one (idx > 0)
            // OR if the user explicitly wants one via Pre-Clean (handled in if-block above).
            // For "Keep as is" files (idx === 0), we do NOT add a point here.
            if (idx > 0) {
                const startPos = document.querySelector('input[name="startPos"]:checked').value;
                const desiredStartRho = startPos === 'edge' ? 1.0 : 0.0;
                currentTrackData.unshift({ theta: 0.0, rho: desiredStartRho });
                cachedPatternStartIdx = 1;
            }
        }
        if (currentTrackData.length === 0) currentTrackData.push({ theta: 0, rho: 0 });
        stopPlay(); playCursor = { index: 0, t: 0.0 }; lastDrawnPoint = null; fullRedraw(); updateStats();
    }
    
    function findStartIndex(data) {
        for (let i = 0; i < data.length; i++) {
            // Skip Center Start (0,0)
            if (Math.abs(data[i].theta) < 0.001 && Math.abs(data[i].rho) < 0.001) continue;
            // Skip Edge Start (rho ~ 1.0, theta ~ 0)
            if (Math.abs(data[i].theta) < 0.001 && Math.abs(data[i].rho - 1.0) < 0.001) continue;
            return i;
        }
        return 0;
    }
function normalizeTrack() { circlesSlider.value = 0; circlesInput.value = 0; fineSlider.value = 0; fineInput.value = 0; applyRotations(); }

function downloadTrack() {
    let content = ""; currentTrackData.forEach(p => { content += `${p.theta.toFixed(5)} ${p.rho.toFixed(5)}\n`; });
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nameParts = originalFilename.split('.');
    let newName = nameParts.length > 1 ? (nameParts.slice(0, -1).join('.') + '_mod.' + nameParts.pop()) : "track_modified.thr";
    a.href = url; a.download = newName; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
}

canvas.style.cursor = 'grab';
function getAngleFromEvent(e) { const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; const x = clientX - (rect.left + rect.width / 2); const y = clientY - (rect.top + rect.height / 2); let theta = Math.atan2(y, x); if (theta < 0) theta += Math.PI * 2; return (theta / (Math.PI * 2)) * 360; }
let isDragging = false;
canvas.addEventListener('mousedown', (e) => { isDragging = true; showRotationHint = false; canvas.style.cursor = 'grabbing'; handleDrag(e); });
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); isDragging = true; showRotationHint = false; handleDrag(e); });
window.addEventListener('mousemove', (e) => { if (isDragging) { e.preventDefault(); handleDrag(e); } });
window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; canvas.style.cursor = 'grab'; commitRotation(); } });
window.addEventListener('touchmove', (e) => { if (isDragging) { e.preventDefault(); handleDrag(e); } }, { passive: false });
window.addEventListener('touchend', () => { if (isDragging) { isDragging = false; commitRotation(); } });
function handleDrag(e) { const angle = getAngleFromEvent(e); fineSlider.value = Math.round(angle); fineInput.value = Math.round(angle); previewRotation(Math.round(angle)); }

function updateStats() {
    storedRotationStart = parseFloat(fineSlider.value) || 0;
    
    // Update Header Point Count
    const countEl = document.getElementById('headerPointCount');
    if (countEl) countEl.textContent = `(${currentTrackData.length.toLocaleString()} pts)`;
    
    // Update Slider
    progressSlider.max = Math.max(0, currentTrackData.length - 1);
    progressSlider.value = playCursor.index;

    if (currentTrackData.length > 0) {
        // Update the interactive code preview immediately
        updateCodeScroll(playCursor.index);
    }
}

dropZone.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') fileInput.click(); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); const files = e.dataTransfer.files; if (files.length) handleFiles(files); });
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFiles(e.target.files); });

// Mouse Wheel Scrubbing on Code Preview
codePreview.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    if (isPlaying) pausePlay();
    
    // Exit selection mode on scrub
    if (selectedIndex !== -1) {
        selectedIndex = -1;
    }

    const direction = e.deltaY > 0 ? 1 : -1;
    let newIndex = playCursor.index + direction;
    
    // Bounds check
    newIndex = Math.max(0, Math.min(newIndex, currentTrackData.length - 1));
    
    if (newIndex !== playCursor.index) {
        playCursor.index = newIndex;
        playCursor.t = 0.0;
        
        // Update View
        fullRedraw(newIndex);
        updateCodeScroll(newIndex);
        progressSlider.value = newIndex;
        
        // Update lastDrawnPoint for smooth continuation
        const p = currentTrackData[newIndex];
        lastDrawnPoint = getXY(p.theta, p.rho);
    }
}, { passive: false });

// --- UNDO & DELETE LOGIC ---

function updateUndoButton() {
    const btn = document.getElementById('undoBtn');
    if (btn) btn.textContent = `↩ (${undoStack.length})`;
}

function saveUndoState() {
    // Limit stack size to 50 to save memory
    if (undoStack.length > 50) undoStack.shift();
    // Deep copy current track data
    undoStack.push(currentTrackData.map(p => ({...p})));
    updateUndoButton();
}

function undo() {
    if (undoStack.length === 0) return;
    currentTrackData = undoStack.pop();
    updateUndoButton();
    selectedIndex = -1; // Reset selection
    
    // Always jump to end for easier comparison
    playCursor.index = currentTrackData.length - 1;
    playCursor.t = 1.0;
    lastDrawnPoint = null;
    
    fullRedraw(playCursor.index);
    updateStats();
    updateCodeScroll(playCursor.index);
    progressSlider.max = Math.max(0, currentTrackData.length - 1);
    progressSlider.value = playCursor.index;
}

function deletePoint(index) {
    if (isPlaying) pausePlay();
    saveUndoState();
    
    currentTrackData.splice(index, 1);
    selectedIndex = -1; // Deselect after delete
    
    // Reset range selection
    p1Index = -1;
    p2Index = -1;
    previewPath = null;
    if (rangeActions) rangeActions.style.display = 'none';
    
    if (playCursor.index >= currentTrackData.length) {
        playCursor.index = Math.max(0, currentTrackData.length - 1);
    } else if (index < playCursor.index) {
        playCursor.index--;
    }

    fullRedraw(playCursor.index);
    updateStats();
    updateCodeScroll(playCursor.index);
    progressSlider.max = Math.max(0, currentTrackData.length - 1);
    progressSlider.value = playCursor.index;
}

// Interaction on Code Preview (Select & Delete)
codePreview.addEventListener('click', (e) => {
    const line = e.target.closest('.code-line');
    if (!line) return;
    const idx = parseInt(line.dataset.index);
    if (isNaN(idx)) return;

    // Handle Delete
    if (e.target.classList.contains('delete-btn')) {
        deletePoint(idx);
        return;
    }
    
    // Handle Set P1
    if (e.target.classList.contains('set-p1-btn')) {
        p1Index = idx;
        // If P2 was set, clear it if it's invalid or just to be safe? 
        // Let's keep P2 if it's still distinct, otherwise clear.
        if (p1Index === p2Index) p2Index = -1;
        updateRangeUI();
        fullRedraw(playCursor.index);
        updateCodeScroll(playCursor.index);
        return;
    }

    // Handle Set P2
    if (e.target.classList.contains('set-p2-btn')) {
        p2Index = idx;
        updateRangeUI();
        fullRedraw(playCursor.index);
        updateCodeScroll(playCursor.index);
        return;
    }

    // Standard Selection (Click on row)
    // Don't deselect if clicking a button inside the row
    if (e.target.tagName === 'BUTTON') return;

    selectedIndex = idx;
    
    // Note: We do NOT set P1/P2 on simple click anymore.
    // We only set selectedIndex, which reveals the buttons.
    
    // Redraw
    fullRedraw(playCursor.index);
    updateCodeScroll(playCursor.index);
});

function updateRangeUI() {
    if (p1Index !== -1 && p2Index !== -1 && p1Index !== p2Index) {
        const start = Math.min(p1Index, p2Index);
        const end = Math.max(p1Index, p2Index);
        const count = end - start + 1;
        
        rangeCount.textContent = count;
        rangeActions.style.display = 'block';
        
        generateSmoothPath(start, end);
    } else {
        rangeActions.style.display = 'none';
        previewPath = null;
    }
}

function cancelRange() {
    p1Index = -1;
    p2Index = -1;
    previewPath = null;
    rangeActions.style.display = 'none';
    fullRedraw(playCursor.index);
    updateCodeScroll(playCursor.index);
}

function applySmoothing() {
    if (!previewPath || p1Index === -1 || p2Index === -1) return;
    
    saveUndoState();
    
    const start = Math.min(p1Index, p2Index);
    const end = Math.max(p1Index, p2Index);
    
    const args = [start, end - start + 1, ...previewPath];
    currentTrackData.splice.apply(currentTrackData, args);
    
    // Determine new indices after splice?
    // Actually, simply canceling the range is enough.
    
    cancelRange(); // Reset UI
    updateStats();
}

function generateSmoothPath(startIdx, endIdx) {
    const start = Math.min(startIdx, endIdx);
    const end = Math.max(startIdx, endIdx);
    
    if (end - start < 2) {
        previewPath = null;
        return;
    }

    const rangePoints = [];
    for (let i = start; i <= end; i++) {
        rangePoints.push({ ...currentTrackData[i] });
    }

    // Apply multiple passes of Laplacians/Moving Average smoothing
    // This preserves the general shape but pulls points towards the average of their neighbors
    const passes = 5;
    const strength = 0.5; // How much to move towards the average (0-1)

    let smoothed = rangePoints.map(p => ({ ...p }));

    for (let p = 0; p < passes; p++) {
        let nextPass = smoothed.map(p => ({ ...p }));
        
        // We keep the very first and very last point of the range fixed 
        // to ensure they stay connected to P1 and P2 exactly.
        for (let i = 1; i < smoothed.length - 1; i++) {
            const prev = smoothed[i - 1];
            const curr = smoothed[i];
            const next = smoothed[i + 1];

            // Average Theta and Rho
            // Note: For Theta we need to handle the wrap-around
            let avgRho = (prev.rho + next.rho) / 2;
            
            // Unwind next theta relative to prev to get correct average
            let unwoundNextTheta = next.theta;
            while (unwoundNextTheta - prev.theta > Math.PI) unwoundNextTheta -= Math.PI * 2;
            while (unwoundNextTheta - prev.theta < -Math.PI) unwoundNextTheta += Math.PI * 2;
            
            let avgTheta = (prev.theta + unwoundNextTheta) / 2;

            // Move current point towards average
            nextPass[i].rho = curr.rho + (avgRho - curr.rho) * strength;
            
            // Re-align current theta to be near the average
            let unwoundCurrTheta = curr.theta;
            while (unwoundCurrTheta - avgTheta > Math.PI) unwoundCurrTheta -= Math.PI * 2;
            while (unwoundCurrTheta - avgTheta < -Math.PI) unwoundCurrTheta += Math.PI * 2;
            
            nextPass[i].theta = unwoundCurrTheta + (avgTheta - unwoundCurrTheta) * strength;
        }
        smoothed = nextPass;
    }
    
    previewPath = smoothed;
}


// Right-Click to Delete (only on selected/target line)
codePreview.addEventListener('contextmenu', (e) => {
    const line = e.target.closest('.code-line');
    if (!line) return;
    
    const idx = parseInt(line.dataset.index);
    
    // Only allow context menu on the SELECTED line
    if (idx !== selectedIndex) {
        return; // Allow default menu or do nothing
    }
    
    e.preventDefault();
    deletePoint(idx);
});

function autoFixTrack() {
    if (currentTrackData.length < 3) return;
    
    const intensity = parseFloat(document.getElementById('fixStrength').value) || 0.025;
    const searchDist = parseInt(document.getElementById('fixWindow').value) || 25;
    const protectionLimit = parseFloat(document.getElementById('fixProtect').value) || 0.90;
    
    let passes = Math.floor(intensity * 300); 
    if (intensity > 0 && passes === 0) passes = 1;
    if (passes <= 0) return;

    saveUndoState();

    // 1. Store original thetas and convert to Cartesian
    const originalThetas = currentTrackData.map(p => p.theta);
    let coords = currentTrackData.map(p => getXY(p.theta, p.rho));
    const protectionMap = new Float32Array(coords.length).fill(1.0);
    
    // 2. Pre-calculate Anchor Protection (Geometric)
    for (let i = 1; i < coords.length - 1; i++) {
        const curr = coords[i];
        
        // Find lookback based on accumulated path distance
        let lookBackIdx = i - 1;
        let distAccumBack = 0;
        while (lookBackIdx > 0) {
            const d = Math.sqrt((coords[lookBackIdx+1].x - coords[lookBackIdx].x)**2 + (coords[lookBackIdx+1].y - coords[lookBackIdx].y)**2);
            distAccumBack += d;
            if (distAccumBack >= searchDist) break;
            lookBackIdx--;
        }
        
        // Find lookforward based on accumulated path distance
        let lookForwardIdx = i + 1;
        let distAccumForw = 0;
        while (lookForwardIdx < coords.length - 1) {
            const d = Math.sqrt((coords[lookForwardIdx].x - coords[lookForwardIdx-1].x)**2 + (coords[lookForwardIdx].y - coords[lookForwardIdx-1].y)**2);
            distAccumForw += d;
            if (distAccumForw >= searchDist) break;
            lookForwardIdx++;
        }
        
        const cStart = coords[lookBackIdx];
        const cEnd = coords[lookForwardIdx];
        
        const distDirect = Math.sqrt((cEnd.x - cStart.x)**2 + (cEnd.y - cStart.y)**2);
        const distPath = distAccumBack + distAccumForw;
        
        if (distPath > 0.1) {
            const ratio = distDirect / distPath;
            if (ratio < protectionLimit) {
                protectionMap[i] = 0.0; // Anchor!
            }
        }
    }

    // 3. Smooth in XY
    const strength = 0.5;
    for (let p = 0; p < passes; p++) {
        let nextCoords = coords.map(c => ({ ...c }));
        for (let i = 1; i < coords.length - 1; i++) {
            const localStrength = strength * protectionMap[i];
            if (localStrength <= 0) continue;
            
            const prev = coords[i - 1];
            const curr = coords[i];
            const next = coords[i + 1];
            
            // Skip large jumps (Cleaning Spiral)
            if (Math.sqrt((next.x - prev.x)**2 + (next.y - prev.y)**2) > MAX_RADIUS * 0.5) continue;

            nextCoords[i].x = curr.x + ((prev.x + next.x) / 2 - curr.x) * localStrength;
            nextCoords[i].y = curr.y + ((prev.y + next.y) / 2 - curr.y) * localStrength;
        }
        coords = nextCoords;
    }

    // 4. Convert back and ALIGN THE REGULAR WAY
    const newTrackData = coords.map((c, i) => {
        const relX = c.x - CENTER_X;
        const relY = c.y - CENTER_Y;
        let theta = Math.atan2(relY, relX);
        const rho = Math.sqrt(relX*relX + relY*relY) / MAX_RADIUS;
        
        // Restore Winding (Rotation count)
        const ref = originalThetas[i];
        while (theta - ref > Math.PI) theta -= Math.PI * 2;
        while (theta - ref < -Math.PI) theta += Math.PI * 2;
        
        return { theta, rho };
    });

    currentTrackData = newTrackData;
    cancelRange();
    fullRedraw();
    updateStats();
    updateCodeScroll(playCursor.index);
}

// Ctrl+Z for Undo
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
});

function toggleHelp() {
    const m = document.getElementById('helpModal');
    if (m.classList.contains('active')) {
        m.classList.remove('active');
    } else {
        m.classList.add('active');
    }
}