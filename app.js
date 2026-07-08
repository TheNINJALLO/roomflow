// --- STATE DEFINITIONS ---
const state = {
    rooms: [],
    sumpPumps: [],
    dischargeLines: [],
    capturedMeasurements: [],
    selectedRoomId: null,
    selectedSumpPumpId: null,
    selectedDischargeLineId: null,
    activeView: '2d', // '2d', '3d', 'ar'
    scale: 15,        // Pixels per foot
    offsetX: 0,       // Canvas pan offset X
    offsetY: 0,       // Canvas pan offset Y
    isDraggingCanvas: false,
    dragStartX: 0,
    dragStartY: 0,
    draggedRoomId: null,
    draggedHandle: null, // 'w', 'e', 'n', 's', 'nw', 'ne', 'se', 'sw' or 'move'
    draggedSumpPumpId: null,
    draggedDischargeHandle: null, // { id, point: 'p1' | 'p2' | 'move' }
    draggedOpening: null,        // { roomId, openingId }
    draggedVertex: null,         // { roomId, vertexIndex }
    drawMode: null,              // 'custom' or null
    sketchVertices: [],          // temporary drawing vertices
    sketchRedoVertices: [],      // temporary redo drawing vertices
    lastMouseWorldX: 0,          // live mouse positions for line previews
    lastMouseWorldY: 0,
    undoStack: [],
    redoStack: [],
    snapGridSize: 0.5,   // Snap to nearest 0.5 foot (6 inches)
    showGrid: true,
    initialMouseOffset: {}
};

// Preset dimensions (in feet)
const PRESETS = {
    living: { name: 'Living Room', w: 16, l: 20, h: 8, color: '#3b82f6' },
    bedroom: { name: 'Bedroom', w: 12, l: 14, h: 8, color: '#8b5cf6' },
    kitchen: { name: 'Kitchen', w: 12, l: 12, h: 8, color: '#10b981' },
    bathroom: { name: 'Bathroom', w: 8, l: 8, h: 8, color: '#f59e0b' },
    hallway: { name: 'Hallway', w: 4, l: 16, h: 8, color: '#6b7280' },
    closet: { name: 'Closet', w: 4, l: 6, h: 8, color: '#10b981' },
    staircase: { name: 'Staircase', w: 3.5, l: 12, h: 8, color: '#f43f5e', steps: 12 },
    custom: { name: 'Custom Room', w: 10, l: 10, h: 8, color: '#ec4899' }
};

// Canvas Setup
const canvas = document.getElementById('sketch-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');

// Resize Canvas
function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    draw();
}

// Coordinate Conversions
function toCanvasX(worldX) {
    return (worldX * state.scale) + state.offsetX + (canvas.width / 2);
}

function toCanvasY(worldY) {
    return (worldY * state.scale) + state.offsetY + (canvas.height / 2);
}

function toWorldX(canvasX) {
    return (canvasX - state.offsetX - (canvas.width / 2)) / state.scale;
}

function toWorldY(canvasY) {
    return (canvasY - state.offsetY - (canvas.height / 2)) / state.scale;
}

// Snap value to nearest grid size
function snap(val) {
    return Math.round(val / state.snapGridSize) * state.snapGridSize;
}

// Generate unique ID
function generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
}

// Add Room Function
function addRoom(type) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const preset = PRESETS[type];
    const newRoom = {
        id: generateId(),
        name: preset.name,
        type: type,
        w: preset.w,
        l: preset.l,
        h: preset.h,
        x: snap(toWorldX(canvas.width / 2) - preset.w / 2),
        y: snap(toWorldY(canvas.height / 2) - preset.l / 2),
        color: preset.color,
        openings: []
    };
    if (preset.steps) {
        newRoom.steps = preset.steps;
    }
    state.rooms.push(newRoom);
    selectItem('room', newRoom.id);
    centerOnRoom(newRoom);
    draw();
    updateGlobalStats();
    
    if (window.sync3D) window.sync3D();
}

function centerOnRoom(room) {
    state.offsetX = -(room.x + room.w / 2) * state.scale;
    state.offsetY = -(room.y + room.l / 2) * state.scale;
}

// Add Sump Pump
function addSumpPump() {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const newPump = {
        id: generateId(),
        name: `Sump Pump ${state.sumpPumps.length + 1}`,
        x: snap(toWorldX(canvas.width / 2)),
        y: snap(toWorldY(canvas.height / 2))
    };
    state.sumpPumps.push(newPump);
    selectItem('sump', newPump.id);
    draw();
    updateGlobalStats();
}

// Add Discharge Line
function addDischargeLine() {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const cx = snap(toWorldX(canvas.width / 2));
    const cy = snap(toWorldY(canvas.height / 2));
    const newLine = {
        id: generateId(),
        label: `Discharge Line ${state.dischargeLines.length + 1}`,
        x1: cx - 3,
        y1: cy,
        x2: cx + 3,
        y2: cy,
        length: 6.0
    };
    state.dischargeLines.push(newLine);
    selectItem('discharge', newLine.id);
    draw();
    updateGlobalStats();
}

// Selection Manager
function selectItem(type, id) {
    state.selectedRoomId = (type === 'room') ? id : null;
    state.selectedSumpPumpId = (type === 'sump') ? id : null;
    state.selectedDischargeLineId = (type === 'discharge') ? id : null;
    
    const roomFields = document.getElementById('room-edit-fields');
    const sumpFields = document.getElementById('sump-edit-fields');
    const dischargeFields = document.getElementById('discharge-edit-fields');
    const noSel = document.getElementById('no-selection-msg');
    
    const btnAddDoor = document.getElementById('btn-add-door');
    const btnAddWindow = document.getElementById('btn-add-window');
    
    // Hide all
    roomFields.classList.add('hidden');
    sumpFields.classList.add('hidden');
    dischargeFields.classList.add('hidden');
    noSel.classList.remove('hidden');
    btnAddDoor.disabled = true;
    btnAddWindow.disabled = true;
    
    if (type === 'room' && id) {
        const room = state.rooms.find(r => r.id === id);
        if (room) {
            noSel.classList.add('hidden');
            roomFields.classList.remove('hidden');
            
            document.getElementById('room-name-input').value = room.name;
            document.getElementById('room-h-input').value = room.h;
            
            const rectInputs = document.getElementById('room-rect-inputs');
            const customInputs = document.getElementById('room-custom-walls-inputs');
            
            if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
                rectInputs.classList.add('hidden');
                customInputs.classList.remove('hidden');
                
                const container = document.getElementById('custom-walls-list-container');
                container.innerHTML = '';
                for (let i = 0; i < room.vertices.length; i++) {
                    const v1 = room.vertices[i];
                    const v2 = room.vertices[(i + 1) % room.vertices.length];
                    const dx = v2.x - v1.x;
                    const dy = v2.y - v1.y;
                    const currentLength = Math.sqrt(dx*dx + dy*dy);
                    
                    const div = document.createElement('div');
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.style.alignItems = 'center';
                    div.style.marginBottom = '0.3rem';
                    div.style.padding = '0.2rem 0.5rem';
                    div.style.background = 'rgba(255,255,255,0.02)';
                    div.style.border = '1px solid var(--border-color)';
                    div.style.borderRadius = '6px';
                    div.innerHTML = `
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">Wall ${i + 1}</span>
                        <input type="number" step="0.5" min="0.5" value="${currentLength.toFixed(1)}" 
                            style="width: 75px; padding: 0.15rem 0.35rem; font-family: var(--font-mono); font-weight:600; font-size: 0.75rem; background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:4px; color:var(--accent-teal); text-align:right;"
                            onchange="changeCustomWallLength('${room.id}', ${i}, this.value)">
                    `;
                    container.appendChild(div);
                }
            } else {
                rectInputs.classList.remove('hidden');
                customInputs.classList.add('hidden');
                document.getElementById('room-w-input').value = room.w;
                document.getElementById('room-l-input').value = room.l;
            }
            
            const stepsGroup = document.getElementById('room-steps-group');
            if (room.type === 'staircase') {
                stepsGroup.classList.remove('hidden');
                document.getElementById('room-steps-input').value = room.steps || 12;
            } else {
                stepsGroup.classList.add('hidden');
            }
            
            btnAddDoor.disabled = false;
            btnAddWindow.disabled = false;
            updateRoomEstimates(room);
        }
    } else if (type === 'sump' && id) {
        const sump = state.sumpPumps.find(p => p.id === id);
        if (sump) {
            noSel.classList.add('hidden');
            sumpFields.classList.remove('hidden');
            document.getElementById('sump-name-input').value = sump.name;
        }
    } else if (type === 'discharge' && id) {
        const dl = state.dischargeLines.find(l => l.id === id);
        if (dl) {
            noSel.classList.add('hidden');
            dischargeFields.classList.remove('hidden');
            document.getElementById('discharge-label-input').value = dl.label;
            document.getElementById('discharge-len-input').value = dl.length.toFixed(1);
        }
    }
    
    // Toggle estimator panel visibility
    const estList = document.getElementById('estimations-list');
    const noEstMsg = document.getElementById('no-estimates-msg');
    if (type === 'room' && id) {
        estList.classList.remove('hidden');
        noEstMsg.classList.add('hidden');
    } else {
        estList.classList.add('hidden');
        noEstMsg.classList.remove('hidden');
    }

    // On mobile, if something is selected, slide open the details drawer
    if (type && id && window.innerWidth <= 900) {
        if (typeof leftSidebar !== 'undefined' && typeof rightSidebar !== 'undefined' && typeof backdrop !== 'undefined') {
            leftSidebar.classList.remove('open');
            rightSidebar.classList.add('open');
            backdrop.classList.remove('hidden');
        }
    }
    
    draw();
}

// Fallback mapper
function selectRoom(id) {
    selectItem('room', id);
}

// Add Openings (Doors/Windows)
function addOpening(type) {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (!room) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();

    let bestWall;
    let maxOffset;

    if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
        // Custom room: Find the wall segment (index) with the fewest openings
        const wallCounts = {};
        for (let i = 0; i < room.vertices.length; i++) {
            wallCounts[i] = 0;
        }
        room.openings.forEach(op => {
            const idx = parseInt(op.wall);
            if (!isNaN(idx) && idx in wallCounts) {
                wallCounts[idx]++;
            }
        });
        
        let minCount = Infinity;
        let selectedIdx = 0;
        for (let i = 0; i < room.vertices.length; i++) {
            if (wallCounts[i] < minCount) {
                minCount = wallCounts[i];
                selectedIdx = i;
            }
        }
        bestWall = selectedIdx.toString();
        
        const v1 = room.vertices[selectedIdx];
        const v2 = room.vertices[(selectedIdx + 1) % room.vertices.length];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        maxOffset = Math.sqrt(dx*dx + dy*dy);
    } else {
        const walls = ['n', 'e', 's', 'w'];
        const wallCounts = { n: 0, e: 0, s: 0, w: 0 };
        room.openings.forEach(op => wallCounts[op.wall]++);
        bestWall = walls.reduce((a, b) => wallCounts[a] <= wallCounts[b] ? a : b);
        maxOffset = (bestWall === 'n' || bestWall === 's') ? room.w : room.l;
    }

    const width = type === 'door' ? 3.0 : 4.0;
    const height = type === 'door' ? 6.8 : 4.0;
    const offset = snap(maxOffset / 2);

    room.openings.push({
        id: generateId(),
        type: type,
        wall: bestWall,
        offset: offset,
        w: width,
        h: height
    });

    updateRoomEstimates(room);
    draw();
    if (window.sync3D) window.sync3D();
}

// Remove Opening
function removeOpening(openingId) {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (!room) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();

    room.openings = room.openings.filter(op => op.id !== openingId);
    updateRoomEstimates(room);
    draw();
    if (window.sync3D) window.sync3D();
}

// Update Opening inline values
window.updateOpening = function(roomId, openingId, property, value) {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return;
    const op = room.openings.find(o => o.id === openingId);
    if (!op) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    
    if (property === 'wall') {
        op.wall = value;
        const maxOffset = (value === 'n' || value === 's') ? room.w : room.l;
        op.offset = snap(maxOffset / 2);
    } else if (property === 'offset') {
        const maxOffset = (op.wall === 'n' || op.wall === 's') ? room.w : room.l;
        op.offset = Math.min(maxOffset - op.w/2, Math.max(op.w/2, snap(parseFloat(value))));
    } else if (property === 'w') {
        op.w = Math.max(0.5, parseFloat(value));
    } else if (property === 'h') {
        op.h = Math.max(0.5, parseFloat(value));
    }
    
    updateRoomEstimates(room);
    draw();
    if (window.sync3D) window.sync3D();
};

function getPolygonArea(vertices) {
    if (!vertices || vertices.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        area += v1.x * v2.y - v2.x * v1.y;
    }
    return Math.abs(area / 2);
}

function getPolygonPerimeter(vertices) {
    if (!vertices || vertices.length < 2) return 0;
    let perimeter = 0;
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        perimeter += Math.sqrt(dx*dx + dy*dy);
    }
    return perimeter;
}

// Calculate Estimates
function updateRoomEstimates(room) {
    let floorArea, perimeter;
    if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
        floorArea = getPolygonArea(room.vertices);
        perimeter = getPolygonPerimeter(room.vertices);
    } else {
        floorArea = room.w * room.l;
        perimeter = 2 * (room.w + room.l);
    }
    const ceilingArea = floorArea;
    const volume = room.type === 'staircase' ? 0.5 * floorArea * room.h : floorArea * room.h;
    
    // Gross Wall Area
    let grossWallArea;
    if (room.type === 'staircase') {
        grossWallArea = (room.l * room.h) + (room.w * room.h);
    } else {
        grossWallArea = perimeter * room.h;
    }
    
    // Deductions
    let totalDeductions = 0;
    const deductionsUl = document.getElementById('deductions-ul');
    deductionsUl.innerHTML = '';

    room.openings.forEach(op => {
        const area = op.w * op.h;
        totalDeductions += area;

        const li = document.createElement('li');
        li.className = 'opening-edit-card';
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-weight:600; color:var(--text-primary); font-size:0.75rem;">${op.type.toUpperCase()}</span>
                <button onclick="removeOpening('${op.id}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer;" title="Delete"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
            </div>
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 0.25rem;">
                <div>
                    <label>Wall</label>
                    <select onchange="updateOpening('${room.id}', '${op.id}', 'wall', this.value)">
                        <option value="n" ${op.wall === 'n' ? 'selected' : ''}>N</option>
                        <option value="e" ${op.wall === 'e' ? 'selected' : ''}>E</option>
                        <option value="s" ${op.wall === 's' ? 'selected' : ''}>S</option>
                        <option value="w" ${op.wall === 'w' ? 'selected' : ''}>W</option>
                    </select>
                </div>
                <div>
                    <label>Offset</label>
                    <input type="number" step="0.5" value="${op.offset}" oninput="updateOpening('${room.id}', '${op.id}', 'offset', this.value)">
                </div>
                <div>
                    <label>Width</label>
                    <input type="number" step="0.5" value="${op.w}" oninput="updateOpening('${room.id}', '${op.id}', 'w', this.value)">
                </div>
                <div>
                    <label>Height</label>
                    <input type="number" step="0.5" value="${op.h}" oninput="updateOpening('${room.id}', '${op.id}', 'h', this.value)">
                </div>
            </div>
        `;
        deductionsUl.appendChild(li);
    });
    lucide.createIcons();

    const netWallArea = Math.max(0, grossWallArea - totalDeductions);

    // Update UI
    document.getElementById('metric-floor-area').innerText = `${floorArea.toFixed(1)} sq ft`;
    document.getElementById('metric-wall-area').innerText = `${netWallArea.toFixed(1)} sq ft (${grossWallArea.toFixed(1)} gross)`;
    document.getElementById('metric-ceiling-area').innerText = `${ceilingArea.toFixed(1)} sq ft`;
    document.getElementById('metric-perimeter').innerText = `${perimeter.toFixed(1)} ft`;
    document.getElementById('metric-volume').innerText = `${volume.toFixed(1)} cu ft`;

    updateGlobalStats();
}

function updateGlobalStats() {
    const totalRooms = state.rooms.length;
    let totalFloorArea = 0;
    let totalWallArea = 0;

    state.rooms.forEach(room => {
        let floorArea, perimeter;
        if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
            floorArea = getPolygonArea(room.vertices);
            perimeter = getPolygonPerimeter(room.vertices);
        } else {
            floorArea = room.w * room.l;
            perimeter = 2 * (room.w + room.l);
        }
        totalFloorArea += floorArea;
        
        let grossWallArea;
        if (room.type === 'staircase') {
            grossWallArea = (room.l * room.h) + (room.w * room.h);
        } else {
            grossWallArea = perimeter * room.h;
        }
        let deductions = 0;
        room.openings.forEach(op => { deductions += op.w * op.h; });
        totalWallArea += Math.max(0, grossWallArea - deductions);
    });

    document.getElementById('total-rooms-count').innerText = totalRooms;
    document.getElementById('total-floor-area').innerText = `${totalFloorArea.toFixed(1)} sq ft`;
    document.getElementById('total-wall-area').innerText = `${totalWallArea.toFixed(1)} sq ft`;
    
    // Sump & Discharge totals
    let totalSumpCount = state.sumpPumps.length;
    let totalDischargeLen = 0;
    state.dischargeLines.forEach(dl => { totalDischargeLen += dl.length; });
    
    document.getElementById('total-sumps-count').innerText = totalSumpCount;
    document.getElementById('total-discharge-length').innerText = `${totalDischargeLen.toFixed(1)} ft`;
}

// Delete Selected Items
function deleteSelectedRoom() {
    if (!state.selectedRoomId) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.rooms = state.rooms.filter(r => r.id !== state.selectedRoomId);
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
}

function deleteSelectedSump() {
    if (!state.selectedSumpPumpId) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.sumpPumps = state.sumpPumps.filter(p => p.id !== state.selectedSumpPumpId);
    selectItem(null);
    draw();
    updateGlobalStats();
}

function deleteSelectedDischarge() {
    if (!state.selectedDischargeLineId) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.dischargeLines = state.dischargeLines.filter(l => l.id !== state.selectedDischargeLineId);
    selectItem(null);
    draw();
    updateGlobalStats();
}

// Helper: Distance from point to segment
function getDistanceToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1)**2 + (y2 - y1)**2;
    if (l2 === 0) return Math.sqrt((px - x1)**2 + (py - y1)**2);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.sqrt((px - projX)**2 + (py - projY)**2);
}

// --- DRAWING ENGINE ---
function draw(isPrinting = false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (isPrinting) {
        ctx.fillStyle = '#0d111a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    if (state.showGrid) {
        drawGrid();
    }
    
    if (!isPrinting && state.draggedRoomId && state.draggedHandle === 'move') {
        drawSnappingGuidelines();
    }

    // 1. Draw rooms
    state.rooms.forEach(room => {
        drawRoom(room);
    });

    // Draw committed segments of current custom drawing in progress
    if (state.drawMode === 'custom' && state.sketchVertices.length > 0) {
        ctx.strokeStyle = '#a855f7'; // Purple sketch lines
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(toCanvasX(state.sketchVertices[0].x), toCanvasY(state.sketchVertices[0].y));
        for (let i = 1; i < state.sketchVertices.length; i++) {
            ctx.lineTo(toCanvasX(state.sketchVertices[i].x), toCanvasY(state.sketchVertices[i].y));
        }
        ctx.stroke();

        // Draw live preview segment from last vertex to current mouse position
        const lastV = state.sketchVertices[state.sketchVertices.length - 1];
        const previewX = toCanvasX(state.lastMouseWorldX);
        const previewY = toCanvasY(state.lastMouseWorldY);

        ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)'; // Dashed preview line
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(toCanvasX(lastV.x), toCanvasY(lastV.y));
        ctx.lineTo(previewX, previewY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Show live length and angle next to preview segment
        const dx = state.lastMouseWorldX - lastV.x;
        const dy = state.lastMouseWorldY - lastV.y;
        const liveDist = Math.sqrt(dx*dx + dy*dy);
        let liveAngle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
        if (liveAngle < 0) liveAngle += 360;

        ctx.fillStyle = '#a855f7';
        ctx.font = '600 10px var(--font-mono)';
        ctx.fillText(` ${liveDist.toFixed(1)} ft @ ${liveAngle}°`, previewX + 10, previewY - 5);

        // Draw vertex nodes
        state.sketchVertices.forEach(v => {
            ctx.fillStyle = '#a855f7';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(toCanvasX(v.x), toCanvasY(v.y), 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    // 2. Draw discharge lines
    state.dischargeLines.forEach(dl => {
        const x1 = toCanvasX(dl.x1);
        const y1 = toCanvasY(dl.y1);
        const x2 = toCanvasX(dl.x2);
        const y2 = toCanvasY(dl.y2);
        const isSelected = dl.id === state.selectedDischargeLineId;
        
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : '#3b82f6';
        ctx.lineWidth = isSelected ? 4 : 2.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // Dashed inner plumbing look
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw endpoints if selected
        if (isSelected) {
            ctx.fillStyle = varColor('--accent-teal');
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.fillRect(x1 - 5, y1 - 5, 10, 10);
            ctx.strokeRect(x1 - 5, y1 - 5, 10, 10);
            ctx.fillRect(x2 - 5, y2 - 5, 10, 10);
            ctx.strokeRect(x2 - 5, y2 - 5, 10, 10);
        }
        
        // Draw length label
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        
        ctx.save();
        ctx.translate(mx, my);
        let textAngle = angle;
        if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
            textAngle += Math.PI;
        }
        ctx.rotate(textAngle);
        
        const label = `${dl.label}: ${dl.length.toFixed(1)} ft`;
        ctx.font = '600 10px var(--font-mono)';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(10, 13, 20, 0.8)';
        ctx.fillRect(-textWidth/2 - 4, -14, textWidth + 8, 14);
        
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, -4);
        ctx.restore();
    });

    // 3. Draw sump pumps
    state.sumpPumps.forEach(sp => {
        const cx = toCanvasX(sp.x);
        const cy = toCanvasY(sp.y);
        const isSelected = sp.id === state.selectedSumpPumpId;
        const radius = 13;
        
        // Outer glow
        if (isSelected) {
            ctx.shadowColor = varColor('--accent-teal');
            ctx.shadowBlur = 10;
        }
        
        // Outer ring
        ctx.fillStyle = 'rgba(16, 22, 35, 0.9)';
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : '#f59e0b';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
        
        // Inner dotted ring
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 8px var(--font-sans)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SP', cx, cy);
        
        // Floating label
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : varColor('--text-muted');
        ctx.font = '600 9px var(--font-sans)';
        ctx.fillText(sp.name, cx, cy - radius - 6);
    });
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    
    const startX = toWorldX(0);
    const endX = toWorldX(canvas.width);
    const startY = toWorldY(0);
    const endY = toWorldY(canvas.height);
    const gridStep = 1;
    
    for (let x = Math.floor(startX); x <= Math.ceil(endX); x += gridStep) {
        ctx.beginPath();
        ctx.strokeStyle = x % 5 === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)';
        ctx.moveTo(toCanvasX(x), 0);
        ctx.lineTo(toCanvasX(x), canvas.height);
        ctx.stroke();
    }
    
    for (let y = Math.floor(startY); y <= Math.ceil(endY); y += gridStep) {
        ctx.beginPath();
        ctx.strokeStyle = y % 5 === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)';
        ctx.moveTo(0, toCanvasY(y));
        ctx.lineTo(canvas.width, toCanvasY(y));
        ctx.stroke();
    }
}

function drawRoom(room) {
    const rx = toCanvasX(room.x);
    const ry = toCanvasY(room.y);
    const rw = room.w * state.scale;
    const rl = room.l * state.scale;
    const isSelected = room.id === state.selectedRoomId;

    if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
        // --- Render Custom Polygon Room ---
        ctx.fillStyle = room.color + '15';
        ctx.beginPath();
        ctx.moveTo(toCanvasX(room.x + room.vertices[0].x), toCanvasY(room.y + room.vertices[0].y));
        for (let i = 1; i < room.vertices.length; i++) {
            ctx.lineTo(toCanvasX(room.x + room.vertices[i].x), toCanvasY(room.y + room.vertices[i].y));
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.stroke();

        // Calculate Average center for Room Name Label
        let sumX = 0, sumY = 0;
        room.vertices.forEach(v => { sumX += v.x; sumY += v.y; });
        const avgX = room.x + sumX / room.vertices.length;
        const avgY = room.y + sumY / room.vertices.length;

        ctx.fillStyle = isSelected ? '#ffffff' : varColor('--text-muted');
        ctx.font = `600 13px var(--font-sans)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(room.name, toCanvasX(avgX), toCanvasY(avgY));

        // Draw wall segment lengths
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = `500 9px var(--font-mono)`;
        for (let i = 0; i < room.vertices.length; i++) {
            const v1 = room.vertices[i];
            const v2 = room.vertices[(i + 1) % room.vertices.length];
            const mx = room.x + (v1.x + v2.x) / 2;
            const my = room.y + (v1.y + v2.y) / 2;
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const wallLength = Math.sqrt(dx*dx + dy*dy);

            ctx.save();
            ctx.translate(toCanvasX(mx), toCanvasY(my));
            let textAng = Math.atan2(dy, dx);
            if (textAng > Math.PI / 2 || textAng < -Math.PI / 2) textAng += Math.PI;
            ctx.rotate(textAng);
            ctx.fillText(`${wallLength.toFixed(1)} ft`, 0, -6);
            ctx.restore();
        }

        // Draw openings
        room.openings.forEach(op => {
            drawOpeningOnWall(room, op);
        });

        // Draw vertex edit handles
        if (isSelected) {
            room.vertices.forEach((v, idx) => {
                const vx = toCanvasX(room.x + v.x);
                const vy = toCanvasY(room.y + v.y);
                ctx.fillStyle = '#a855f7';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(vx, vy, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        }
        return;
    }

    // Room Body Fill
    ctx.fillStyle = room.color + '15';
    ctx.fillRect(rx, ry, rw, rl);

    // Draw staircase steps
    if (room.type === 'staircase') {
        const stepCount = room.steps || 12;
        const stepSize = rl / stepCount;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 1; i < stepCount; i++) {
            ctx.beginPath();
            ctx.moveTo(rx, ry + i * stepSize);
            ctx.lineTo(rx + rw, ry + i * stepSize);
            ctx.stroke();
        }
        
        ctx.strokeStyle = varColor('--accent-teal') || '#00ffd1';
        ctx.lineWidth = 2;
        ctx.fillStyle = varColor('--accent-teal') || '#00ffd1';
        
        const arrowX = rx + rw / 2;
        const arrowStart = ry + rl * 0.8;
        const arrowEnd = ry + rl * 0.2;
        
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowStart);
        ctx.lineTo(arrowX, arrowEnd);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(arrowX - 5, arrowEnd + 8);
        ctx.lineTo(arrowX, arrowEnd);
        ctx.lineTo(arrowX + 5, arrowEnd + 8);
        ctx.stroke();

        ctx.fillStyle = varColor('--accent-teal') || '#00ffd1';
        ctx.font = '600 9px var(--font-sans)';
        ctx.textAlign = 'center';
        ctx.fillText('UP', arrowX, arrowEnd - 10);
    }

    // Room Outline
    ctx.strokeStyle = isSelected ? varColor('--accent-teal') : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.strokeRect(rx, ry, rw, rl);

    // Label
    ctx.fillStyle = isSelected ? '#ffffff' : varColor('--text-muted');
    ctx.font = `600 13px var(--font-sans)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(room.name, rx + rw / 2, ry + rl / 2 - 8);

    // Sublabel
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `500 11px var(--font-mono)`;
    ctx.fillText(`${room.w}' x ${room.l}'`, rx + rw / 2, ry + rl / 2 + 10);

    // Wall measurements
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `500 10px var(--font-mono)`;
    
    // North wall
    ctx.fillText(`${room.w} ft`, rx + rw / 2, ry - 8);
    // South wall
    ctx.fillText(`${room.w} ft`, rx + rw / 2, ry + rl + 12);
    // West wall
    ctx.save();
    ctx.translate(rx - 10, ry + rl / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${room.l} ft`, 0, 0);
    ctx.restore();
    // East wall
    ctx.save();
    ctx.translate(rx + rw + 14, ry + rl / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(`${room.l} ft`, 0, 0);
    ctx.restore();

    room.openings.forEach(op => {
        drawOpeningOnWall(room, op);
    });

    if (isSelected) {
        drawResizeHandles(rx, ry, rw, rl);
    }
}

function drawOpeningOnWall(room, op) {
    const rx = toCanvasX(room.x);
    const ry = toCanvasY(room.y);
    const rw = room.w * state.scale;
    const rl = room.l * state.scale;
    
    let opX, opY, opW, opH;
    const widthPix = op.w * state.scale;
    const thickness = 6;

    if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
        const wallIdx = parseInt(op.wall);
        if (isNaN(wallIdx) || wallIdx < 0 || wallIdx >= room.vertices.length) return;
        
        const v1 = room.vertices[wallIdx];
        const v2 = room.vertices[(wallIdx + 1) % room.vertices.length];
        
        const angle = Math.atan2(v2.y - v1.y, v2.x - v1.x);
        const wx = room.x + v1.x + op.offset * Math.cos(angle);
        const wy = room.y + v1.y + op.offset * Math.sin(angle);
        const cx = toCanvasX(wx);
        const cy = toCanvasY(wy);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = op.type === 'door' ? '#f59e0b' : '#06b6d4';
        ctx.fillRect(-widthPix / 2, -thickness / 2, widthPix, thickness);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-widthPix / 2, -thickness / 2, widthPix, thickness);
        ctx.restore();
        return;
    }

    if (op.wall === 'n') {
        opX = rx + (op.offset * state.scale) - (widthPix / 2);
        opY = ry - thickness / 2;
        opW = widthPix;
        opH = thickness;
    } else if (op.wall === 's') {
        opX = rx + (op.offset * state.scale) - (widthPix / 2);
        opY = ry + rl - thickness / 2;
        opW = widthPix;
        opH = thickness;
    } else if (op.wall === 'w') {
        opX = rx - thickness / 2;
        opY = ry + (op.offset * state.scale) - (widthPix / 2);
        opW = thickness;
        opH = widthPix;
    } else if (op.wall === 'e') {
        opX = rx + rw - thickness / 2;
        opY = ry + (op.offset * state.scale) - (widthPix / 2);
        opW = thickness;
        opH = widthPix;
    }

    ctx.fillStyle = op.type === 'door' ? '#f59e0b' : '#06b6d4';
    ctx.fillRect(opX, opY, opW, opH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(opX, opY, opW, opH);

    if (op.type === 'door') {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (op.wall === 'n') {
            ctx.arc(opX, opY, widthPix, 0, Math.PI / 2);
        } else if (op.wall === 's') {
            ctx.arc(opX, opY + thickness, widthPix, -Math.PI / 2, 0);
        } else if (op.wall === 'w') {
            ctx.arc(opX, opY, widthPix, 0, Math.PI / 2);
        } else if (op.wall === 'e') {
            ctx.arc(opX + thickness, opY, widthPix, Math.PI / 2, Math.PI);
        }
        ctx.stroke();
    }
}

function drawResizeHandles(rx, ry, rw, rl) {
    const handleSize = 8;
    ctx.fillStyle = varColor('--accent-teal');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    const corners = {
        nw: { x: rx, y: ry },
        ne: { x: rx + rw, y: ry },
        se: { x: rx + rw, y: ry + rl },
        sw: { x: rx, y: ry + rl }
    };

    const sides = {
        n: { x: rx + rw / 2, y: ry },
        s: { x: rx + rw / 2, y: ry + rl },
        w: { x: rx, y: ry + rl / 2 },
        e: { x: rx + rw, y: ry + rl / 2 }
    };

    for (let c in corners) {
        ctx.fillRect(corners[c].x - handleSize/2, corners[c].y - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(corners[c].x - handleSize/2, corners[c].y - handleSize/2, handleSize, handleSize);
    }

    ctx.fillStyle = varColor('--accent-blue');
    for (let s in sides) {
        ctx.fillRect(sides[s].x - handleSize/2, sides[s].y - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(sides[s].x - handleSize/2, sides[s].y - handleSize/2, handleSize, handleSize);
    }
}

function drawSnappingGuidelines() {
    const draggedRoom = state.rooms.find(r => r.id === state.draggedRoomId);
    if (!draggedRoom) return;

    ctx.strokeStyle = 'rgba(0, 255, 209, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    state.rooms.forEach(r => {
        if (r.id === draggedRoom.id) return;

        const rEdges = { left: r.x, right: r.x + r.w, top: r.y, bottom: r.y + r.l };
        const dEdges = { left: draggedRoom.x, right: draggedRoom.x + draggedRoom.w, top: draggedRoom.y, bottom: draggedRoom.y + draggedRoom.l };

        if (Math.abs(dEdges.left - rEdges.left) < 0.1 || Math.abs(dEdges.left - rEdges.right) < 0.1) {
            ctx.beginPath();
            ctx.moveTo(toCanvasX(dEdges.left), 0);
            ctx.lineTo(toCanvasX(dEdges.left), canvas.height);
            ctx.stroke();
        }
        if (Math.abs(dEdges.right - rEdges.left) < 0.1 || Math.abs(dEdges.right - rEdges.right) < 0.1) {
            ctx.beginPath();
            ctx.moveTo(toCanvasX(dEdges.right), 0);
            ctx.lineTo(toCanvasX(dEdges.right), canvas.height);
            ctx.stroke();
        }
        if (Math.abs(dEdges.top - rEdges.top) < 0.1 || Math.abs(dEdges.top - rEdges.bottom) < 0.1) {
            ctx.beginPath();
            ctx.moveTo(0, toCanvasY(dEdges.top));
            ctx.lineTo(canvas.width, toCanvasY(dEdges.top));
            ctx.stroke();
        }
        if (Math.abs(dEdges.bottom - rEdges.top) < 0.1 || Math.abs(dEdges.bottom - rEdges.bottom) < 0.1) {
            ctx.beginPath();
            ctx.moveTo(0, toCanvasY(dEdges.bottom));
            ctx.lineTo(canvas.width, toCanvasY(dEdges.bottom));
            ctx.stroke();
        }
    });

    ctx.setLineDash([]);
}

function varColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isPointInPolygon(p, polygon) {
    let isInside = false;
    const minX = Math.min(...polygon.map(v => v.x));
    const maxX = Math.max(...polygon.map(v => v.x));
    const minY = Math.min(...polygon.map(v => v.y));
    const maxY = Math.max(...polygon.map(v => v.y));
    
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        return false;
    }
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

function getHitHandle(room, worldX, worldY) {
    if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
        // For custom polygon rooms, checking polygon boundary hit
        const inside = isPointInPolygon({ x: worldX - room.x, y: worldY - room.y }, room.vertices);
        return inside ? 'move' : null;
    }

    const tolerance = 8 / state.scale;
    const rx = room.x;
    const ry = room.y;
    const rw = room.w;
    const rl = room.l;

    if (Math.abs(worldX - rx) < tolerance && Math.abs(worldY - ry) < tolerance) return 'nw';
    if (Math.abs(worldX - (rx + rw)) < tolerance && Math.abs(worldY - ry) < tolerance) return 'ne';
    if (Math.abs(worldX - (rx + rw)) < tolerance && Math.abs(worldY - (ry + rl)) < tolerance) return 'se';
    if (Math.abs(worldX - rx) < tolerance && Math.abs(worldY - (ry + rl)) < tolerance) return 'sw';

    if (Math.abs(worldX - (rx + rw / 2)) < tolerance && Math.abs(worldY - ry) < tolerance) return 'n';
    if (Math.abs(worldX - (rx + rw / 2)) < tolerance && Math.abs(worldY - (ry + rl)) < tolerance) return 's';
    if (Math.abs(worldX - rx) < tolerance && Math.abs(worldY - (ry + rl / 2)) < tolerance) return 'w';
    if (Math.abs(worldX - (rx + rw)) < tolerance && Math.abs(worldY - (ry + rl / 2)) < tolerance) return 'e';

    if (worldX > rx && worldX < rx + rw && worldY > ry && worldY < ry + rl) {
        return 'move';
    }

    return null;
}

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = toWorldX(mx);
    const wy = toWorldY(my);

    // Save history snapshot in case dragging starts
    if (typeof getHistorySnapshot === 'function') {
        state.dragSnapshot = getHistorySnapshot();
    }

    // Sketching custom rooms mode mousedown handler
    if (state.drawMode === 'custom') {
        const snapX = snap(wx);
        const snapY = snap(wy);
        
        if (state.sketchVertices.length >= 3) {
            const first = state.sketchVertices[0];
            const distToFirst = Math.sqrt((snapX - first.x)**2 + (snapY - first.y)**2);
            if (distToFirst < 1.0) {
                finishCustomRoomDrawing();
                return;
            }
        }
        
        state.sketchVertices.push({ x: snapX, y: snapY });
        state.sketchRedoVertices = [];
        const btnRedoWall = document.getElementById('btn-draw-redo-wall');
        if (btnRedoWall) btnRedoWall.disabled = true;
        updateHistoryButtons();
        draw();
        return;
    }

    // Check custom room vertex handle clicks
    if (state.selectedRoomId) {
        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (room && room.type === 'custom' && room.vertices) {
            for (let idx = 0; idx < room.vertices.length; idx++) {
                const v = room.vertices[idx];
                const avx = room.x + v.x;
                const avy = room.y + v.y;
                const dist = Math.sqrt((wx - avx)**2 + (wy - avy)**2);
                if (dist < 0.8) {
                    state.draggedVertex = { roomId: room.id, vertexIndex: idx };
                    return;
                }
            }
        }
    }

    // 0. Check Door/Window Openings click first
    for (let i = state.rooms.length - 1; i >= 0; i--) {
        const room = state.rooms[i];
        for (let j = 0; j < room.openings.length; j++) {
            const op = room.openings[j];
            const rx = toCanvasX(room.x);
            const ry = toCanvasY(room.y);
            const rw = room.w * state.scale;
            const rl = room.l * state.scale;
            const widthPix = op.w * state.scale;
            const thickness = 12; // Click hit box thickness
            
            let opX, opY, opW, opH;
            if (op.wall === 'n') {
                opX = rx + (op.offset * state.scale) - (widthPix / 2);
                opY = ry - thickness / 2;
                opW = widthPix;
                opH = thickness;
            } else if (op.wall === 's') {
                opX = rx + (op.offset * state.scale) - (widthPix / 2);
                opY = ry + rl - thickness / 2;
                opW = widthPix;
                opH = thickness;
            } else if (op.wall === 'w') {
                opX = rx - thickness / 2;
                opY = ry + (op.offset * state.scale) - (widthPix / 2);
                opW = thickness;
                opH = widthPix;
            } else if (op.wall === 'e') {
                opX = rx + rw - thickness / 2;
                opY = ry + (op.offset * state.scale) - (widthPix / 2);
                opW = thickness;
                opH = widthPix;
            }
            
            if (mx >= opX && mx <= opX + opW && my >= opY && my <= opY + opH) {
                selectItem('room', room.id);
                state.draggedOpening = { roomId: room.id, openingId: op.id };
                return;
            }
        }
    }

    // 1. Check Sump Pumps click
    for (let i = state.sumpPumps.length - 1; i >= 0; i--) {
        const sp = state.sumpPumps[i];
        const spcx = toCanvasX(sp.x);
        const spcy = toCanvasY(sp.y);
        const dist = Math.sqrt((mx - spcx)**2 + (my - spcy)**2);
        if (dist < 15) {
            selectItem('sump', sp.id);
            state.draggedSumpPumpId = sp.id;
            return;
        }
    }

    // 2. Check Discharge Lines endpoints & bodies
    for (let i = state.dischargeLines.length - 1; i >= 0; i--) {
        const dl = state.dischargeLines[i];
        const h1x = toCanvasX(dl.x1);
        const h1y = toCanvasY(dl.y1);
        const h2x = toCanvasX(dl.x2);
        const h2y = toCanvasY(dl.y2);
        
        if (Math.sqrt((mx - h1x)**2 + (my - h1y)**2) < 10) {
            selectItem('discharge', dl.id);
            state.draggedDischargeHandle = { id: dl.id, point: 'p1' };
            return;
        }
        if (Math.sqrt((mx - h2x)**2 + (my - h2y)**2) < 10) {
            selectItem('discharge', dl.id);
            state.draggedDischargeHandle = { id: dl.id, point: 'p2' };
            return;
        }
        
        const distToSegment = getDistanceToSegment(wx, wy, dl.x1, dl.y1, dl.x2, dl.y2);
        if (distToSegment < 0.6) {
            selectItem('discharge', dl.id);
            state.draggedDischargeHandle = { id: dl.id, point: 'move' };
            state.initialMouseOffset = {
                x1: wx - dl.x1,
                y1: wy - dl.y1,
                x2: wx - dl.x2,
                y2: wy - dl.y2
            };
            return;
        }
    }

    // 3. Check selected room handles
    if (state.selectedRoomId) {
        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (room) {
            const handle = getHitHandle(room, wx, wy);
            if (handle && handle !== 'move') {
                state.draggedRoomId = room.id;
                state.draggedHandle = handle;
                return;
            }
        }
    }

    // 4. Check room bodies
    for (let i = state.rooms.length - 1; i >= 0; i--) {
        const room = state.rooms[i];
        const handle = getHitHandle(room, wx, wy);
        if (handle === 'move') {
            selectItem('room', room.id);
            state.draggedRoomId = room.id;
            state.draggedHandle = 'move';
            state.initialMouseOffset = {
                x: wx - room.x,
                y: wy - room.y
            };
            draw();
            return;
        }
    }

    // 5. Empty space
    selectItem(null);
    state.isDraggingCanvas = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    draw();
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = toWorldX(mx);
    const wy = toWorldY(my);

    // Sketching custom rooms mode mousemove handler
    if (state.drawMode === 'custom') {
        state.lastMouseWorldX = snap(wx);
        state.lastMouseWorldY = snap(wy);
        canvas.style.cursor = 'crosshair';
        draw();
        return;
    }

    // Custom room vertex dragging handler
    if (state.draggedVertex) {
        const room = state.rooms.find(r => r.id === state.draggedVertex.roomId);
        if (room && room.vertices) {
            const v = room.vertices[state.draggedVertex.vertexIndex];
            v.x = snap(wx - room.x);
            v.y = snap(wy - room.y);

            // Recompute room dimensions
            const minX = Math.min(...room.vertices.map(v => v.x));
            const maxX = Math.max(...room.vertices.map(v => v.x));
            const minY = Math.min(...room.vertices.map(v => v.y));
            const maxY = Math.max(...room.vertices.map(v => v.y));

            // Shift origin to keep the bounding box aligned
            if (minX !== 0 || minY !== 0) {
                room.x += minX;
                room.y += minY;
                room.vertices.forEach(vt => {
                    vt.x -= minX;
                    vt.y -= minY;
                });
            }
            room.w = maxX - minX;
            room.l = maxY - minY;

            updateRoomEstimates(room);
            draw();
            updateGlobalStats();
            if (window.sync3D) window.sync3D();
        }
        return;
    }

    // Default cursor resetting
    canvas.style.cursor = 'default';

    // Pan Canvas
    if (state.isDraggingCanvas) {
        const dx = e.clientX - state.dragStartX;
        const dy = e.clientY - state.dragStartY;
        state.offsetX += dx;
        state.offsetY += dy;
        state.dragStartX = e.clientX;
        state.dragStartY = e.clientY;
        draw();
        return;
    }

    // Sump Pump Dragging
    if (state.draggedSumpPumpId) {
        const sp = state.sumpPumps.find(p => p.id === state.draggedSumpPumpId);
        if (sp) {
            sp.x = snap(wx);
            sp.y = snap(wy);
            draw();
        }
        return;
    }

    // Discharge Line Dragging
    if (state.draggedDischargeHandle) {
        const dl = state.dischargeLines.find(l => l.id === state.draggedDischargeHandle.id);
        if (dl) {
            if (state.draggedDischargeHandle.point === 'p1') {
                dl.x1 = snap(wx);
                dl.y1 = snap(wy);
            } else if (state.draggedDischargeHandle.point === 'p2') {
                dl.x2 = snap(wx);
                dl.y2 = snap(wy);
            } else if (state.draggedDischargeHandle.point === 'move') {
                dl.x1 = snap(wx - state.initialMouseOffset.x1);
                dl.y1 = snap(wy - state.initialMouseOffset.y1);
                dl.x2 = snap(wx - state.initialMouseOffset.x2);
                dl.y2 = snap(wy - state.initialMouseOffset.y2);
            }
            dl.length = Math.sqrt((dl.x2 - dl.x1)**2 + (dl.y2 - dl.y1)**2);
            
            // Sync length input in real-time
            if (state.selectedDischargeLineId === dl.id) {
                document.getElementById('discharge-len-input').value = dl.length.toFixed(1);
            }
            draw();
            updateGlobalStats();
        }
        return;
    }

    // Opening (Door/Window) Dragging along wall bounds
    if (state.draggedOpening) {
        const room = state.rooms.find(r => r.id === state.draggedOpening.roomId);
        if (room) {
            const op = room.openings.find(o => o.id === state.draggedOpening.openingId);
            if (op) {
                let newOffset = op.offset;
                if (op.wall === 'n' || op.wall === 's') {
                    newOffset = wx - room.x;
                    newOffset = Math.max(op.w / 2, Math.min(room.w - op.w / 2, snap(newOffset)));
                } else {
                    newOffset = wy - room.y;
                    newOffset = Math.max(op.w / 2, Math.min(room.l - op.w / 2, snap(newOffset)));
                }
                op.offset = newOffset;
                
                if (state.selectedRoomId === room.id) {
                    updateRoomEstimates(room);
                }
                draw();
            }
        }
        return;
    }

    // Room Drag or Resize
    if (state.draggedRoomId) {
        const room = state.rooms.find(r => r.id === state.draggedRoomId);
        if (!room) return;

        if (state.draggedHandle === 'move') {
            let targetX = snap(wx - state.initialMouseOffset.x);
            let targetY = snap(wy - state.initialMouseOffset.y);

            state.rooms.forEach(r => {
                if (r.id === room.id) return;
                const snapTolerance = 0.6;
                if (Math.abs(targetX - r.x) < snapTolerance) targetX = r.x;
                if (Math.abs(targetX + room.w - r.x) < snapTolerance) targetX = r.x - room.w;
                if (Math.abs(targetX - (r.x + r.w)) < snapTolerance) targetX = r.x + r.w;
                if (Math.abs(targetX + room.w - (r.x + r.w)) < snapTolerance) targetX = r.x + r.w - room.w;
                if (Math.abs(targetY - r.y) < snapTolerance) targetY = r.y;
                if (Math.abs(targetY + room.l - r.y) < snapTolerance) targetY = r.y - room.l;
                if (Math.abs(targetY - (r.y + r.l)) < snapTolerance) targetY = r.y + r.l;
                if (Math.abs(targetY + room.l - (r.y + r.l)) < snapTolerance) targetY = r.y + r.l - room.l;
            });

            room.x = targetX;
            room.y = targetY;
        } else {
            const snapW = snap(wx);
            const snapH = snap(wy);

            if (state.draggedHandle === 'e') {
                room.w = Math.max(2, snapW - room.x);
            } else if (state.draggedHandle === 'w') {
                const oldRight = room.x + room.w;
                room.x = Math.min(oldRight - 2, snapW);
                room.w = oldRight - room.x;
            } else if (state.draggedHandle === 's') {
                room.l = Math.max(2, snapH - room.y);
            } else if (state.draggedHandle === 'n') {
                const oldBottom = room.y + room.l;
                room.y = Math.min(oldBottom - 2, snapH);
                room.l = oldBottom - room.y;
            } else if (state.draggedHandle === 'se') {
                room.w = Math.max(2, snapW - room.x);
                room.l = Math.max(2, snapH - room.y);
            } else if (state.draggedHandle === 'sw') {
                const oldRight = room.x + room.w;
                room.x = Math.min(oldRight - 2, snapW);
                room.w = oldRight - room.x;
                room.l = Math.max(2, snapH - room.y);
            } else if (state.draggedHandle === 'ne') {
                const oldBottom = room.y + room.l;
                room.w = Math.max(2, snapW - room.x);
                room.y = Math.min(oldBottom - 2, snapH);
                room.l = oldBottom - room.y;
            } else if (state.draggedHandle === 'nw') {
                const oldRight = room.x + room.w;
                const oldBottom = room.y + room.l;
                room.x = Math.min(oldRight - 2, snapW);
                room.w = oldRight - room.x;
                room.y = Math.min(oldBottom - 2, snapH);
                room.l = oldBottom - room.y;
            }
            
            room.openings.forEach(op => {
                if (op.wall === 'n' || op.wall === 's') {
                    op.offset = Math.min(room.w - 0.5, Math.max(0.5, op.offset));
                } else {
                    op.offset = Math.min(room.l - 0.5, Math.max(0.5, op.offset));
                }
            });
        }

        updateRoomEstimates(room);
        draw();
        return;
    }

    // Set Cursors
    let cursor = 'crosshair';
    
    // Hovering sump pump
    state.sumpPumps.forEach(sp => {
        const cx = toCanvasX(sp.x);
        const cy = toCanvasY(sp.y);
        if (Math.sqrt((mx - cx)**2 + (my - cy)**2) < 15) {
            cursor = 'pointer';
        }
    });
    
    // Hovering discharge handle
    state.dischargeLines.forEach(dl => {
        const h1x = toCanvasX(dl.x1);
        const h1y = toCanvasY(dl.y1);
        const h2x = toCanvasX(dl.x2);
        const h2y = toCanvasY(dl.y2);
        if (Math.sqrt((mx - h1x)**2 + (my - h1y)**2) < 10 || Math.sqrt((mx - h2x)**2 + (my - h2y)**2) < 10) {
            cursor = 'pointer';
        }
    });

    if (state.selectedRoomId) {
        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (room) {
            const handle = getHitHandle(room, wx, wy);
            if (handle) {
                if (handle === 'n' || handle === 's') cursor = 'ns-resize';
                else if (handle === 'e' || handle === 'w') cursor = 'ew-resize';
                else if (handle === 'nw' || handle === 'se') cursor = 'nwse-resize';
                else if (handle === 'ne' || handle === 'sw') cursor = 'nesw-resize';
                else if (handle === 'move') cursor = 'move';
            }
        }
    }
    
    if (cursor === 'crosshair') {
        const hovered = state.rooms.find(r => getHitHandle(r, wx, wy) === 'move');
        if (hovered) cursor = 'pointer';
    }

    canvas.style.cursor = cursor;
});

canvas.addEventListener('mouseup', () => {
    // If elements were dragged, check if they actually moved and commit to history
    if (state.draggedRoomId || state.draggedSumpPumpId || state.draggedDischargeHandle || state.draggedOpening || state.draggedVertex) {
        if (state.dragSnapshot) {
            const currentStr = JSON.stringify({
                rooms: state.rooms,
                sumpPumps: state.sumpPumps,
                dischargeLines: state.dischargeLines
            });
            const snapStr = JSON.stringify(state.dragSnapshot);
            if (currentStr !== snapStr) {
                state.undoStack.push(state.dragSnapshot);
                if (state.undoStack.length > 50) {
                    state.undoStack.shift();
                }
                state.redoStack = [];
                if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
            }
        }
    }
    state.dragSnapshot = null;

    state.isDraggingCanvas = false;
    state.draggedRoomId = null;
    state.draggedHandle = null;
    state.draggedSumpPumpId = null;
    state.draggedDischargeHandle = null;
    state.draggedOpening = null;
    state.draggedVertex = null;
    draw();
    if (window.sync3D) window.sync3D();
});

// Event Listeners for UI Form Inputs
document.getElementById('room-name-input').addEventListener('input', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        room.name = e.target.value;
        draw();
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('room-w-input').addEventListener('input', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    const val = parseFloat(e.target.value);
    if (room && !isNaN(val) && val >= 1) {
        room.w = val;
        updateRoomEstimates(room);
        draw();
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('room-l-input').addEventListener('input', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    const val = parseFloat(e.target.value);
    if (room && !isNaN(val) && val >= 1) {
        room.l = val;
        updateRoomEstimates(room);
        draw();
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('room-h-input').addEventListener('input', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    const val = parseFloat(e.target.value);
    if (room && !isNaN(val) && val >= 1) {
        room.h = val;
        updateRoomEstimates(room);
        draw();
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('room-steps-input').addEventListener('input', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    const val = parseInt(e.target.value);
    if (room && room.type === 'staircase' && !isNaN(val) && val >= 1) {
        room.steps = val;
        draw();
        if (window.sync3D) window.sync3D();
    }
});

// Sump Pump listeners
document.getElementById('sump-name-input').addEventListener('input', (e) => {
    if (!state.selectedSumpPumpId) return;
    const sump = state.sumpPumps.find(p => p.id === state.selectedSumpPumpId);
    if (sump) {
        sump.name = e.target.value;
        draw();
    }
});
document.getElementById('btn-delete-sump').addEventListener('click', deleteSelectedSump);

// Discharge line listeners
document.getElementById('discharge-label-input').addEventListener('input', (e) => {
    if (!state.selectedDischargeLineId) return;
    const dl = state.dischargeLines.find(l => l.id === state.selectedDischargeLineId);
    if (dl) {
        dl.label = e.target.value;
        draw();
    }
});

document.getElementById('discharge-len-input').addEventListener('input', (e) => {
    if (!state.selectedDischargeLineId) return;
    const dl = state.dischargeLines.find(l => l.id === state.selectedDischargeLineId);
    const val = parseFloat(e.target.value);
    if (dl && !isNaN(val) && val > 0.1) {
        const dx = dl.x2 - dl.x1;
        const dy = dl.y2 - dl.y1;
        const currentLen = Math.sqrt(dx*dx + dy*dy);
        if (currentLen > 0.05) {
            dl.x2 = dl.x1 + (dx / currentLen) * val;
            dl.y2 = dl.y1 + (dy / currentLen) * val;
        } else {
            dl.x2 = dl.x1 + val; // default extends east
        }
        dl.length = val;
        draw();
        updateGlobalStats();
    }
});
document.getElementById('btn-delete-discharge').addEventListener('click', deleteSelectedDischarge);

// Trigger presets
document.querySelectorAll('.add-room-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const type = btn.getAttribute('data-type');
        addRoom(type);
        if (typeof closeAllDrawers === 'function') closeAllDrawers();
    });
});

document.getElementById('btn-add-door').addEventListener('click', () => {
    addOpening('door');
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});
document.getElementById('btn-add-window').addEventListener('click', () => {
    addOpening('window');
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});
document.getElementById('btn-delete-room').addEventListener('click', deleteSelectedRoom);

// Add Sump & Discharge actions
document.getElementById('btn-add-sump').addEventListener('click', () => {
    addSumpPump();
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});
document.getElementById('btn-add-discharge').addEventListener('click', () => {
    addDischargeLine();
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});

// Zoom and Grid controls
document.getElementById('btn-zoom-in').addEventListener('click', () => {
    state.scale = Math.min(50, state.scale + 2);
    draw();
});
document.getElementById('btn-zoom-out').addEventListener('click', () => {
    state.scale = Math.max(5, state.scale - 2);
    draw();
});
document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    state.scale = 15;
    state.offsetX = 0;
    state.offsetY = 0;
    draw();
});
document.getElementById('btn-grid-toggle').addEventListener('click', (e) => {
    state.showGrid = !state.showGrid;
    e.currentTarget.classList.toggle('active', state.showGrid);
    draw();
});

// View toggles
const btn2D = document.getElementById('btn-view-2d');
const btn3D = document.getElementById('btn-view-3d');
const btnAR = document.getElementById('btn-view-ar');

const view2D = document.getElementById('canvas-container');
const view3D = document.getElementById('three-container');
const viewAR = document.getElementById('ar-container');

function switchView(viewName) {
    state.activeView = viewName;
    
    btn2D.classList.toggle('active', viewName === '2d');
    btn3D.classList.toggle('active', viewName === '3d');
    btnAR.classList.toggle('active', viewName === 'ar');
    
    view2D.classList.toggle('active', viewName === '2d');
    view3D.classList.toggle('active', viewName === '3d');
    viewAR.classList.toggle('active', viewName === 'ar');

    if (viewName === 'ar') {
        if (window.startCamera) window.startCamera();
    } else {
        if (window.stopCamera) window.stopCamera();
    }

    if (viewName === '3d') {
        if (window.resizeRenderer) window.resizeRenderer();
        if (window.sync3D) window.sync3D();
    }

    if (viewName === '2d') {
        resizeCanvas();
    }
}

btn2D.addEventListener('click', () => switchView('2d'));
btn3D.addEventListener('click', () => switchView('3d'));
btnAR.addEventListener('click', () => switchView('ar'));

// Save/Load/Export Actions
document.getElementById('btn-new').addEventListener('click', () => {
    if (confirm('Clear project?')) {
        state.rooms = [];
        state.sumpPumps = [];
        state.dischargeLines = [];
        selectItem(null);
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('btn-save').addEventListener('click', () => {
    const projectData = {
        customerName: document.getElementById('customer-name').value,
        customerAddress: document.getElementById('customer-address').value,
        rooms: state.rooms,
        sumpPumps: state.sumpPumps,
        dischargeLines: state.dischargeLines,
        capturedMeasurements: state.capturedMeasurements || []
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "roomflow_project.json");
    dlAnchorElem.click();
});

document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (data && (data.rooms || Array.isArray(data))) {
                state.rooms = Array.isArray(data) ? data : (data.rooms || []);
                state.sumpPumps = data.sumpPumps || [];
                state.dischargeLines = data.dischargeLines || [];
                state.capturedMeasurements = data.capturedMeasurements || [];
                document.getElementById('customer-name').value = data.customerName || '';
                document.getElementById('customer-address').value = data.customerAddress || '';
                selectItem(null);
                draw();
                updateGlobalStats();
                updateMeasurementsSidebar();
                if (window.sync3D) window.sync3D();
                alert('Project loaded.');
            } else {
                alert('Invalid file format.');
            }
        } catch (err) {
            alert('Failed to parse project file.');
        }
    };
    reader.readAsText(file);
});

// PDF / HTML Print Layout
document.getElementById('btn-export-pdf').addEventListener('click', () => {
    // Save current selections
    const oldSelRoom = state.selectedRoomId;
    const oldSelSump = state.selectedSumpPumpId;
    const oldSelDischarge = state.selectedDischargeLineId;
    
    // Temporarily clear selections for high-fidelity export
    state.selectedRoomId = null;
    state.selectedSumpPumpId = null;
    state.selectedDischargeLineId = null;
    
    // Draw with solid print background, then grab image URL
    draw(true);
    const layoutImage = canvas.toDataURL('image/png');
    
    // Restore selections
    state.selectedRoomId = oldSelRoom;
    state.selectedSumpPumpId = oldSelSump;
    state.selectedDischargeLineId = oldSelDischarge;
    
    // Redraw normal
    draw(false);

    const cName = document.getElementById('customer-name').value || 'Not Specified';
    const cAddress = document.getElementById('customer-address').value || 'Not Specified';

    const printWindow = window.open('', '_blank');
    
    let roomRows = '';
    let grandFloor = 0, grandWall = 0, grandCeiling = 0, grandVolume = 0;
    
    state.rooms.forEach(room => {
        let floorArea, perimeter;
        if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
            floorArea = getPolygonArea(room.vertices);
            perimeter = getPolygonPerimeter(room.vertices);
        } else {
            floorArea = room.w * room.l;
            perimeter = 2 * (room.w + room.l);
        }
        const ceilingArea = floorArea;
        const volume = room.type === 'staircase' ? 0.5 * floorArea * room.h : floorArea * room.h;
        
        let grossWallArea;
        if (room.type === 'staircase') {
            grossWallArea = (room.l * room.h) + (room.w * room.h);
        } else {
            grossWallArea = perimeter * room.h;
        }
        
        let deductions = 0;
        room.openings.forEach(op => { deductions += op.w * op.h; });
        const netWallArea = Math.max(0, grossWallArea - deductions);

        grandFloor += floorArea;
        grandWall += netWallArea;
        grandCeiling += ceilingArea;
        grandVolume += volume;

        let openingsStr = room.openings.map(o => `${o.type.toUpperCase()} (on ${o.wall.toUpperCase()}, ${o.w}'x${o.h}')`).join(', ') || 'None';

        roomRows += `
            <tr>
                <td><strong>${room.name}</strong></td>
                <td>${room.w}' x ${room.l}' x ${room.h}'</td>
                <td>${floorArea.toFixed(1)} sq ft</td>
                <td>${netWallArea.toFixed(1)} sq ft <br><small>Openings: ${openingsStr}</small></td>
                <td>${ceilingArea.toFixed(1)} sq ft</td>
                <td>${volume.toFixed(1)} cu ft</td>
            </tr>
        `;
    });

    let sumpRows = '';
    state.sumpPumps.forEach((sp, idx) => {
        sumpRows += `
            <tr>
                <td>${idx + 1}</td>
                <td><strong>${sp.name}</strong></td>
                <td>Position: X: ${sp.x.toFixed(1)} ft, Y: ${sp.y.toFixed(1)} ft</td>
            </tr>
        `;
    });
    if (state.sumpPumps.length === 0) {
        sumpRows = '<tr><td colspan="3" style="text-align:center; color:#9ca3af;">No sump pumps placed</td></tr>';
    }

    let lineRows = '';
    let totalLen = 0;
    state.dischargeLines.forEach((dl, idx) => {
        totalLen += dl.length;
        lineRows += `
            <tr>
                <td>${idx + 1}</td>
                <td><strong>${dl.label}</strong></td>
                <td>${dl.length.toFixed(1)} ft</td>
                <td>Start (X: ${dl.x1.toFixed(1)}, Y: ${dl.y1.toFixed(1)}), End (X: ${dl.x2.toFixed(1)}, Y: ${dl.y2.toFixed(1)})</td>
            </tr>
        `;
    });
    if (state.dischargeLines.length === 0) {
        lineRows = '<tr><td colspan="4" style="text-align:center; color:#9ca3af;">No discharge lines placed</td></tr>';
    }

    const htmlContent = `
        <html>
        <head>
            <title>RoomFlow - Estimation Report</title>
            <style>
                body { font-family: 'Outfit', sans-serif; padding: 40px; color: #111827; line-height: 1.5; }
                h1 { color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-top: 40px; margin-bottom: 30px; }
                h2 { color: #1e3a8a; font-size: 1.25rem; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
                .meta-info { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 0.9rem; color: #4b5563; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
                th { background-color: #f3f4f6; color: #1e3a8a; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
                tr.totals { font-weight: 700; background-color: #eff6ff; }
                .layout-preview { text-align: center; margin-bottom: 30px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; background-color: #0d111a; }
                .layout-preview img { max-width: 100%; max-height: 420px; object-fit: contain; }
                .footer { margin-top: 50px; text-align: center; font-size: 0.8rem; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
                @media print {
                    button { display: none; }
                }
                .print-btn { background-color: #3b82f6; color: white; padding: 10px 20px; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; float: right; }
                .print-btn:hover { background-color: #2563eb; }
            </style>
        </head>
        <body>
            <button class="print-btn" onclick="window.print()">Print Estimate Report</button>
            <h1>RoomFlow - Structural Estimation Report</h1>
            <div class="meta-info">
                <div>
                    <strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
                    <strong>Customer:</strong> ${cName}<br>
                    <strong>Address:</strong> ${cAddress}
                </div>
            </div>

            <h2>1. 2D Floor Plan Blueprint</h2>
            <div class="layout-preview">
                <img src="${layoutImage}" alt="2D Layout Blueprint">
            </div>

            <h2>2. Rooms & Structural Elements</h2>
            <table>
                <thead>
                    <tr>
                        <th>Room Name</th>
                        <th>Dimensions (W x L x H)</th>
                        <th>Floor Area</th>
                        <th>Wall Area (Net)</th>
                        <th>Ceiling Area</th>
                        <th>Volume</th>
                    </tr>
                </thead>
                <tbody>
                    ${roomRows}
                    <tr class="totals">
                        <td>GRAND TOTALS</td>
                        <td>-</td>
                        <td>${grandFloor.toFixed(1)} sq ft</td>
                        <td>${grandWall.toFixed(1)} sq ft</td>
                        <td>${grandCeiling.toFixed(1)} sq ft</td>
                        <td>${grandVolume.toFixed(1)} cu ft</td>
                    </tr>
                </tbody>
            </table>

            <h2>3. Utility Sump Pumps</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width: 80px;">Index</th>
                        <th>Label</th>
                        <th>Plotted Location</th>
                    </tr>
                </thead>
                <tbody>
                    ${sumpRows}
                </tbody>
            </table>

            <h2>4. Utility Discharge Lines</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width: 80px;">Index</th>
                        <th>Label</th>
                        <th>Measured Length</th>
                        <th>Piping Coordinates</th>
                    </tr>
                </thead>
                <tbody>
                    ${lineRows}
                    <tr class="totals">
                        <td>TOTAL</td>
                        <td>-</td>
                        <td>${totalLen.toFixed(1)} ft</td>
                        <td>-</td>
                    </tr>
                </tbody>
            </table>

            <div class="footer">
                Report generated via RoomFlow Sketcher. All measurements are estimates.
            </div>
        </body>
        </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
});

// --- ANGLED WALL SKETCHER & DRAWING LOGIC ---
function toggleDrawWallsMode() {
    const drawWallsPanel = document.getElementById('custom-wall-drawer-panel');
    if (state.drawMode === 'custom') {
        state.drawMode = null;
        state.sketchVertices = [];
        drawWallsPanel.classList.add('hidden');
        document.getElementById('btn-draw-walls-mode').classList.remove('active');
        document.getElementById('btn-draw-walls-mode').style.backgroundColor = 'rgba(59, 130, 246, 0.12)';
    } else {
        // Clear active selections
        selectItem(null);
        state.drawMode = 'custom';
        state.sketchVertices = [];
        drawWallsPanel.classList.remove('hidden');
        document.getElementById('btn-draw-walls-mode').classList.add('active');
        document.getElementById('btn-draw-walls-mode').style.backgroundColor = 'rgba(168, 85, 247, 0.2)'; // purple
        
        // Start sketching automatically at the center of the canvas if empty
        const canvasCenterX = toWorldX(canvas.width / 2);
        const canvasCenterY = toWorldY(canvas.height / 2);
        state.sketchVertices = [{ x: snap(canvasCenterX), y: snap(canvasCenterY) }];
        state.lastMouseWorldX = snap(canvasCenterX);
        state.lastMouseWorldY = snap(canvasCenterY);
    }
    updateHistoryButtons();
    draw();
}

function finishCustomRoomDrawing() {
    if (state.sketchVertices.length < 3) {
        alert('An angled room requires at least 3 walls/corners to be closed.');
        return;
    }

    // Bounding box calculations
    const xs = state.sketchVertices.map(v => v.x);
    const ys = state.sketchVertices.map(v => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const roomW = maxX - minX;
    const roomL = maxY - minY;

    // Relative vertices from room top-left origin
    const relativeVertices = state.sketchVertices.map(v => ({
        x: v.x - minX,
        y: v.y - minY
    }));

    const newRoom = {
        id: 'r_' + Date.now(),
        name: 'Custom Angled Area',
        type: 'custom',
        x: minX,
        y: minY,
        w: roomW,
        l: roomL,
        h: 8, // Standard 8 ft height
        color: '#a855f7', // Custom purple
        openings: [],
        vertices: relativeVertices
    };

    state.rooms.push(newRoom);
    
    // Select the new room
    selectItem('room', newRoom.id);

    // Reset sketch state
    state.drawMode = null;
    state.sketchVertices = [];
    state.sketchRedoVertices = [];
    document.getElementById('custom-wall-drawer-panel').classList.add('hidden');
    document.getElementById('btn-draw-walls-mode').classList.remove('active');
    document.getElementById('btn-draw-walls-mode').style.backgroundColor = 'rgba(59, 130, 246, 0.12)';

    updateHistoryButtons();
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
}

window.changeCustomWallLength = function(roomId, wallIndex, newValueRaw) {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room || !room.vertices) return;

    const newLen = parseFloat(newValueRaw);
    if (isNaN(newLen) || newLen <= 0.1) return;

    const V = room.vertices;
    const i = wallIndex;
    const ip1 = (i + 1) % V.length;

    const dx = V[ip1].x - V[i].x;
    const dy = V[ip1].y - V[i].y;
    const currentLen = Math.sqrt(dx*dx + dy*dy);
    if (currentLen < 0.01) return;

    const cosTheta = dx / currentLen;
    const sinTheta = dy / currentLen;

    const newV_ip1_x = V[i].x + newLen * cosTheta;
    const newV_ip1_y = V[i].y + newLen * sinTheta;

    const deltaX = newV_ip1_x - V[ip1].x;
    const deltaY = newV_ip1_y - V[ip1].y;

    // Shift all subsequent vertices to pull/push the loop
    for (let j = i + 1; j < V.length; j++) {
        V[j].x += deltaX;
        V[j].y += deltaY;
    }

    // Recompute bounding box and shift origin if needed
    const minX = Math.min(...V.map(v => v.x));
    const maxX = Math.max(...V.map(v => v.x));
    const minY = Math.min(...V.map(v => v.y));
    const maxY = Math.max(...V.map(v => v.y));

    if (minX !== 0 || minY !== 0) {
        room.x += minX;
        room.y += minY;
        V.forEach(vt => {
            vt.x -= minX;
            vt.y -= minY;
        });
    }
    room.w = maxX - minX;
    room.l = maxY - minY;

    // Refresh display
    updateRoomEstimates(room);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
    selectItem('room', room.id);
};

function addSketchWallSegment() {
    if (state.sketchVertices.length === 0) {
        const canvasCenterX = toWorldX(canvas.width / 2);
        const canvasCenterY = toWorldY(canvas.height / 2);
        state.sketchVertices.push({ x: snap(canvasCenterX), y: snap(canvasCenterY) });
        draw();
        return;
    }

    const length = parseFloat(document.getElementById('draw-wall-length').value);
    const angleDegrees = parseFloat(document.getElementById('draw-wall-angle').value);

    if (isNaN(length) || length <= 0) {
        alert('Please enter a valid wall length.');
        return;
    }

    const last = state.sketchVertices[state.sketchVertices.length - 1];
    const angleRad = (angleDegrees * Math.PI) / 180;
    
    const nextX = last.x + length * Math.cos(angleRad);
    const nextY = last.y + length * Math.sin(angleRad);

    const snapX = snap(nextX);
    const snapY = snap(nextY);

    state.sketchVertices.push({ x: snapX, y: snapY });
    state.sketchRedoVertices = [];
    const btnRedoWall = document.getElementById('btn-draw-redo-wall');
    if (btnRedoWall) btnRedoWall.disabled = true;
    
    state.lastMouseWorldX = snapX;
    state.lastMouseWorldY = snapY;

    updateHistoryButtons();
    draw();
}

function undoLastSketchWall() {
    if (state.sketchVertices.length > 1) {
        const popped = state.sketchVertices.pop();
        state.sketchRedoVertices.push(popped);
        const btnRedoWall = document.getElementById('btn-draw-redo-wall');
        if (btnRedoWall) btnRedoWall.disabled = false;
        
        const last = state.sketchVertices[state.sketchVertices.length - 1];
        state.lastMouseWorldX = last.x;
        state.lastMouseWorldY = last.y;
    } else {
        alert('Nothing to undo.');
    }
    updateHistoryButtons();
    draw();
}

function redoLastSketchWall() {
    if (state.sketchRedoVertices.length > 0) {
        const popped = state.sketchRedoVertices.pop();
        state.sketchVertices.push(popped);
        state.lastMouseWorldX = popped.x;
        state.lastMouseWorldY = popped.y;
        
        const btnRedoWall = document.getElementById('btn-draw-redo-wall');
        if (btnRedoWall) btnRedoWall.disabled = (state.sketchRedoVertices.length === 0);
        updateHistoryButtons();
        draw();
    }
}

// Bind sketch UI controls
document.getElementById('btn-draw-walls-mode').addEventListener('click', toggleDrawWallsMode);
document.getElementById('btn-draw-add-wall').addEventListener('click', addSketchWallSegment);
document.getElementById('btn-draw-undo-wall').addEventListener('click', undoLastSketchWall);
document.getElementById('btn-draw-redo-wall').addEventListener('click', redoLastSketchWall);
document.getElementById('btn-draw-finish-room').addEventListener('click', finishCustomRoomDrawing);
document.getElementById('btn-draw-cancel').addEventListener('click', () => {
    state.drawMode = null;
    state.sketchVertices = [];
    state.sketchRedoVertices = [];
    const btnRedoWall = document.getElementById('btn-draw-redo-wall');
    if (btnRedoWall) btnRedoWall.disabled = true;
    document.getElementById('custom-wall-drawer-panel').classList.add('hidden');
    document.getElementById('btn-draw-walls-mode').classList.remove('active');
    document.getElementById('btn-draw-walls-mode').style.backgroundColor = 'rgba(59, 130, 246, 0.12)';
    draw();
});

// --- UNDO / REDO HISTORY SYSTEM ---
function getHistorySnapshot() {
    return {
        rooms: JSON.parse(JSON.stringify(state.rooms)),
        sumpPumps: JSON.parse(JSON.stringify(state.sumpPumps)),
        dischargeLines: JSON.parse(JSON.stringify(state.dischargeLines))
    };
}

function saveHistoryState() {
    const snapshot = getHistorySnapshot();
    state.undoStack.push(snapshot);
    if (state.undoStack.length > 50) {
        state.undoStack.shift();
    }
    state.redoStack = [];
    updateHistoryButtons();
}

function updateHistoryButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (state.drawMode === 'custom') {
        if (btnUndo) btnUndo.disabled = (state.sketchVertices.length <= 1);
        if (btnRedo) btnRedo.disabled = (state.sketchRedoVertices.length === 0);
    } else {
        if (btnUndo) btnUndo.disabled = (state.undoStack.length === 0);
        if (btnRedo) btnRedo.disabled = (state.redoStack.length === 0);
    }
}

function undo() {
    if (state.drawMode === 'custom') {
        undoLastSketchWall();
        return;
    }
    if (state.undoStack.length === 0) return;
    
    const current = getHistorySnapshot();
    state.redoStack.push(current);
    
    const previous = state.undoStack.pop();
    state.rooms = previous.rooms;
    state.sumpPumps = previous.sumpPumps;
    state.dischargeLines = previous.dischargeLines;
    
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
    updateHistoryButtons();
}

// Global exposure for touch support
window.undo = undo;

function redo() {
    if (state.drawMode === 'custom') {
        redoLastSketchWall();
        return;
    }
    if (state.redoStack.length === 0) return;
    
    const current = getHistorySnapshot();
    state.undoStack.push(current);
    
    const nextState = state.redoStack.pop();
    state.rooms = nextState.rooms;
    state.sumpPumps = nextState.sumpPumps;
    state.dischargeLines = nextState.dischargeLines;
    
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
    updateHistoryButtons();
}

// Global exposure for touch support
window.redo = redo;

// Bind Global Undo/Redo Click Listeners
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

// Bind Keyboard Shortcuts (Ctrl+Z and Ctrl+Y / Ctrl+Shift+Z)
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
    }
});

// --- AR CAPTURED MEASUREMENTS MANAGEMENT ---
function updateMeasurementsSidebar() {
    const listEl = document.getElementById('ar-measurements-list');
    if (!listEl) return;
    
    if (!state.capturedMeasurements || state.capturedMeasurements.length === 0) {
        listEl.innerHTML = `<p class="empty-state">No captured distances. Use 'Capture Dist' in camera mode.</p>`;
        return;
    }
    
    let html = '';
    state.capturedMeasurements.forEach((val, idx) => {
        const displayVal = val.toFixed(1);
        html += `
            <div class="ar-history-item">
                <span class="ar-history-val">${displayVal} ft</span>
                <div class="ar-history-actions">
                    <button class="ar-history-btn" onclick="applyMeasurement(${val}, 'width')" title="Apply to Room Width">Width</button>
                    <button class="ar-history-btn" onclick="applyMeasurement(${val}, 'length')" title="Apply to Room Length">Length</button>
                    <button class="ar-history-btn" onclick="applyMeasurement(${val}, 'discharge')" title="Apply to Pipe">Pipe</button>
                    <button class="ar-history-btn btn-delete" onclick="deleteMeasurement(${idx})" title="Delete Capture">Delete</button>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

window.applyMeasurement = function(val, target) {
    if (target === 'width') {
        if (!state.selectedRoomId) {
            alert('Please select a room on the canvas first!');
            return;
        }
        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (room) {
            room.w = snap(val);
            updateRoomEstimates(room);
            draw();
            if (window.sync3D) window.sync3D();
        }
    } else if (target === 'length') {
        if (!state.selectedRoomId) {
            alert('Please select a room on the canvas first!');
            return;
        }
        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (room) {
            room.l = snap(val);
            updateRoomEstimates(room);
            draw();
            if (window.sync3D) window.sync3D();
        }
    } else if (target === 'discharge') {
        if (!state.selectedDischargeLineId) {
            alert('Please select a discharge line on the canvas first!');
            return;
        }
        const dl = state.dischargeLines.find(l => l.id === state.selectedDischargeLineId);
        if (dl) {
            const dx = dl.x2 - dl.x1;
            const dy = dl.y2 - dl.y1;
            const currentLength = Math.sqrt(dx * dx + dy * dy);
            if (currentLength > 0.1) {
                const angle = Math.atan2(dy, dx);
                dl.x2 = dl.x1 + snap(val) * Math.cos(angle);
                dl.y2 = dl.y1 + snap(val) * Math.sin(angle);
                dl.length = snap(val);
                
                document.getElementById('discharge-len-input').value = dl.length.toFixed(1);
                draw();
                updateGlobalStats();
            }
        }
    }
};

window.deleteMeasurement = function(idx) {
    state.capturedMeasurements.splice(idx, 1);
    updateMeasurementsSidebar();
    if (window.updateARCapturesOverlay) window.updateARCapturesOverlay();
};

window.updateMeasurementsSidebar = updateMeasurementsSidebar;

// Initialization
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
lucide.createIcons();

// --- MOBILE RESPONSIVE DRAWERS & TOUCH EVENTS ---
const leftSidebar = document.getElementById('left-sidebar');
const rightSidebar = document.getElementById('right-sidebar');
const backdrop = document.getElementById('mobile-sidebar-backdrop');
const btnToggleTools = document.getElementById('mobile-toggle-tools');
const btnToggleDetails = document.getElementById('mobile-toggle-details');

function closeAllDrawers() {
    leftSidebar.classList.remove('open');
    rightSidebar.classList.remove('open');
    backdrop.classList.add('hidden');
}
window.closeAllDrawers = closeAllDrawers;

btnToggleTools.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = leftSidebar.classList.contains('open');
    closeAllDrawers();
    if (!isOpen) {
        leftSidebar.classList.add('open');
        backdrop.classList.remove('hidden');
    }
});

btnToggleDetails.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = rightSidebar.classList.contains('open');
    closeAllDrawers();
    if (!isOpen) {
        rightSidebar.classList.add('open');
        backdrop.classList.remove('hidden');
    }
});

backdrop.addEventListener('click', closeAllDrawers);

// Touch support translation to canvas MouseEvents
function mapTouchEvent(e, type) {
    if (e.touches.length === 0 && type !== 'mouseup') return;
    const touch = e.touches[0] || e.changedTouches[0];
    const mouseEvt = new MouseEvent(type, {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true
    });
    canvas.dispatchEvent(mouseEvt);
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    mapTouchEvent(e, 'mousedown');
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    mapTouchEvent(e, 'mousemove');
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    mapTouchEvent(e, 'mouseup');
}, { passive: false });

