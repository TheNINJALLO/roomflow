// --- STATE DEFINITIONS ---
const state = {
    rooms: [],
    sumpPumps: [],
    dischargeLines: [],
    floorHatches: [],
    capturedMeasurements: [],
    selectedRoomId: null,
    selectedSumpPumpId: null,
    selectedDischargeLineId: null,
    selectedFloorHatchId: null,
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
    draggedFloorHatchId: null,
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
    levels: [
        { id: 'crawlspace', name: 'Crawl Space', height: 4, elevation: 0 },
        { id: 'basement', name: 'Basement', height: 8, elevation: 0 },
        { id: 'main', name: 'Main Floor', height: 9, elevation: 8 },
        { id: 'second', name: '2nd Floor', height: 8, elevation: 17 }
    ],
    currentLevelId: 'basement',
    interiorPipes: [],
    selectedInteriorPipeId: null,
    draggedInteriorPipeHandle: null, // { id, point: 'p1' | 'p2' | 'move' }
    stanchions: [],
    selectedStanchionId: null,
    draggedStanchionId: null,
    mainBeams: [],
    selectedMainBeamId: null,
    draggedMainBeamHandle: null, // { id, point: 'p1' | 'p2' | 'move' }
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

// Helper: Checks which room a world coordinate is in (supports custom polygons)
function getRoomAt(x, y, levelId) {
    return state.rooms.find(room => {
        if (room.levelId !== levelId) return false;
        if (room.type === 'custom' && room.vertices) {
            let inside = false;
            for (let i = 0, j = room.vertices.length - 1; i < room.vertices.length; j = i++) {
                const xi = room.x + room.vertices[i].x, yi = room.y + room.vertices[i].y;
                const xj = room.x + room.vertices[j].x, yj = room.y + room.vertices[j].y;
                const intersect = ((yi > y) !== (yj > y))
                    && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        } else {
            return x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.l;
        }
    });
}

// Print-safe color selector helper
function c(darkColor, printColor) {
    return state.isPrintingMode ? printColor : darkColor;
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
        levelId: state.currentLevelId,
        name: preset.name,
        type: type,
        w: preset.w,
        l: preset.l,
        h: preset.h,
        x: snap(toWorldX(canvas.width / 2) - preset.w / 2),
        y: snap(toWorldY(canvas.height / 2) - preset.l / 2),
        color: preset.color,
        openings: [],
        foamBoard: false,
        foamBondPockets: false,
        carbonStraps: 0,
        carbonFiberScope: 'full',
        carbonFiberWalls: [],
        customCarbonStraps: [],
        floorPerimeterStrap: false,
        nb1Height: 'none'
    };
    if (preset.steps) {
        newRoom.steps = preset.steps;
        newRoom.stairOrientation = 'N';
        newRoom.stairDirection = 'up';
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
        levelId: state.currentLevelId,
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
        levelId: state.currentLevelId,
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
// Add Interior Pipe
function addInteriorPipe() {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const cx = snap(toWorldX(canvas.width / 2));
    const cy = snap(toWorldY(canvas.height / 2));
    const newPipe = {
        id: generateId(),
        levelId: state.currentLevelId,
        label: `Interior Pipe ${state.interiorPipes.length + 1}`,
        x1: cx - 2,
        y1: cy,
        x2: cx + 2,
        y2: cy,
        length: 4.0
    };
    state.interiorPipes.push(newPipe);
    selectItem('interiorPipe', newPipe.id);
    draw();
    updateGlobalStats();
}

// Add Stanchion
function addStanchion() {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const cx = snap(toWorldX(canvas.width / 2));
    const cy = snap(toWorldY(canvas.height / 2));
    const newStanchion = {
        id: generateId(),
        levelId: state.currentLevelId,
        name: `Stanchion ${state.stanchions.length + 1}`,
        x: cx,
        y: cy,
        type: 'round' // 'round' or 'square'
    };
    state.stanchions.push(newStanchion);
    selectItem('stanchion', newStanchion.id);
    draw();
    updateGlobalStats();
}

// Add Support Beam
function addSupportBeam() {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const cx = snap(toWorldX(canvas.width / 2));
    const cy = snap(toWorldY(canvas.height / 2));
    const newBeam = {
        id: generateId(),
        levelId: state.currentLevelId,
        label: `Support Beam ${state.mainBeams.length + 1}`,
        x1: cx - 3,
        y1: cy,
        x2: cx + 3,
        y2: cy,
        length: 6.0,
        type: 'timber' // 'timber' or 'steel'
    };
    state.mainBeams.push(newBeam);
    selectItem('beam', newBeam.id);
    draw();
    updateGlobalStats();
}



function updateToolboxReinforcementLabels(room) {
    const strapLabel = document.getElementById('btn-add-strap-label');
    const perimLabel = document.getElementById('btn-add-perimeter-strap-label');
    const nb1Label = document.getElementById('btn-add-nb1-label');
    
    if (room) {
        const straps = room.carbonStraps || 0;
        const hasPerim = !!room.floorPerimeterStrap;
        const nb1Val = room.nb1Height || 'none';
        const nb1HeightLabels = { 'none': 'None', '2ft': '2 ft', '4ft': '4 ft', 'full': 'Full' };
        
        if (strapLabel) strapLabel.innerText = `Vertical Strap (${straps})`;
        if (perimLabel) perimLabel.innerText = `Perimeter: ${hasPerim ? 'ON' : 'OFF'}`;
        if (nb1Label) nb1Label.innerText = `NB1: ${nb1HeightLabels[nb1Val]}`;
    } else {
        if (strapLabel) strapLabel.innerText = 'Vertical Strap (+1)';
        if (perimLabel) perimLabel.innerText = 'Floor Perimeter';
        if (nb1Label) nb1Label.innerText = 'NB1 Coating (Cycle)';
    }
}

// Selection Manager
function selectItem(type, id) {
    state.selectedRoomId = (type === 'room') ? id : null;
    state.selectedSumpPumpId = (type === 'sump') ? id : null;
    state.selectedDischargeLineId = (type === 'discharge') ? id : null;
    state.selectedInteriorPipeId = (type === 'interiorPipe') ? id : null;
    state.selectedStanchionId = (type === 'stanchion') ? id : null;
    state.selectedMainBeamId = (type === 'beam') ? id : null;
    state.selectedFloorHatchId = (type === 'floorHatch') ? id : null;
    
    const roomFields = document.getElementById('room-edit-fields');
    const sumpFields = document.getElementById('sump-edit-fields');
    const dischargeFields = document.getElementById('discharge-edit-fields');
    const interiorPipeFields = document.getElementById('interior-pipe-edit-fields');
    const stanchionFields = document.getElementById('stanchion-edit-fields');
    const beamFields = document.getElementById('beam-edit-fields');
    const floorHatchFields = document.getElementById('floor-hatch-edit-fields');
    const noSel = document.getElementById('no-selection-msg');
    
    const btnAddDoor = document.getElementById('btn-add-door');
    const btnAddWindow = document.getElementById('btn-add-window');
    const btnAddCrawlDoor = document.getElementById('btn-add-crawl-door');
    const btnAddHatch = document.getElementById('btn-add-hatch');
    const btnAddStrap = document.getElementById('btn-add-strap');
    const btnAddPerim = document.getElementById('btn-add-perimeter-strap');
    const btnAddNb1 = document.getElementById('btn-add-nb1');
    
    // Hide all
    roomFields.classList.add('hidden');
    sumpFields.classList.add('hidden');
    dischargeFields.classList.add('hidden');
    if (interiorPipeFields) interiorPipeFields.classList.add('hidden');
    if (stanchionFields) stanchionFields.classList.add('hidden');
    if (beamFields) beamFields.classList.add('hidden');
    if (floorHatchFields) floorHatchFields.classList.add('hidden');
    noSel.classList.remove('hidden');
    btnAddDoor.disabled = true;
    btnAddWindow.disabled = true;
    if (btnAddCrawlDoor) btnAddCrawlDoor.disabled = true;
    if (btnAddHatch) btnAddHatch.disabled = true;
    if (btnAddStrap) btnAddStrap.disabled = true;
    if (btnAddPerim) btnAddPerim.disabled = true;
    if (btnAddNb1) btnAddNb1.disabled = true;
    updateToolboxReinforcementLabels(null);
    
    if (type === 'room' && id) {
        const room = state.rooms.find(r => r.id === id);
        if (room) {
            noSel.classList.add('hidden');
            roomFields.classList.remove('hidden');
            btnAddDoor.disabled = false;
            btnAddWindow.disabled = false;
            if (btnAddCrawlDoor) btnAddCrawlDoor.disabled = false;
            if (btnAddHatch) btnAddHatch.disabled = false;
            
            document.getElementById('room-name-input').value = room.name;
            document.getElementById('room-h-input').value = room.h;
            
            const joistSelect = document.getElementById('room-joists-select');
            if (joistSelect) joistSelect.value = room.joists || 'none';

            const foamCheckbox = document.getElementById('room-foam-board-checkbox');
            if (foamCheckbox) foamCheckbox.checked = !!room.foamBoard;

            const pocketsCheckbox = document.getElementById('room-foam-bond-pockets-checkbox');
            if (pocketsCheckbox) pocketsCheckbox.checked = !!room.foamBondPockets;

            const strapsInput = document.getElementById('room-carbon-straps-input');
            if (strapsInput) strapsInput.value = room.carbonStraps || 0;

            const scopeSelect = document.getElementById('room-carbon-scope-select');
            if (scopeSelect) scopeSelect.value = room.carbonFiberScope || 'full';
            if (typeof renderCarbonWallsCheckboxes === 'function') {
                renderCarbonWallsCheckboxes(room);
            }

            const floorStrapCheckbox = document.getElementById('room-floor-perimeter-strap-checkbox');
            if (floorStrapCheckbox) floorStrapCheckbox.checked = !!room.floorPerimeterStrap;

            const nb1Select = document.getElementById('room-nb1-select');
            if (nb1Select) nb1Select.value = room.nb1Height || 'none';
            
            const rectInputs = document.getElementById('room-rect-inputs');
            const customInputs = document.getElementById('room-custom-walls-inputs');
            
            customInputs.classList.remove('hidden');
            const container = document.getElementById('custom-walls-list-container');
            container.innerHTML = '';
            
            if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
                rectInputs.classList.add('hidden');
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
                document.getElementById('room-w-input').value = room.w;
                document.getElementById('room-l-input').value = room.l;
                
                const walls = [
                    { name: 'Wall 1 (North)', key: 'n', val: room.w },
                    { name: 'Wall 2 (East)', key: 'e', val: room.l },
                    { name: 'Wall 3 (South)', key: 's', val: room.w },
                    { name: 'Wall 4 (West)', key: 'w', val: room.l }
                ];
                
                walls.forEach(w => {
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
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">${w.name}</span>
                        <input type="number" step="0.5" min="0.5" value="${w.val.toFixed(1)}" 
                            style="width: 75px; padding: 0.15rem 0.35rem; font-family: var(--font-mono); font-weight:600; font-size: 0.75rem; background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:4px; color:var(--accent-teal); text-align:right;"
                            onchange="changeRectWallLength('${room.id}', '${w.key}', this.value)">
                    `;
                    container.appendChild(div);
                });
            }
            
            const stepsGroup = document.getElementById('room-steps-group');
            const stairProperties = document.getElementById('room-staircase-properties');
            if (room.type === 'staircase') {
                stepsGroup.classList.remove('hidden');
                stairProperties.classList.remove('hidden');
                document.getElementById('room-steps-input').value = room.steps || 12;
                
                if (!room.stairOrientation) room.stairOrientation = 'N';
                if (!room.stairDirection) room.stairDirection = 'up';
                
                document.getElementById('stair-orientation-select').value = room.stairOrientation;
                document.getElementById('stair-direction-select').value = room.stairDirection;
            } else {
                stepsGroup.classList.add('hidden');
                stairProperties.classList.add('hidden');
            }
            
            btnAddDoor.disabled = false;
            btnAddWindow.disabled = false;
            if (btnAddStrap) btnAddStrap.disabled = false;
            if (btnAddPerim) btnAddPerim.disabled = false;
            if (btnAddNb1) btnAddNb1.disabled = false;
            updateToolboxReinforcementLabels(room);
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
    } else if (type === 'interiorPipe' && id) {
        const ip = state.interiorPipes.find(l => l.id === id);
        const interiorPipeFields = document.getElementById('interior-pipe-edit-fields');
        if (ip && interiorPipeFields) {
            noSel.classList.add('hidden');
            interiorPipeFields.classList.remove('hidden');
            document.getElementById('interior-pipe-label-input').value = ip.label;
            document.getElementById('interior-pipe-len-input').value = ip.length.toFixed(1);
        }
    } else if (type === 'stanchion' && id) {
        const st = state.stanchions.find(p => p.id === id);
        const stanchionFields = document.getElementById('stanchion-edit-fields');
        if (st && stanchionFields) {
            noSel.classList.add('hidden');
            stanchionFields.classList.remove('hidden');
            document.getElementById('stanchion-name-input').value = st.name;
            document.getElementById('stanchion-type-select').value = st.type || 'round';
        }
    } else if (type === 'beam' && id) {
        const bm = state.mainBeams.find(l => l.id === id);
        const beamFields = document.getElementById('beam-edit-fields');
        if (bm && beamFields) {
            noSel.classList.add('hidden');
            beamFields.classList.remove('hidden');
            document.getElementById('beam-label-input').value = bm.label;
            document.getElementById('beam-type-select').value = bm.type || 'timber';
            document.getElementById('beam-len-input').value = bm.length.toFixed(1);
        }
    } else if (type === 'floorHatch' && id) {
        const h = state.floorHatches.find(p => p.id === id);
        const floorHatchFields = document.getElementById('floor-hatch-edit-fields');
        if (h && floorHatchFields) {
            noSel.classList.add('hidden');
            floorHatchFields.classList.remove('hidden');
            document.getElementById('floor-hatch-name-input').value = h.name;
            document.getElementById('floor-hatch-width-input').value = h.w;
            document.getElementById('floor-hatch-length-input').value = h.l;
            document.getElementById('floor-hatch-target-select').value = h.target || 'floor';
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

    const width = type === 'door' ? 3.0 : (type === 'crawl_door' ? 3.0 : 4.0);
    const height = type === 'door' ? 6.8 : (type === 'crawl_door' ? 2.0 : 4.0);
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
                        ${room.type === 'custom' && room.vertices
                            ? room.vertices.map((v, i) => `<option value="${i}" ${op.wall === i.toString() ? 'selected' : ''}>Wall ${i+1}</option>`).join('')
                            : `
                                <option value="n" ${op.wall === 'n' ? 'selected' : ''}>N</option>
                                <option value="e" ${op.wall === 'e' ? 'selected' : ''}>E</option>
                                <option value="s" ${op.wall === 's' ? 'selected' : ''}>S</option>
                                <option value="w" ${op.wall === 'w' ? 'selected' : ''}>W</option>
                            `
                        }
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

    const bondPocketRow = document.getElementById('metric-bond-pockets-row');
    const bondPocketCans = document.getElementById('metric-bond-pockets-cans');
    
    if (room.foamBondPockets && room.joists && room.joists !== 'none') {
        const segments = getRoomSegments(room);
        let wallLen = 0;
        segments.forEach(seg => {
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            if (room.joists === 'ns') {
                wallLen += Math.abs(dx);
            } else if (room.joists === 'ew') {
                wallLen += Math.abs(dy);
            }
        });
        const roomBF = wallLen * 1.5;
        const cans = Math.ceil(roomBF / 20);
        
        if (bondPocketRow) bondPocketRow.style.display = 'flex';
        if (bondPocketCans) bondPocketCans.innerText = `${cans} cans (${roomBF.toFixed(1)} BF)`;
    } else {
        if (bondPocketRow) bondPocketRow.style.display = 'none';
    }

    updateGlobalStats();
}

// Helper to calculate the exterior wall perimeter of a room (excluding shared/touching walls on the same floor)
function getRoomExteriorPerimeter(room) {
    let extPerimeter = 0;
    const segments = getRoomSegments(room);
    
    segments.forEach(seg => {
        const mx = (seg.x1 + seg.x2) / 2;
        const my = (seg.y1 + seg.y2) / 2;
        
        let isShared = false;
        // Check other rooms
        for (let i = 0; i < state.rooms.length; i++) {
            const other = state.rooms[i];
            if (other.id === room.id || other.levelId !== room.levelId) continue;
            
            const otherSegs = getRoomSegments(other);
            for (let j = 0; j < otherSegs.length; j++) {
                const oSeg = otherSegs[j];
                const dist = getDistanceToSegment(mx, my, oSeg.x1, oSeg.y1, oSeg.x2, oSeg.y2);
                if (dist < 0.25) { // within 3 inches
                    isShared = true;
                    break;
                }
            }
            if (isShared) break;
        }
        
        if (!isShared) {
            extPerimeter += Math.sqrt((seg.x2 - seg.x1)**2 + (seg.y2 - seg.y1)**2);
        }
    });
    
    return extPerimeter;
}

// Automatically space straps: start 2ft from corners, then space roughly 5ft apart
function autoSpaceCarbonStraps(room) {
    room.customCarbonStraps = [];
    const segments = getRoomSegments(room);
    
    segments.forEach(seg => {
        // Only place on walls included in carbonFiberWalls if scope is 'specific'
        if (room.carbonFiberScope === 'specific' && Array.isArray(room.carbonFiberWalls)) {
            if (!room.carbonFiberWalls.includes(seg.wall)) return;
        }
        
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        const len = Math.sqrt(dx*dx + dy*dy);
        
        if (len < 4.0) {
            // Short wall: place 1 strap at the center if length is at least 1.5 ft
            if (len >= 1.5) {
                room.customCarbonStraps.push({
                    id: 'strap_' + Math.random().toString(36).substr(2, 9),
                    wall: seg.wall,
                    offset: 0.5
                });
            }
        } else {
            // Standard wall: start 2ft from each corner, space roughly 5ft
            const availableLen = len - 4.0;
            const intervals = Math.round(availableLen / 5.0);
            const count = intervals + 1;
            
            if (count === 1) {
                room.customCarbonStraps.push({
                    id: 'strap_' + Math.random().toString(36).substr(2, 9),
                    wall: seg.wall,
                    offset: 0.5
                });
            } else {
                const spacing = availableLen / (count - 1);
                for (let i = 0; i < count; i++) {
                    const distFromStart = 2.0 + i * spacing;
                    const ratio = distFromStart / len;
                    room.customCarbonStraps.push({
                        id: 'strap_' + Math.random().toString(36).substr(2, 9),
                        wall: seg.wall,
                        offset: Math.max(0.01, Math.min(0.99, ratio))
                    });
                }
            }
        }
    });
    
    room.carbonStraps = room.customCarbonStraps.length;
}

// Initialize or synchronize manual custom straps to match count
function initializeCustomStraps(room) {
    if (!room.customCarbonStraps) room.customCarbonStraps = [];
    const count = room.carbonStraps || 0;
    if (room.customCarbonStraps.length === count) return;
    
    const segments = getRoomSegments(room);
    if (segments.length === 0) return;
    
    if (room.customCarbonStraps.length < count) {
        const needed = count - room.customCarbonStraps.length;
        for (let i = 0; i < needed; i++) {
            const segIdx = (room.customCarbonStraps.length) % segments.length;
            const seg = segments[segIdx];
            // Space offset ratios safely
            const sameSegCount = room.customCarbonStraps.filter(s => s.wall === seg.wall).length;
            const offset = Math.max(0.1, Math.min(0.9, 0.2 + (sameSegCount * 0.2) % 0.6));
            room.customCarbonStraps.push({
                id: 'strap_' + Math.random().toString(36).substr(2, 9),
                wall: seg.wall,
                offset: offset
            });
        }
    } else if (room.customCarbonStraps.length > count) {
        room.customCarbonStraps = room.customCarbonStraps.slice(0, count);
    }
}

// Helper to get all wall segments of a room
function getRoomSegments(room) {
    const segs = [];
    if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
        for (let i = 0; i < room.vertices.length; i++) {
            const v1 = room.vertices[i];
            const v2 = room.vertices[(i + 1) % room.vertices.length];
            segs.push({
                x1: room.x + v1.x,
                y1: room.y + v1.y,
                x2: room.x + v2.x,
                y2: room.y + v2.y,
                wall: i.toString()
            });
        }
    } else {
        const x = room.x;
        const y = room.y;
        const w = room.w;
        const l = room.l;
        segs.push({ x1: x, y1: y, x2: x + w, y2: y, wall: 'n' }); // North
        segs.push({ x1: x + w, y1: y, x2: x + w, y2: y + l, wall: 'e' }); // East
        segs.push({ x1: x, y1: y + l, x2: x + w, y2: y + l, wall: 's' }); // South
        segs.push({ x1: x, y1: y, x2: x, y2: y + l, wall: 'w' }); // West
    }
    return segs;
}

// Helper to estimate total PVC sticks and elbow fittings based on pipeline geometry
function estimatePlumbingMaterials() {
    let totalFootage = 0;
    let totalDrainTile = 0;
    let elbow90 = 0;
    let elbow45 = 0;
    
    let sumpCount = state.sumpPumps.length;
    let bushing3to2 = sumpCount * 1;
    let tee3x3x2 = sumpCount * 1;
    let elbow3in90 = sumpCount * 1;
    let screwAdapter1_5 = sumpCount * 2;
    let checkValve2 = sumpCount * 2;
    let yFitting2 = sumpCount * 1;
    
    // Add sump pump specific 2" elbows and 45s:
    // - 2 x 2" 90s from package
    // - 1 x 2" 90 where pvc goes up out of the sump
    // - 1 x 2" 45 from package
    elbow90 += sumpCount * 3;
    elbow45 += sumpCount * 1;
    
    // 1. Calculate PVC and Drain Tile footage
    state.dischargeLines.forEach(dl => { totalDrainTile += dl.length; });
    state.interiorPipes.forEach(ip => { totalFootage += ip.length; });
    state.sumpPumps.forEach(sp => {
        const spLevelId = sp.levelId || 'basement';
        const level = state.levels.find(l => l.id === spLevelId) || { height: 8 };
        const room = getRoomAt(sp.x, sp.y, spLevelId);
        const roomH = room ? room.h : (level.height || 8);
        totalFootage += (roomH - 0.2);
        
        // 1 x 90-degree elbow for riser top to horizontal run connection
        elbow90 += 1;
    });
    
    // 2. Identify pipe-to-pipe connections (only for PVC interior pipes)
    const pipes = [];
    state.interiorPipes.forEach(ip => {
        pipes.push({ x1: ip.x1, y1: ip.y1, x2: ip.x2, y2: ip.y2, levelId: ip.levelId || 'basement' });
    });
    
    const connectedPairs = new Set();
    
    for (let i = 0; i < pipes.length; i++) {
        for (let j = i + 1; j < pipes.length; j++) {
            const pA = pipes[i];
            const pB = pipes[j];
            if (pA.levelId !== pB.levelId) continue;
            
            let connected = false;
            let ax, ay, bx, by;
            
            if (Math.sqrt((pA.x1 - pB.x1)**2 + (pA.y1 - pB.y1)**2) < 0.25) {
                connected = true;
                ax = pA.x2 - pA.x1; ay = pA.y2 - pA.y1;
                bx = pB.x2 - pB.x1; by = pB.y2 - pB.y1;
            }
            else if (Math.sqrt((pA.x1 - pB.x2)**2 + (pA.y1 - pB.y2)**2) < 0.25) {
                connected = true;
                ax = pA.x2 - pA.x1; ay = pA.y2 - pA.y1;
                bx = pB.x1 - pB.x2; by = pB.y1 - pB.y2;
            }
            else if (Math.sqrt((pA.x2 - pB.x1)**2 + (pA.y2 - pB.y1)**2) < 0.25) {
                connected = true;
                ax = pA.x1 - pA.x2; ay = pA.y1 - pA.y2;
                bx = pB.x2 - pB.x1; by = pB.y2 - pB.y1;
            }
            else if (Math.sqrt((pA.x2 - pB.x2)**2 + (pA.y2 - pB.y2)**2) < 0.25) {
                connected = true;
                ax = pA.x1 - pA.x2; ay = pA.y1 - pA.y2;
                bx = pB.x1 - pB.x2; by = pB.y1 - pB.y2;
            }
            
            if (connected) {
                const key = `${i}_${j}`;
                if (!connectedPairs.has(key)) {
                    connectedPairs.add(key);
                    
                    const dot = ax * bx + ay * by;
                    const lenA = Math.sqrt(ax*ax + ay*ay);
                    const lenB = Math.sqrt(bx*bx + by*by);
                    if (lenA > 0.01 && lenB > 0.01) {
                        const cosTheta = Math.max(-1, Math.min(1, dot / (lenA * lenB)));
                        const rad = Math.acos(cosTheta);
                        const deg = rad * 180 / Math.PI;
                        const deflection = Math.abs(180 - deg);
                        
                        if (Math.abs(deflection - 90) <= 25) {
                            elbow90 += 1;
                        } else if (Math.abs(deflection - 45) <= 20) {
                            elbow45 += 1;
                        }
                    }
                }
            }
        }
    }
    
    const sticks = Math.ceil(totalFootage / 10);
    return {
        sticks,
        elbow90,
        elbow45,
        drainTile: totalDrainTile,
        bushing3to2,
        tee3x3x2,
        elbow3in90,
        screwAdapter1_5,
        checkValve2,
        yFitting2
    };
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
    
    let totalInteriorPipeLen = 0;
    state.interiorPipes.forEach(ip => { totalInteriorPipeLen += ip.length; });
    
    document.getElementById('total-sumps-count').innerText = totalSumpCount;
    document.getElementById('total-discharge-length').innerText = `${totalDischargeLen.toFixed(1)} ft`;
    const intPipeText = document.getElementById('total-interior-pipe-length');
    if (intPipeText) intPipeText.innerText = `${totalInteriorPipeLen.toFixed(1)} ft`;

    // XPS Foam Board Sheets estimation
    let totalXpsSheets = 0;
    state.rooms.forEach(room => {
        if (room.foamBoard) {
            const extPerim = getRoomExteriorPerimeter(room);
            let sheets = 0;
            if (room.h <= 4) {
                // Lay sheets horizontally (8' wide, 4' high)
                sheets = extPerim / 8;
            } else {
                // Stand sheets vertically (4' wide, 8' high)
                const columns = extPerim / 4;
                const sheetsPerColumn = Math.ceil(room.h / 8);
                sheets = columns * sheetsPerColumn;
            }
            let deductions = 0;
            room.openings.forEach(op => { deductions += (op.w * op.h) / 32; });
            totalXpsSheets += Math.max(0, sheets - deductions);
        }
    });

    // Plumbing BOM (pvc sticks & fittings)
    const plumbingEst = estimatePlumbingMaterials();

    const xpsText = document.getElementById('total-foam-sheets');
    if (xpsText) xpsText.innerText = `${Math.ceil(totalXpsSheets)} sheets`;

    const sticksText = document.getElementById('total-pvc-sticks');
    if (sticksText) sticksText.innerText = `${plumbingEst.sticks} sticks`;

    const elbows90Text = document.getElementById('total-pvc-90s');
    if (elbows90Text) elbows90Text.innerText = plumbingEst.elbow90;

    const elbows45Text = document.getElementById('total-pvc-45s');
    if (elbows45Text) elbows45Text.innerText = plumbingEst.elbow45;

    const tileText = document.getElementById('total-drain-tile');
    if (tileText) tileText.innerText = `${plumbingEst.drainTile.toFixed(1)} ft`;

    // Populate and show/hide Sump Install Fittings Package
    const sumpFittingsGroup = document.getElementById('sump-fittings-group');
    if (sumpFittingsGroup) {
        if (state.sumpPumps.length > 0) {
            sumpFittingsGroup.classList.remove('hidden');
            
            const bText = document.getElementById('total-bushing-3-2');
            const tText = document.getElementById('total-tee-3-3-2');
            const e3Text = document.getElementById('total-elbow-3-90');
            const sText = document.getElementById('total-screw-adapter');
            const cText = document.getElementById('total-check-valve');
            const yText = document.getElementById('total-y-fitting');
            
            if (bText) bText.innerText = plumbingEst.bushing3to2;
            if (tText) tText.innerText = plumbingEst.tee3x3x2;
            if (e3Text) e3Text.innerText = plumbingEst.elbow3in90;
            if (sText) sText.innerText = plumbingEst.screwAdapter1_5;
            if (cText) cText.innerText = plumbingEst.checkValve2;
            if (yText) yText.innerText = plumbingEst.yFitting2;
        } else {
            sumpFittingsGroup.classList.add('hidden');
        }
    }

    // Vapor Barrier Liner calculation
    let totalLinerArea = 0;
    state.rooms.forEach(room => {
        let floorArea, perimeter;
        if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
            floorArea = getPolygonArea(room.vertices);
            perimeter = getPolygonPerimeter(room.vertices);
        } else {
            floorArea = room.w * room.l;
            perimeter = 2 * (room.w + room.l);
        }
        
        let grossWallArea;
        if (room.type === 'staircase') {
            grossWallArea = (room.l * room.h) + (room.w * room.h);
        } else {
            grossWallArea = perimeter * room.h;
        }
        let deductions = 0;
        room.openings.forEach(op => { deductions += op.w * op.h; });
        const netWallArea = Math.max(0, grossWallArea - deductions);
        
        totalLinerArea += floorArea + netWallArea;
    });

    state.stanchions.forEach(st => {
        const stLevelId = st.levelId || 'basement';
        const level = state.levels.find(l => l.id === stLevelId) || { height: 8 };
        const room = getRoomAt(st.x, st.y, stLevelId);
        const roomH = room ? room.h : (level.height || 8);
        
        let isUnderBeam = false;
        const bHeight = 0.9;
        for (let i = 0; i < state.mainBeams.length; i++) {
            const bm = state.mainBeams[i];
            if (bm.levelId !== stLevelId) continue;
            const dist = getDistanceToSegment(st.x, st.y, bm.x1, bm.y1, bm.x2, bm.y2);
            if (dist < 0.5) {
                isUnderBeam = true;
                break;
            }
        }
        const postH = isUnderBeam ? Math.max(0.5, roomH - bHeight) : roomH;
        
        let perim = 0;
        if (st.type === 'round') {
            perim = 2 * Math.PI * 0.4;
        } else if (st.type === 'square') {
            perim = 4 * 0.8;
        } else if (st.type === 'brick') {
            perim = 4 * 1.0;
        }
        totalLinerArea += perim * postH;
    });

    const linerText = document.getElementById('total-barrier-liner');
    if (linerText) linerText.innerText = `${totalLinerArea.toFixed(0)} sq ft`;

    // Carbon Fiber and NB1 calculations
    let totalCarbonFiberLen = 0;
    let totalNb1Area = 0;
    
    state.rooms.forEach(room => {
        let perimeter;
        if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
            perimeter = getPolygonPerimeter(room.vertices);
        } else {
            perimeter = 2 * (room.w + room.l);
        }
        
        // Vertical straps
        if (room.carbonStraps > 0) {
            totalCarbonFiberLen += room.carbonStraps * room.h;
        }
        
        // Floor perimeter strap
        if (room.floorPerimeterStrap) {
            totalCarbonFiberLen += perimeter;
        }
        
        // NB1 Coating Area
        if (room.nb1Height === '2ft') {
            totalNb1Area += perimeter * 2;
        } else if (room.nb1Height === '4ft') {
            totalNb1Area += perimeter * 4;
        } else if (room.nb1Height === 'full') {
            // Use net wall area
            let grossWallArea;
            if (room.type === 'staircase') {
                grossWallArea = (room.l * room.h) + (room.w * room.h);
            } else {
                grossWallArea = perimeter * room.h;
            }
            let deductions = 0;
            room.openings.forEach(op => { deductions += op.w * op.h; });
            totalNb1Area += Math.max(0, grossWallArea - deductions);
        }
    });
    
    const carbonText = document.getElementById('total-carbon-fiber');
    if (carbonText) carbonText.innerText = `${totalCarbonFiberLen.toFixed(1)} ft`;
    
    const nb1Bags = Math.ceil(totalNb1Area / 8);
    const nb1Text = document.getElementById('total-nb1-bags');
    if (nb1Text) nb1Text.innerText = `${nb1Bags} bags (${totalNb1Area.toFixed(0)} sq ft)`;

    // Spray Foam Cans calculation
    let totalSprayFoamCans = 0;
    state.rooms.forEach(room => {
        if (room.foamBondPockets && room.joists && room.joists !== 'none') {
            const segments = getRoomSegments(room);
            let wallLen = 0;
            segments.forEach(seg => {
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                if (room.joists === 'ns') {
                    wallLen += Math.abs(dx);
                } else if (room.joists === 'ew') {
                    wallLen += Math.abs(dy);
                }
            });
            const roomBF = wallLen * 1.5;
            totalSprayFoamCans += Math.ceil(roomBF / 20);
        }
    });

    const foamCansText = document.getElementById('total-bond-pockets-cans');
    if (foamCansText) foamCansText.innerText = `${totalSprayFoamCans} cans`;
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

function deleteSelectedInteriorPipe() {
    if (!state.selectedInteriorPipeId) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.interiorPipes = state.interiorPipes.filter(p => p.id !== state.selectedInteriorPipeId);
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
}

function deleteSelectedStanchion() {
    if (!state.selectedStanchionId) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.stanchions = state.stanchions.filter(p => p.id !== state.selectedStanchionId);
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
}

function deleteSelectedMainBeam() {
    if (!state.selectedMainBeamId) return;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.mainBeams = state.mainBeams.filter(l => l.id !== state.selectedMainBeamId);
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
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
    state.isPrintingMode = isPrinting;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (isPrinting) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    if (state.showGrid && !isPrinting) {
        drawGrid();
    }
    
    if (!isPrinting && state.draggedRoomId && state.draggedHandle === 'move') {
        drawSnappingGuidelines();
    }

    // 1. Draw rooms
    state.rooms.forEach(room => {
        if (!room.levelId || room.levelId === state.currentLevelId) {
            drawRoom(room);
        }
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
        if (dl.levelId && dl.levelId !== state.currentLevelId) return;
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

    // Draw interior pipes
    state.interiorPipes.forEach(ip => {
        if (ip.levelId && ip.levelId !== state.currentLevelId) return;
        const x1 = toCanvasX(ip.x1);
        const y1 = toCanvasY(ip.y1);
        const x2 = toCanvasX(ip.x2);
        const y2 = toCanvasY(ip.y2);
        const isSelected = ip.id === state.selectedInteriorPipeId;
        
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : '#64748b';
        ctx.lineWidth = isSelected ? 4 : 2.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
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
        
        // Length label
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
        
        const label = `${ip.label}: ${ip.length.toFixed(1)} ft`;
        ctx.font = '600 10px var(--font-mono)';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(10, 13, 20, 0.8)';
        ctx.fillRect(-textWidth/2 - 4, -14, textWidth + 8, 14);
        
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, -4);
        ctx.restore();
    });

    // 3. Draw sump pumps
    state.sumpPumps.forEach(sp => {
        if (sp.levelId && sp.levelId !== state.currentLevelId) return;
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
        ctx.fillStyle = c('rgba(16, 22, 35, 0.9)', '#e2e8f0');
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : '#f59e0b';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
        
        // Inner dotted ring
        ctx.strokeStyle = c('rgba(255, 255, 255, 0.3)', 'rgba(0, 0, 0, 0.3)');
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Label
        ctx.fillStyle = c('#ffffff', '#0f172a');
        ctx.font = '700 8px var(--font-sans)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SP', cx, cy);
        
        // Floating label
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : c(varColor('--text-muted'), '#475569');
        ctx.font = '600 9px var(--font-sans)';
        ctx.fillText(sp.name, cx, cy - radius - 6);
    });

    // Draw Stanchions
    state.stanchions.forEach(st => {
        if (st.levelId && st.levelId !== state.currentLevelId) return;
        const cx = toCanvasX(st.x);
        const cy = toCanvasY(st.y);
        const isSelected = st.id === state.selectedStanchionId;
        const radius = 0.5 * state.scale; // 1ft diameter
        
        if (st.type === 'brick') {
            ctx.fillStyle = isSelected ? 'rgba(194, 65, 12, 0.2)' : '#c2410c';
            ctx.strokeStyle = isSelected ? varColor('--accent-teal') : '#ea580c';
        } else {
            ctx.fillStyle = isSelected ? 'rgba(20, 184, 166, 0.2)' : '#475569';
            ctx.strokeStyle = isSelected ? varColor('--accent-teal') : '#94a3b8';
        }
        ctx.lineWidth = isSelected ? 3 : 2;
        
        ctx.beginPath();
        if (st.type === 'square' || st.type === 'brick') {
            ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
        } else {
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
        
        // Internal Crosshair X
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : c('rgba(255, 255, 255, 0.4)', 'rgba(0, 0, 0, 0.4)');
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (st.type === 'square' || st.type === 'brick') {
            ctx.moveTo(cx - radius + 2, cy - radius + 2);
            ctx.lineTo(cx + radius - 2, cy + radius - 2);
            ctx.moveTo(cx + radius - 2, cy - radius + 2);
            ctx.lineTo(cx - radius + 2, cy + radius - 2);
        } else {
            const offset = radius * 0.707;
            ctx.moveTo(cx - offset, cy - offset);
            ctx.lineTo(cx + offset, cy + offset);
            ctx.moveTo(cx + offset, cy - offset);
            ctx.lineTo(cx - offset, cy + offset);
        }
        ctx.stroke();
        
        // Floating label
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : c(varColor('--text-muted'), '#475569');
        ctx.font = '600 9px var(--font-sans)';
        ctx.textAlign = 'center';
        ctx.fillText(st.name, cx, cy - radius - 6);
    });

    // Draw Floor Hatches
    state.floorHatches.forEach(h => {
        if (h.levelId && h.levelId !== state.currentLevelId) return;
        const cx = toCanvasX(h.x);
        const cy = toCanvasY(h.y);
        const isSelected = h.id === state.selectedFloorHatchId;
        const wPix = h.w * state.scale;
        const lPix = h.l * state.scale;
        
        ctx.fillStyle = isSelected ? 'rgba(236, 72, 153, 0.2)' : 'rgba(30, 41, 59, 0.6)';
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : '#ec4899';
        ctx.lineWidth = isSelected ? 3 : 2;
        
        ctx.beginPath();
        ctx.rect(cx - wPix / 2, cy - lPix / 2, wPix, lPix);
        ctx.fill();
        ctx.stroke();
        
        // Crossed lines for hatch designation
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : 'rgba(236, 72, 153, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - wPix / 2, cy - lPix / 2);
        ctx.lineTo(cx + wPix / 2, cy + lPix / 2);
        ctx.moveTo(cx + wPix / 2, cy - lPix / 2);
        ctx.lineTo(cx - wPix / 2, cy + lPix / 2);
        ctx.stroke();
        
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : '#ec4899';
        ctx.font = '600 8px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelText = (h.target === 'ceiling' ? 'CEILING HATCH' : 'FLOOR HATCH');
        ctx.fillText(labelText, cx, cy);
        
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : c(varColor('--text-muted'), '#475569');
        ctx.font = '600 9px var(--font-sans)';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(h.name, cx, cy - lPix / 2 - 6);
    });

    // Draw Support Beams
    state.mainBeams.forEach(bm => {
        if (bm.levelId && bm.levelId !== state.currentLevelId) return;
        const x1 = toCanvasX(bm.x1);
        const y1 = toCanvasY(bm.y1);
        const x2 = toCanvasX(bm.x2);
        const y2 = toCanvasY(bm.y2);
        const isSelected = bm.id === state.selectedMainBeamId;
        
        const color = bm.type === 'steel' ? '#475569' : '#b45309';
        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : color;
        ctx.lineWidth = isSelected ? 8 : 6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        ctx.strokeStyle = bm.type === 'steel' ? '#94a3b8' : '#d97706';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
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
        
        // Label
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
        
        const label = `${bm.label}: ${bm.length.toFixed(1)} ft`;
        ctx.font = '600 10px var(--font-mono)';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = c('rgba(10, 13, 20, 0.8)', '#ffffff');
        ctx.fillRect(-textWidth/2 - 4, -14, textWidth + 8, 14);
        
        ctx.fillStyle = isSelected ? varColor('--accent-teal') : c('#ffffff', '#0f172a');
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, -4);
        ctx.restore();
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

// Helper to render floor joists grid inside rooms
function drawJoists(room) {
    if (!room.joists || room.joists === 'none') return;
    
    ctx.save();
    
    // Set clip path to room bounds
    ctx.beginPath();
    if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
        ctx.moveTo(toCanvasX(room.x + room.vertices[0].x), toCanvasY(room.y + room.vertices[0].y));
        for (let i = 1; i < room.vertices.length; i++) {
            ctx.lineTo(toCanvasX(room.x + room.vertices[i].x), toCanvasY(room.y + room.vertices[i].y));
        }
    } else {
        const rx = toCanvasX(room.x);
        const ry = toCanvasY(room.y);
        const rw = room.w * state.scale;
        const rl = room.l * state.scale;
        ctx.rect(rx, ry, rw, rl);
    }
    ctx.clip();
    
    // Draw parallel joist lines
    ctx.strokeStyle = c('rgba(255, 255, 255, 0.08)', 'rgba(0, 0, 0, 0.15)');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    let minX = room.x, maxX = room.x + (room.w || 0);
    let minY = room.y, maxY = room.y + (room.l || 0);
    if (room.type === 'custom' && room.vertices) {
        minX = Infinity; maxX = -Infinity;
        minY = Infinity; maxY = -Infinity;
        room.vertices.forEach(v => {
            const wx = room.x + v.x;
            const wy = room.y + v.y;
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
        });
    }
    
    const spacing = 1.333; // 16 inches spacing
    
    if (room.joists === 'ns') {
        for (let x = Math.ceil(minX / spacing) * spacing; x < maxX; x += spacing) {
            const cx = toCanvasX(x);
            ctx.beginPath();
            ctx.moveTo(cx, toCanvasY(minY));
            ctx.lineTo(cx, toCanvasY(maxY));
            ctx.stroke();
        }
    } else if (room.joists === 'ew') {
        for (let y = Math.ceil(minY / spacing) * spacing; y < maxY; y += spacing) {
            const cy = toCanvasY(y);
            ctx.beginPath();
            ctx.moveTo(toCanvasX(minX), cy);
            ctx.lineTo(toCanvasX(maxX), cy);
            ctx.stroke();
        }
    }
    
    ctx.restore();
}

function drawRoom(room) {
    const rx = toCanvasX(room.x);
    const ry = toCanvasY(room.y);
    const rw = room.w * state.scale;
    const rl = room.l * state.scale;
    const isSelected = room.id === state.selectedRoomId;

    // Draw 2D XPS Foam Board insulation lines on exterior walls
    if (room.foamBoard) {
        const segments = getRoomSegments(room);
        ctx.save();
        ctx.strokeStyle = '#f472b6'; // Owens Corning Pink
        ctx.lineWidth = 5; // Thick insulation line
        segments.forEach(seg => {
            const mx = (seg.x1 + seg.x2) / 2;
            const my = (seg.y1 + seg.y2) / 2;
            
            let isShared = false;
            for (let i = 0; i < state.rooms.length; i++) {
                const other = state.rooms[i];
                if (other.id === room.id || other.levelId !== room.levelId) continue;
                
                const otherSegs = getRoomSegments(other);
                for (let j = 0; j < otherSegs.length; j++) {
                    const oSeg = otherSegs[j];
                    const dist = getDistanceToSegment(mx, my, oSeg.x1, oSeg.y1, oSeg.x2, oSeg.y2);
                    if (dist < 0.25) {
                        isShared = true;
                        break;
                    }
                }
                if (isShared) break;
            }
            
            if (!isShared) {
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                const len = Math.sqrt(dx*dx + dy*dy);
                if (len > 0.05) {
                    const nx = -dy / len;
                    const ny = dx / len;
                    const testDist = 0.5;
                    const testX = mx + nx * testDist;
                    const testY = my + ny * testDist;
                    const inRoom = getRoomAt(testX, testY, room.levelId);
                    
                    const mul = (inRoom && inRoom.id === room.id) ? 1 : -1;
                    const offsetDist = 0.15; // Offset inside room in feet
                    const ox = nx * offsetDist * mul;
                    const oy = ny * offsetDist * mul;
                    
                    ctx.beginPath();
                    ctx.moveTo(toCanvasX(seg.x1 + ox), toCanvasY(seg.y1 + oy));
                    ctx.lineTo(toCanvasX(seg.x2 + ox), toCanvasY(seg.y2 + oy));
                    ctx.stroke();
                }
            }
        });
        ctx.restore();
    }

    // Draw 2D Floor Perimeter Carbon Fiber Strap
    if (room.floorPerimeterStrap) {
        const segments = getRoomSegments(room);
        ctx.save();
        ctx.strokeStyle = '#38bdf8'; // Sky blue to match sidebar totals
        ctx.lineWidth = 2.5;
        segments.forEach(seg => {
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0.05) {
                const nx = -dy / len;
                const ny = dx / len;
                const testDist = 0.5;
                const mx = (seg.x1 + seg.x2) / 2;
                const my = (seg.y1 + seg.y2) / 2;
                const testX = mx + nx * testDist;
                const testY = my + ny * testDist;
                const inRoom = getRoomAt(testX, testY, room.levelId);
                
                const mul = (inRoom && inRoom.id === room.id) ? 1 : -1;
                const offsetDist = 0.1; // Offset slightly inside
                const ox = nx * offsetDist * mul;
                const oy = ny * offsetDist * mul;
                
                ctx.beginPath();
                ctx.moveTo(toCanvasX(seg.x1 + ox), toCanvasY(seg.y1 + oy));
                ctx.lineTo(toCanvasX(seg.x2 + ox), toCanvasY(seg.y2 + oy));
                ctx.stroke();
            }
        });
        ctx.restore();
    }

    // Draw 2D Carbon Fiber Straps (Vertical tick marks)
    if (room.carbonStraps > 0) {
        const segments = getRoomSegments(room);
        
        if (room.carbonFiberScope === 'specific' && room.customCarbonStraps && room.customCarbonStraps.length > 0) {
            // Manual Custom Placed Straps
            ctx.save();
            ctx.strokeStyle = '#0f172a'; // Deep charcoal/black
            ctx.lineWidth = 3;
            
            room.customCarbonStraps.forEach(strap => {
                const seg = segments.find(s => s.wall === strap.wall);
                if (!seg) return;
                
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                const len = Math.sqrt(dx*dx + dy*dy);
                if (len < 0.05) return;
                
                const px = seg.x1 + dx * strap.offset;
                const py = seg.y1 + dy * strap.offset;
                
                const nx = -dy / len;
                const ny = dx / len;
                const testDist = 0.5;
                const testX = px + nx * testDist;
                const testY = py + ny * testDist;
                const inRoom = getRoomAt(testX, testY, room.levelId);
                const mul = (inRoom && inRoom.id === room.id) ? 1 : -1;
                
                const tickLen = 0.45;
                const ox = nx * mul;
                const oy = ny * mul;
                
                // Draw strap tick mark
                ctx.beginPath();
                ctx.moveTo(toCanvasX(px), toCanvasY(py));
                ctx.lineTo(toCanvasX(px + ox * tickLen), toCanvasY(py + oy * tickLen));
                ctx.stroke();
                
                // If this is the selected room, draw a small draggable grab handle at the end of the tick mark!
                if (state.selectedRoomId === room.id) {
                    ctx.save();
                    ctx.fillStyle = '#2dd4bf'; // Teal active grab handle
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    const hx = toCanvasX(px + ox * tickLen * 0.5);
                    const hy = toCanvasY(py + oy * tickLen * 0.5);
                    ctx.arc(hx, hy, 5, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            });
            ctx.restore();
        } else {
            // Automatic Even Spacing (Scope is 'full' or no custom straps array yet)
            let drawSegments = segments;
            if (room.carbonFiberScope === 'specific' && Array.isArray(room.carbonFiberWalls)) {
                drawSegments = segments.filter(seg => room.carbonFiberWalls.includes(seg.wall));
            }
            let totalPerim = 0;
            const segData = [];
            drawSegments.forEach(seg => {
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                const len = Math.sqrt(dx*dx + dy*dy);
                if (len > 0.05) {
                    totalPerim += len;
                    segData.push({ seg, len, dx, dy });
                }
            });
            
            if (totalPerim > 0 && segData.length > 0) {
                const N = room.carbonStraps;
                const spacing = totalPerim / N;
                
                ctx.save();
                ctx.strokeStyle = '#0f172a'; // Deep charcoal/black
                ctx.lineWidth = 3;
                
                let currentDist = spacing / 2;
                let currentSegIdx = 0;
                let accumulatedDist = 0;
                
                for (let i = 0; i < N; i++) {
                    while (currentSegIdx < segData.length && accumulatedDist + segData[currentSegIdx].len < currentDist) {
                        accumulatedDist += segData[currentSegIdx].len;
                        currentSegIdx++;
                    }
                    if (currentSegIdx >= segData.length) break;
                    
                    const s = segData[currentSegIdx];
                    const distInSeg = currentDist - accumulatedDist;
                    const ratio = distInSeg / s.len;
                    
                    const px = s.seg.x1 + s.dx * ratio;
                    const py = s.seg.y1 + s.dy * ratio;
                    
                    const nx = -s.dy / s.len;
                    const ny = s.dx / s.len;
                    const testDist = 0.5;
                    const testX = px + nx * testDist;
                    const testY = py + ny * testDist;
                    const inRoom = getRoomAt(testX, testY, room.levelId);
                    const mul = (inRoom && inRoom.id === room.id) ? 1 : -1;
                    
                    const tickLen = 0.35;
                    const ox = nx * mul;
                    const oy = ny * mul;
                    
                    ctx.beginPath();
                    ctx.moveTo(toCanvasX(px), toCanvasY(py));
                    ctx.lineTo(toCanvasX(px + ox * tickLen), toCanvasY(py + oy * tickLen));
                    ctx.stroke();
                    
                    currentDist += spacing;
                }
                ctx.restore();
            }
        }
    }

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
        drawJoists(room);

        ctx.strokeStyle = isSelected ? varColor('--accent-teal') : c('rgba(255, 255, 255, 0.3)', '#1e293b');
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.stroke();

        // Calculate Average center for Room Name Label
        let sumX = 0, sumY = 0;
        room.vertices.forEach(v => { sumX += v.x; sumY += v.y; });
        const avgX = room.x + sumX / room.vertices.length;
        const avgY = room.y + sumY / room.vertices.length;

        ctx.fillStyle = isSelected ? c('#ffffff', '#0f172a') : c(varColor('--text-muted'), '#475569');
        ctx.font = `600 13px var(--font-sans)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(room.name, toCanvasX(avgX), toCanvasY(avgY));

        // Draw wall segment lengths
        ctx.fillStyle = c('rgba(255, 255, 255, 0.6)', '#334155');
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
    drawJoists(room);
    // Draw staircase steps
    if (room.type === 'staircase') {
        const stepCount = room.steps || 12;
        const orient = room.stairOrientation || 'N';
        const dirText = (room.stairDirection || 'up') === 'down' ? 'DN' : 'UP';
        
        ctx.strokeStyle = c('rgba(255, 255, 255, 0.15)', 'rgba(0, 0, 0, 0.25)');
        ctx.lineWidth = 1;
        
        if (orient === 'N' || orient === 'S') {
            // Steps are horizontal
            const stepSize = rl / stepCount;
            for (let i = 1; i < stepCount; i++) {
                ctx.beginPath();
                ctx.moveTo(rx, ry + i * stepSize);
                ctx.lineTo(rx + rw, ry + i * stepSize);
                ctx.stroke();
            }
        } else {
            // Steps are vertical
            const stepSize = rw / stepCount;
            for (let i = 1; i < stepCount; i++) {
                ctx.beginPath();
                ctx.moveTo(rx + i * stepSize, ry);
                ctx.lineTo(rx + i * stepSize, ry + rl);
                ctx.stroke();
            }
        }
        
        // Draw directional climb arrow
        ctx.strokeStyle = varColor('--accent-teal') || '#00ffd1';
        ctx.lineWidth = 2;
        ctx.fillStyle = varColor('--accent-teal') || '#00ffd1';
        
        let startX, startY, endX, endY, head1X, head1Y, head2X, head2Y, textX, textY;
        
        if (orient === 'N') {
            startX = rx + rw / 2; startY = ry + rl * 0.8;
            endX = rx + rw / 2; endY = ry + rl * 0.2;
            head1X = endX - 5; head1Y = endY + 8;
            head2X = endX + 5; head2Y = endY + 8;
            textX = endX; textY = endY - 10;
        } else if (orient === 'S') {
            startX = rx + rw / 2; startY = ry + rl * 0.2;
            endX = rx + rw / 2; endY = ry + rl * 0.8;
            head1X = endX - 5; head1Y = endY - 8;
            head2X = endX + 5; head2Y = endY - 8;
            textX = endX; textY = endY + 12;
        } else if (orient === 'E') {
            startX = rx + rw * 0.2; startY = ry + rl / 2;
            endX = rx + rw * 0.8; endY = ry + rl / 2;
            head1X = endX - 8; head1Y = endY - 5;
            head2X = endX - 8; head2Y = endY + 5;
            textX = endX + 12; textY = endY;
        } else { // 'W'
            startX = rx + rw * 0.8; startY = ry + rl / 2;
            endX = rx + rw * 0.2; endY = ry + rl / 2;
            head1X = endX + 8; head1Y = endY - 5;
            head2X = endX + 8; head2Y = endY + 5;
            textX = endX - 12; textY = endY;
        }
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(head1X, head1Y);
        ctx.lineTo(endX, endY);
        ctx.lineTo(head2X, head2Y);
        ctx.stroke();
        
        ctx.font = '600 9px var(--font-sans)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dirText, textX, textY);
    }

    // Room Outline
    ctx.strokeStyle = isSelected ? varColor('--accent-teal') : c('rgba(255, 255, 255, 0.3)', '#1e293b');
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.strokeRect(rx, ry, rw, rl);

    // Label
    ctx.fillStyle = isSelected ? c('#ffffff', '#0f172a') : c(varColor('--text-muted'), '#475569');
    ctx.font = `600 13px var(--font-sans)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(room.name, rx + rw / 2, ry + rl / 2 - 8);

    // Sublabel
    ctx.fillStyle = c('rgba(255, 255, 255, 0.5)', '#334155');
    ctx.font = `500 11px var(--font-mono)`;
    ctx.fillText(`${room.w}' x ${room.l}'`, rx + rw / 2, ry + rl / 2 + 10);

    // Wall measurements
    ctx.fillStyle = c('rgba(255, 255, 255, 0.6)', '#334155');
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
        ctx.fillStyle = op.type === 'door' ? '#f59e0b' : (op.type === 'crawl_door' ? '#f97316' : '#06b6d4');
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

    ctx.fillStyle = op.type === 'door' ? '#f59e0b' : (op.type === 'crawl_door' ? '#f97316' : '#06b6d4');
    ctx.fillRect(opX, opY, opW, opH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(opX, opY, opW, opH);

    if (op.type === 'door' || op.type === 'crawl_door') {
        const strokeColor = op.type === 'door' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(249, 115, 22, 0.5)';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        
        if (op.type === 'crawl_door') {
            ctx.setLineDash([2, 2]);
        } else {
            ctx.setLineDash([]);
        }
        
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
        ctx.setLineDash([]);
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
        if (r.levelId && r.levelId !== state.currentLevelId) return;

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

    // Check manual Carbon Fiber Strap selection
    if (state.selectedRoomId) {
        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (room && room.carbonFiberScope === 'specific' && room.customCarbonStraps && room.customCarbonStraps.length > 0) {
            const segments = getRoomSegments(room);
            for (let strap of room.customCarbonStraps) {
                const seg = segments.find(s => s.wall === strap.wall);
                if (seg) {
                    const dx = seg.x2 - seg.x1;
                    const dy = seg.y2 - seg.y1;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len >= 0.05) {
                        const px = seg.x1 + dx * strap.offset;
                        const py = seg.y1 + dy * strap.offset;
                        const dist = Math.sqrt((wx - px)**2 + (wy - py)**2);
                        if (dist < 0.9) { // 0.9 feet click tolerance
                            state.draggedStrap = { roomId: room.id, strapId: strap.id };
                            selectItem('room', room.id);
                            return;
                        }
                    }
                }
            }
        }
    }

    // 0. Check Door/Window Openings click first
    for (let i = state.rooms.length - 1; i >= 0; i--) {
        const room = state.rooms[i];
        if (room.levelId && room.levelId !== state.currentLevelId) continue;
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
        if (sp.levelId && sp.levelId !== state.currentLevelId) continue;
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
        if (dl.levelId && dl.levelId !== state.currentLevelId) continue;
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

    // Check Interior Pipes click
    for (let i = state.interiorPipes.length - 1; i >= 0; i--) {
        const ip = state.interiorPipes[i];
        if (ip.levelId && ip.levelId !== state.currentLevelId) continue;
        const h1x = toCanvasX(ip.x1);
        const h1y = toCanvasY(ip.y1);
        const h2x = toCanvasX(ip.x2);
        const h2y = toCanvasY(ip.y2);
        
        if (Math.sqrt((mx - h1x)**2 + (my - h1y)**2) < 10) {
            selectItem('interiorPipe', ip.id);
            state.draggedInteriorPipeHandle = { id: ip.id, point: 'p1' };
            return;
        }
        if (Math.sqrt((mx - h2x)**2 + (my - h2y)**2) < 10) {
            selectItem('interiorPipe', ip.id);
            state.draggedInteriorPipeHandle = { id: ip.id, point: 'p2' };
            return;
        }
        
        const distToSegment = getDistanceToSegment(wx, wy, ip.x1, ip.y1, ip.x2, ip.y2);
        if (distToSegment < 0.6) {
            selectItem('interiorPipe', ip.id);
            state.draggedInteriorPipeHandle = { id: ip.id, point: 'move' };
            state.initialMouseOffset = {
                x1: wx - ip.x1,
                y1: wy - ip.y1,
                x2: wx - ip.x2,
                y2: wy - ip.y2
            };
            return;
        }
    }

    // Check Floor Hatches click
    for (let i = state.floorHatches.length - 1; i >= 0; i--) {
        const h = state.floorHatches[i];
        if (h.levelId && h.levelId !== state.currentLevelId) continue;
        const hcx = toCanvasX(h.x);
        const hcy = toCanvasY(h.y);
        const hwPix = h.w * state.scale;
        const hlPix = h.l * state.scale;
        
        if (Math.abs(mx - hcx) < hwPix / 2 && Math.abs(my - hcy) < hlPix / 2) {
            selectItem('floorHatch', h.id);
            state.draggedFloorHatchId = h.id;
            return;
        }
    }

    // Check Stanchions click
    for (let i = state.stanchions.length - 1; i >= 0; i--) {
        const st = state.stanchions[i];
        if (st.levelId && st.levelId !== state.currentLevelId) continue;
        const stcx = toCanvasX(st.x);
        const stcy = toCanvasY(st.y);
        const dist = Math.sqrt((mx - stcx)**2 + (my - stcy)**2);
        if (dist < 12) {
            selectItem('stanchion', st.id);
            state.draggedStanchionId = st.id;
            return;
        }
    }

    // Check Support Beams click
    for (let i = state.mainBeams.length - 1; i >= 0; i--) {
        const bm = state.mainBeams[i];
        if (bm.levelId && bm.levelId !== state.currentLevelId) continue;
        const h1x = toCanvasX(bm.x1);
        const h1y = toCanvasY(bm.y1);
        const h2x = toCanvasX(bm.x2);
        const h2y = toCanvasY(bm.y2);
        
        if (Math.sqrt((mx - h1x)**2 + (my - h1y)**2) < 10) {
            selectItem('beam', bm.id);
            state.draggedMainBeamHandle = { id: bm.id, point: 'p1' };
            return;
        }
        if (Math.sqrt((mx - h2x)**2 + (my - h2y)**2) < 10) {
            selectItem('beam', bm.id);
            state.draggedMainBeamHandle = { id: bm.id, point: 'p2' };
            return;
        }
        
        const distToSegment = getDistanceToSegment(wx, wy, bm.x1, bm.y1, bm.x2, bm.y2);
        if (distToSegment < 0.6) {
            selectItem('beam', bm.id);
            state.draggedMainBeamHandle = { id: bm.id, point: 'move' };
            state.initialMouseOffset = {
                x1: wx - bm.x1,
                y1: wy - bm.y1,
                x2: wx - bm.x2,
                y2: wy - bm.y2
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
        if (room.levelId && room.levelId !== state.currentLevelId) continue;
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

    // Drag manual Carbon Fiber Strap
    if (state.draggedStrap) {
        const room = state.rooms.find(r => r.id === state.draggedStrap.roomId);
        if (room && room.customCarbonStraps) {
            const strap = room.customCarbonStraps.find(s => s.id === state.draggedStrap.strapId);
            if (strap) {
                const segments = getRoomSegments(room);
                let bestSeg = null;
                let bestT = 0.5;
                let minDist = Infinity;
                
                for (let seg of segments) {
                    const dx = seg.x2 - seg.x1;
                    const dy = seg.y2 - seg.y1;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < 0.05) continue;
                    
                    let t = ((wx - seg.x1) * dx + (wy - seg.y1) * dy) / (len * len);
                    t = Math.max(0.0, Math.min(1.0, t));
                    const projX = seg.x1 + t * dx;
                    const projY = seg.y1 + t * dy;
                    const dist = Math.sqrt((wx - projX)**2 + (wy - projY)**2);
                    
                    if (dist < minDist) {
                        minDist = dist;
                        bestSeg = seg;
                        bestT = t;
                    }
                }
                
                if (bestSeg) {
                    strap.wall = bestSeg.wall;
                    strap.offset = bestT;
                    draw();
                    if (window.sync3D) window.sync3D();
                    
                    // Render details panel sidebar in real-time
                    if (typeof renderCustomStrapsList === 'function') {
                        renderCustomStrapsList(room);
                    }
                }
            }
        }
        canvas.style.cursor = 'grabbing';
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

    // Interior Pipe Dragging
    if (state.draggedInteriorPipeHandle) {
        const ip = state.interiorPipes.find(l => l.id === state.draggedInteriorPipeHandle.id);
        if (ip) {
            if (state.draggedInteriorPipeHandle.point === 'p1') {
                const dx = ip.x2 - wx;
                const dy = ip.y2 - wy;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const angle = Math.atan2(dy, dx);
                const deg = angle * 180 / Math.PI;
                const snappedDeg = Math.round(deg / 45) * 45;
                const snappedRad = snappedDeg * Math.PI / 180;
                ip.x1 = snap(ip.x2 - dist * Math.cos(snappedRad));
                ip.y1 = snap(ip.y2 - dist * Math.sin(snappedRad));
            } else if (state.draggedInteriorPipeHandle.point === 'p2') {
                const dx = wx - ip.x1;
                const dy = wy - ip.y1;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const angle = Math.atan2(dy, dx);
                const deg = angle * 180 / Math.PI;
                const snappedDeg = Math.round(deg / 45) * 45;
                const snappedRad = snappedDeg * Math.PI / 180;
                ip.x2 = snap(ip.x1 + dist * Math.cos(snappedRad));
                ip.y2 = snap(ip.y1 + dist * Math.sin(snappedRad));
            } else if (state.draggedInteriorPipeHandle.point === 'move') {
                ip.x1 = snap(wx - state.initialMouseOffset.x1);
                ip.y1 = snap(wy - state.initialMouseOffset.y1);
                ip.x2 = snap(wx - state.initialMouseOffset.x2);
                ip.y2 = snap(wy - state.initialMouseOffset.y2);
            }
            ip.length = Math.sqrt((ip.x2 - ip.x1)**2 + (ip.y2 - ip.y1)**2);
            
            // Sync length input in real-time
            if (state.selectedInteriorPipeId === ip.id) {
                const lenInput = document.getElementById('interior-pipe-len-input');
                if (lenInput) lenInput.value = ip.length.toFixed(1);
            }
            draw();
            updateGlobalStats();
        }
    }

    // Stanchion Dragging
    if (state.draggedStanchionId) {
        const st = state.stanchions.find(p => p.id === state.draggedStanchionId);
        if (st) {
            st.x = snap(wx);
            st.y = snap(wy);
            draw();
        }
        return;
    }

    // Floor Hatch Dragging
    if (state.draggedFloorHatchId) {
        const h = state.floorHatches.find(p => p.id === state.draggedFloorHatchId);
        if (h) {
            h.x = snap(wx);
            h.y = snap(wy);
            draw();
        }
        return;
    }

    // Support Beam Dragging
    if (state.draggedMainBeamHandle) {
        const bm = state.mainBeams.find(l => l.id === state.draggedMainBeamHandle.id);
        if (bm) {
            if (state.draggedMainBeamHandle.point === 'p1') {
                const dx = bm.x2 - wx;
                const dy = bm.y2 - wy;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const angle = Math.atan2(dy, dx);
                const deg = angle * 180 / Math.PI;
                const snappedDeg = Math.round(deg / 45) * 45;
                const snappedRad = snappedDeg * Math.PI / 180;
                bm.x1 = snap(bm.x2 - dist * Math.cos(snappedRad));
                bm.y1 = snap(bm.y2 - dist * Math.sin(snappedRad));
            } else if (state.draggedMainBeamHandle.point === 'p2') {
                const dx = wx - bm.x1;
                const dy = wy - bm.y1;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const angle = Math.atan2(dy, dx);
                const deg = angle * 180 / Math.PI;
                const snappedDeg = Math.round(deg / 45) * 45;
                const snappedRad = snappedDeg * Math.PI / 180;
                bm.x2 = snap(bm.x1 + dist * Math.cos(snappedRad));
                bm.y2 = snap(bm.y1 + dist * Math.sin(snappedRad));
            } else if (state.draggedMainBeamHandle.point === 'move') {
                bm.x1 = snap(wx - state.initialMouseOffset.x1);
                bm.y1 = snap(wy - state.initialMouseOffset.y1);
                bm.x2 = snap(wx - state.initialMouseOffset.x2);
                bm.y2 = snap(wy - state.initialMouseOffset.y2);
            }
            bm.length = Math.sqrt((bm.x2 - bm.x1)**2 + (bm.y2 - bm.y1)**2);
            
            // Sync length input in real-time
            if (state.selectedMainBeamId === bm.id) {
                const lenInput = document.getElementById('beam-len-input');
                if (lenInput) lenInput.value = bm.length.toFixed(1);
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
                if (r.levelId && r.levelId !== state.currentLevelId) return;
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
        if (sp.levelId && sp.levelId !== state.currentLevelId) return;
        const cx = toCanvasX(sp.x);
        const cy = toCanvasY(sp.y);
        if (Math.sqrt((mx - cx)**2 + (my - cy)**2) < 15) {
            cursor = 'pointer';
        }
    });
    
    // Hovering discharge handle
    state.dischargeLines.forEach(dl => {
        if (dl.levelId && dl.levelId !== state.currentLevelId) return;
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
        const hovered = state.rooms.find(r => {
            if (r.levelId && r.levelId !== state.currentLevelId) return false;
            return getHitHandle(r, wx, wy) === 'move';
        });
        if (hovered) cursor = 'pointer';
    }

    canvas.style.cursor = cursor;
});

canvas.addEventListener('mouseup', () => {
    // If elements were dragged, check if they actually moved and commit to history
    if (state.draggedRoomId || state.draggedSumpPumpId || state.draggedFloorHatchId || state.draggedDischargeHandle || state.draggedInteriorPipeHandle || state.draggedStanchionId || state.draggedMainBeamHandle || state.draggedOpening || state.draggedVertex || state.draggedStrap) {
        if (state.dragSnapshot) {
            const currentStr = JSON.stringify({
                rooms: state.rooms,
                sumpPumps: state.sumpPumps,
                dischargeLines: state.dischargeLines,
                interiorPipes: state.interiorPipes,
                stanchions: state.stanchions,
                mainBeams: state.mainBeams,
                floorHatches: state.floorHatches
            });
            const snapStr = JSON.stringify({
                rooms: state.dragSnapshot.rooms,
                sumpPumps: state.dragSnapshot.sumpPumps,
                dischargeLines: state.dragSnapshot.dischargeLines,
                interiorPipes: state.dragSnapshot.interiorPipes,
                stanchions: state.dragSnapshot.stanchions || [],
                mainBeams: state.dragSnapshot.mainBeams || [],
                floorHatches: state.dragSnapshot.floorHatches || []
            });
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
    state.draggedFloorHatchId = null;
    state.draggedDischargeHandle = null;
    state.draggedInteriorPipeHandle = null;
    state.draggedStanchionId = null;
    state.draggedMainBeamHandle = null;
    state.draggedOpening = null;
    state.draggedVertex = null;
    state.draggedStrap = null;
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

// Interior pipe listeners
document.getElementById('interior-pipe-label-input').addEventListener('input', (e) => {
    if (!state.selectedInteriorPipeId) return;
    const ip = state.interiorPipes.find(l => l.id === state.selectedInteriorPipeId);
    if (ip) {
        ip.label = e.target.value;
        draw();
    }
});

document.getElementById('interior-pipe-len-input').addEventListener('input', (e) => {
    if (!state.selectedInteriorPipeId) return;
    const ip = state.interiorPipes.find(l => l.id === state.selectedInteriorPipeId);
    const val = parseFloat(e.target.value);
    if (ip && !isNaN(val) && val > 0.1) {
        const dx = ip.x2 - ip.x1;
        const dy = ip.y2 - ip.y1;
        const currentLen = Math.sqrt(dx*dx + dy*dy);
        if (currentLen > 0.05) {
            ip.x2 = ip.x1 + (dx / currentLen) * val;
            ip.y2 = ip.y1 + (dy / currentLen) * val;
        } else {
            ip.x2 = ip.x1 + val;
        }
        ip.length = val;
        draw();
        updateGlobalStats();
    }
});
document.getElementById('btn-delete-interior-pipe').addEventListener('click', deleteSelectedInteriorPipe);

// Add 90° Turn (Elbow) from active pipe end
document.getElementById('btn-add-90-turn').addEventListener('click', () => {
    if (!state.selectedInteriorPipeId) return;
    const ip = state.interiorPipes.find(p => p.id === state.selectedInteriorPipeId);
    if (!ip) return;
    
    if (typeof saveHistoryState === 'function') saveHistoryState();
    
    const dx = ip.x2 - ip.x1;
    const dy = ip.y2 - ip.y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    let nx = 1, ny = 0;
    if (len > 0.05) {
        nx = dx / len;
        ny = dy / len;
    }
    
    // Rotate 90° clockwise: (rx, ry) = (-ny, nx)
    const rx = -ny;
    const ry = nx;
    const defaultLen = 4.0;
    
    const newPipe = {
        id: generateId(),
        levelId: ip.levelId || state.currentLevelId,
        label: `Interior Pipe ${state.interiorPipes.length + 1}`,
        x1: ip.x2,
        y1: ip.y2,
        x2: ip.x2 + rx * defaultLen,
        y2: ip.y2 + ry * defaultLen,
        length: defaultLen
    };
    
    state.interiorPipes.push(newPipe);
    selectItem('interiorPipe', newPipe.id);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
});

// Add 45° Turn (Elbow) from active pipe end
document.getElementById('btn-add-45-turn').addEventListener('click', () => {
    if (!state.selectedInteriorPipeId) return;
    const ip = state.interiorPipes.find(p => p.id === state.selectedInteriorPipeId);
    if (!ip) return;
    
    if (typeof saveHistoryState === 'function') saveHistoryState();
    
    const dx = ip.x2 - ip.x1;
    const dy = ip.y2 - ip.y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    let nx = 1, ny = 0;
    if (len > 0.05) {
        nx = dx / len;
        ny = dy / len;
    }
    
    // Rotate 45° clockwise: 
    // rx = nx * cos(45) - ny * sin(45)
    // ry = nx * sin(45) + ny * cos(45)
    const cos45 = 0.7071;
    const sin45 = 0.7071;
    const rx = nx * cos45 - ny * sin45;
    const ry = nx * sin45 + ny * cos45;
    const defaultLen = 4.0;
    
    const newPipe = {
        id: generateId(),
        levelId: ip.levelId || state.currentLevelId,
        label: `Interior Pipe ${state.interiorPipes.length + 1}`,
        x1: ip.x2,
        y1: ip.y2,
        x2: ip.x2 + rx * defaultLen,
        y2: ip.y2 + ry * defaultLen,
        length: defaultLen
    };
    
    state.interiorPipes.push(newPipe);
    selectItem('interiorPipe', newPipe.id);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
});

// Room Joists Direction change
document.getElementById('room-joists-select').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.joists = e.target.value;
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});

// Room Exterior Foam Board change
document.getElementById('room-foam-board-checkbox').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.foamBoard = e.target.checked;
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});

// Room Spray Foam Bond Pockets change
document.getElementById('room-foam-bond-pockets-checkbox').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.foamBondPockets = e.target.checked;
        updateRoomEstimates(room);
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});

// Room Carbon Fiber Straps Qty change
document.getElementById('room-carbon-straps-input').addEventListener('input', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.carbonStraps = val;
        initializeCustomStraps(room);
        renderCustomStrapsList(room);
        draw();
        updateGlobalStats();
        updateToolboxReinforcementLabels(room);
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('room-carbon-scope-select').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        saveHistoryState();
        room.carbonFiberScope = e.target.value;
        if (room.carbonFiberScope === 'specific' && (!room.carbonFiberWalls || room.carbonFiberWalls.length === 0)) {
            const segments = getRoomSegments(room);
            room.carbonFiberWalls = segments.map(s => s.wall);
        }
        autoSpaceCarbonStraps(room);
        renderCarbonWallsCheckboxes(room);
        draw();
        if (window.sync3D) window.sync3D();
    }
});

function renderCarbonWallsCheckboxes(room) {
    const container = document.getElementById('room-carbon-walls-checkboxes');
    if (!container) return;
    container.innerHTML = '';
    
    const scopeContainer = document.getElementById('room-carbon-walls-container');
    if (room.carbonFiberScope === 'specific') {
        scopeContainer.classList.remove('hidden');
    } else {
        scopeContainer.classList.add('hidden');
        return;
    }
    
    const segments = getRoomSegments(room);
    segments.forEach((seg, i) => {
        let wallLabel = `Wall ${i+1}`;
        if (room.type !== 'custom') {
            const labels = { n: 'Wall 1 (North)', e: 'Wall 2 (East)', s: 'Wall 3 (South)', w: 'Wall 4 (West)' };
            wallLabel = labels[seg.wall] || `Wall ${i+1}`;
        }
        
        const isChecked = Array.isArray(room.carbonFiberWalls) && room.carbonFiberWalls.includes(seg.wall);
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '0.5rem';
        row.style.marginTop = '0.2rem';
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="checkbox" id="cb-wall-${seg.wall}" style="width:auto; margin:0;" ${isChecked ? 'checked' : ''}>
                <label for="cb-wall-${seg.wall}" style="font-size:0.75rem; font-weight:500; cursor:pointer; margin-bottom:0; color:var(--text-color);">${wallLabel}</label>
            </div>
            <button type="button" class="btn-add-wall-strap" style="background: rgba(45, 212, 191, 0.15); color: var(--accent-teal); border: 1px solid rgba(45, 212, 191, 0.25); padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">+ Add Strap</button>
        `;
        
        row.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!room.carbonFiberWalls.includes(seg.wall)) {
                    room.carbonFiberWalls.push(seg.wall);
                }
            } else {
                room.carbonFiberWalls = room.carbonFiberWalls.filter(w => w !== seg.wall);
            }
            autoSpaceCarbonStraps(room);
            renderCustomStrapsList(room);
            
            // Sync input Qty value
            const input = document.getElementById('room-carbon-straps-input');
            if (input) input.value = room.carbonStraps;
            
            draw();
            if (window.sync3D) window.sync3D();
        });

        row.querySelector('.btn-add-wall-strap').addEventListener('click', (e) => {
            e.stopPropagation();
            saveHistoryState();
            
            // Ensure the wall is checked if adding a strap
            if (!room.carbonFiberWalls.includes(seg.wall)) {
                room.carbonFiberWalls.push(seg.wall);
            }
            
            if (!room.customCarbonStraps) room.customCarbonStraps = [];
            room.customCarbonStraps.push({
                id: 'strap_' + Math.random().toString(36).substr(2, 9),
                wall: seg.wall,
                offset: 0.5
            });
            room.carbonStraps = room.customCarbonStraps.length;
            
            // Sync input Qty value
            const input = document.getElementById('room-carbon-straps-input');
            if (input) input.value = room.carbonStraps;
            
            renderCarbonWallsCheckboxes(room);
            draw();
            updateGlobalStats();
            if (window.sync3D) window.sync3D();
        });

        container.appendChild(row);
    });
    
    // Render custom manual straps list
    renderCustomStrapsList(room);
}

function renderCustomStrapsList(room) {
    const listContainer = document.getElementById('room-custom-straps-container');
    const listEl = document.getElementById('room-custom-straps-list');
    if (!listContainer || !listEl) return;
    
    if (room.carbonFiberScope === 'specific') {
        listContainer.classList.remove('hidden');
    } else {
        listContainer.classList.add('hidden');
        return;
    }
    
    listEl.innerHTML = '';
    initializeCustomStraps(room);
    
    if (!room.customCarbonStraps || room.customCarbonStraps.length === 0) {
        listEl.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-muted); margin: 0; padding: 0.5rem; text-align: center; font-style: italic;">No straps placed. Click '+ Add Strap' or drag handles.</p>`;
        return;
    }
    
    room.customCarbonStraps.forEach((strap, idx) => {
        let wallLabel = `Wall ${strap.wall}`;
        if (room.type !== 'custom') {
            const labels = { n: 'North Wall', e: 'East Wall', s: 'South Wall', w: 'West Wall' };
            wallLabel = labels[strap.wall] || `Wall ${strap.wall}`;
        } else {
            const wallIdx = parseInt(strap.wall);
            if (!isNaN(wallIdx)) wallLabel = `Wall ${wallIdx + 1}`;
        }
        
        const pct = Math.round(strap.offset * 100);
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.background = 'rgba(255,255,255,0.02)';
        row.style.border = '1px solid var(--border-color)';
        row.style.padding = '0.35rem 0.5rem';
        row.style.borderRadius = '4px';
        row.style.marginTop = '0.25rem';
        
        row.innerHTML = `
            <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-color);">${idx + 1}. ${wallLabel} (${pct}%)</span>
            <button type="button" class="btn-delete-strap" style="background: transparent; color: #ef4444; border: none; font-size: 0.75rem; cursor: pointer; padding: 0.15rem 0.35rem;">Delete</button>
        `;
        
        row.querySelector('.btn-delete-strap').addEventListener('click', () => {
            saveHistoryState();
            room.customCarbonStraps = room.customCarbonStraps.filter(s => s.id !== strap.id);
            room.carbonStraps = room.customCarbonStraps.length;
            
            // Sync input Qty value
            const input = document.getElementById('room-carbon-straps-input');
            if (input) input.value = room.carbonStraps;
            
            renderCustomStrapsList(room);
            draw();
            updateGlobalStats();
            if (window.sync3D) window.sync3D();
        });
        
        listEl.appendChild(row);
    });
}

// Bind manual Add Strap click handler
document.getElementById('btn-add-custom-strap').addEventListener('click', () => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        saveHistoryState();
        room.carbonStraps = (room.carbonStraps || 0) + 1;
        initializeCustomStraps(room);
        renderCustomStrapsList(room);
        
        // Sync input Qty value
        const input = document.getElementById('room-carbon-straps-input');
        if (input) input.value = room.carbonStraps;
        
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});

// Bind manual Auto-Space click handler
document.getElementById('btn-auto-space-straps').addEventListener('click', () => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        saveHistoryState();
        autoSpaceCarbonStraps(room);
        renderCustomStrapsList(room);
        
        // Sync input Qty value
        const input = document.getElementById('room-carbon-straps-input');
        if (input) input.value = room.carbonStraps;
        
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});

window.changeRectWallLength = function(roomId, wallKey, newValueRaw) {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return;
    const val = Math.max(1.0, parseFloat(newValueRaw) || 1.0);
    saveHistoryState();
    
    if (wallKey === 'n' || wallKey === 's') {
        room.w = val;
    } else if (wallKey === 'e' || wallKey === 'w') {
        room.l = val;
    }
    
    document.getElementById('room-w-input').value = room.w;
    document.getElementById('room-l-input').value = room.l;
    
    // Re-render the wall inputs list to show updated lengths
    const container = document.getElementById('custom-walls-list-container');
    if (container) {
        const wallInputs = container.querySelectorAll('input');
        if (wallInputs.length === 4) {
            wallInputs[0].value = room.w.toFixed(1);
            wallInputs[1].value = room.l.toFixed(1);
            wallInputs[2].value = room.w.toFixed(1);
            wallInputs[3].value = room.l.toFixed(1);
        }
    }
    
    updateRoomEstimates(room);
    draw();
    if (window.sync3D) window.sync3D();
};

// Room Floor Perimeter Carbon Fiber change
document.getElementById('room-floor-perimeter-strap-checkbox').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.floorPerimeterStrap = e.target.checked;
        draw();
        updateGlobalStats();
        updateToolboxReinforcementLabels(room);
        if (window.sync3D) window.sync3D();
    }
});

// Room NB1 Wall Coating change
document.getElementById('room-nb1-select').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.nb1Height = e.target.value;
        draw();
        updateGlobalStats();
        updateToolboxReinforcementLabels(room);
        if (window.sync3D) window.sync3D();
    }
});

// Staircase orientation change
document.getElementById('stair-orientation-select').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room && room.type === 'staircase') {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.stairOrientation = e.target.value;
        draw();
        if (window.sync3D) window.sync3D();
    }
});

// Staircase slope type change
document.getElementById('stair-direction-select').addEventListener('change', (e) => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room && room.type === 'staircase') {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.stairDirection = e.target.value;
        draw();
        if (window.sync3D) window.sync3D();
    }
});

// Stanchion listeners
document.getElementById('stanchion-name-input').addEventListener('input', (e) => {
    if (!state.selectedStanchionId) return;
    const st = state.stanchions.find(p => p.id === state.selectedStanchionId);
    if (st) {
        st.name = e.target.value;
        draw();
    }
});
document.getElementById('stanchion-type-select').addEventListener('change', (e) => {
    if (!state.selectedStanchionId) return;
    const st = state.stanchions.find(p => p.id === state.selectedStanchionId);
    if (st) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        st.type = e.target.value;
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});
document.getElementById('btn-delete-stanchion').addEventListener('click', deleteSelectedStanchion);

// Support Beam listeners
document.getElementById('beam-label-input').addEventListener('input', (e) => {
    if (!state.selectedMainBeamId) return;
    const bm = state.mainBeams.find(l => l.id === state.selectedMainBeamId);
    if (bm) {
        bm.label = e.target.value;
        draw();
    }
});
document.getElementById('beam-type-select').addEventListener('change', (e) => {
    if (!state.selectedMainBeamId) return;
    const bm = state.mainBeams.find(l => l.id === state.selectedMainBeamId);
    if (bm) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        bm.type = e.target.value;
        draw();
        if (window.sync3D) window.sync3D();
    }
});
document.getElementById('beam-len-input').addEventListener('input', (e) => {
    if (!state.selectedMainBeamId) return;
    const bm = state.mainBeams.find(l => l.id === state.selectedMainBeamId);
    const val = parseFloat(e.target.value);
    if (bm && !isNaN(val) && val > 0.1) {
        const dx = bm.x2 - bm.x1;
        const dy = bm.y2 - bm.y1;
        const currentLen = Math.sqrt(dx*dx + dy*dy);
        if (currentLen > 0.05) {
            bm.x2 = bm.x1 + (dx / currentLen) * val;
            bm.y2 = bm.y1 + (dy / currentLen) * val;
        } else {
            bm.x2 = bm.x1 + val;
        }
        bm.length = val;
        draw();
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    }
});
document.getElementById('btn-delete-beam').addEventListener('click', deleteSelectedMainBeam);
document.getElementById('btn-delete-floor-hatch').addEventListener('click', deleteSelectedFloorHatch);

document.getElementById('floor-hatch-name-input').addEventListener('input', (e) => {
    if (!state.selectedFloorHatchId) return;
    const h = state.floorHatches.find(p => p.id === state.selectedFloorHatchId);
    if (h) {
        h.name = e.target.value.trim();
        draw();
    }
});

document.getElementById('floor-hatch-width-input').addEventListener('input', (e) => {
    if (!state.selectedFloorHatchId) return;
    const h = state.floorHatches.find(p => p.id === state.selectedFloorHatchId);
    if (h) {
        h.w = Math.max(1, parseFloat(e.target.value) || 3.0);
        draw();
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('floor-hatch-length-input').addEventListener('input', (e) => {
    if (!state.selectedFloorHatchId) return;
    const h = state.floorHatches.find(p => p.id === state.selectedFloorHatchId);
    if (h) {
        h.l = Math.max(1, parseFloat(e.target.value) || 3.0);
        draw();
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('floor-hatch-target-select').addEventListener('change', (e) => {
    if (!state.selectedFloorHatchId) return;
    const h = state.floorHatches.find(p => p.id === state.selectedFloorHatchId);
    if (h) {
        h.target = e.target.value;
        draw();
        if (window.sync3D) window.sync3D();
    }
});

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
document.getElementById('btn-add-crawl-door').addEventListener('click', () => {
    addOpening('crawl_door');
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});
document.getElementById('btn-add-hatch').addEventListener('click', () => {
    addFloorHatch();
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});

function addFloorHatch() {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (!room) return;
    
    saveHistoryState();
    
    let hx = room.x;
    let hy = room.y;
    if (room.type === 'custom' && room.vertices) {
        let sumX = 0, sumY = 0;
        room.vertices.forEach(v => {
            sumX += v.x;
            sumY += v.y;
        });
        hx += sumX / room.vertices.length;
        hy += sumY / room.vertices.length;
    } else {
        hx += room.w / 2;
        hy += room.l / 2;
    }
    
    const newHatch = {
        id: generateId(),
        name: `Hatch ${state.floorHatches.length + 1}`,
        levelId: state.currentLevelId,
        x: snap(hx),
        y: snap(hy),
        w: 3.0,
        l: 3.0,
        target: 'floor' // 'floor' or 'ceiling'
    };
    
    state.floorHatches.push(newHatch);
    selectItem('floorHatch', newHatch.id);
    draw();
    if (window.sync3D) window.sync3D();
}

function deleteSelectedFloorHatch() {
    if (!state.selectedFloorHatchId) return;
    saveHistoryState();
    state.floorHatches = state.floorHatches.filter(h => h.id !== state.selectedFloorHatchId);
    selectItem(null);
    draw();
    if (window.sync3D) window.sync3D();
}

document.getElementById('btn-add-strap').addEventListener('click', () => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.carbonStraps = (room.carbonStraps || 0) + 1;
        
        const strapsInput = document.getElementById('room-carbon-straps-input');
        if (strapsInput) strapsInput.value = room.carbonStraps;
        
        draw();
        updateGlobalStats();
        updateToolboxReinforcementLabels(room);
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('btn-add-perimeter-strap').addEventListener('click', () => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        room.floorPerimeterStrap = !room.floorPerimeterStrap;
        
        const floorStrapCheckbox = document.getElementById('room-floor-perimeter-strap-checkbox');
        if (floorStrapCheckbox) floorStrapCheckbox.checked = !!room.floorPerimeterStrap;
        
        draw();
        updateGlobalStats();
        updateToolboxReinforcementLabels(room);
        if (window.sync3D) window.sync3D();
    }
});

document.getElementById('btn-add-nb1').addEventListener('click', () => {
    if (!state.selectedRoomId) return;
    const room = state.rooms.find(r => r.id === state.selectedRoomId);
    if (room) {
        if (typeof saveHistoryState === 'function') saveHistoryState();
        const next = { 'none': '2ft', '2ft': '4ft', '4ft': 'full', 'full': 'none' };
        room.nb1Height = next[room.nb1Height || 'none'];
        
        const nb1Select = document.getElementById('room-nb1-select');
        if (nb1Select) nb1Select.value = room.nb1Height;
        
        draw();
        updateGlobalStats();
        updateToolboxReinforcementLabels(room);
        if (window.sync3D) window.sync3D();
    }
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
document.getElementById('btn-add-interior-pipe').addEventListener('click', () => {
    addInteriorPipe();
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});
document.getElementById('btn-add-stanchion').addEventListener('click', () => {
    addStanchion();
    if (typeof closeAllDrawers === 'function') closeAllDrawers();
});
document.getElementById('btn-add-beam').addEventListener('click', () => {
    addSupportBeam();
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

    // Toggle AR transparency controls & solid overlays
    const appContainer = document.getElementById('app-container');
    const viewportContainer = document.querySelector('.viewport-container');
    if (viewName === 'ar') {
        if (appContainer) appContainer.classList.add('ar-mode-active');
        document.body.style.backgroundColor = 'transparent';
        if (viewportContainer) viewportContainer.style.backgroundColor = 'transparent';
    } else {
        if (appContainer) appContainer.classList.remove('ar-mode-active');
        document.body.style.backgroundColor = '';
        if (viewportContainer) viewportContainer.style.backgroundColor = '';
    }

    // Hide tools & details float buttons in AR mode to avoid overlap
    const mobileToggleTools = document.getElementById('mobile-toggle-tools');
    const mobileToggleDetails = document.getElementById('mobile-toggle-details');
    if (mobileToggleTools) mobileToggleTools.style.display = (viewName === 'ar') ? 'none' : '';
    if (mobileToggleDetails) mobileToggleDetails.style.display = (viewName === 'ar') ? 'none' : '';

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
        interiorPipes: state.interiorPipes || [],
        stanchions: state.stanchions || [],
        mainBeams: state.mainBeams || [],
        currentLevelId: state.currentLevelId,
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

// Level selector change listener
document.getElementById('level-select').addEventListener('change', (e) => {
    state.currentLevelId = e.target.value;
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
    updateHistoryButtons();
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
                state.floorHatches = data.floorHatches || [];
                state.interiorPipes = data.interiorPipes || [];
                state.stanchions = data.stanchions || [];
                state.mainBeams = data.mainBeams || [];
                state.currentLevelId = data.currentLevelId || 'basement';
                state.capturedMeasurements = data.capturedMeasurements || [];
                
                state.rooms.forEach(r => {
                    if (!r.levelId) r.levelId = 'basement';
                    if (r.carbonStraps === undefined) r.carbonStraps = 0;
                    if (r.floorPerimeterStrap === undefined) r.floorPerimeterStrap = false;
                    if (r.nb1Height === undefined) r.nb1Height = 'none';
                    if (r.foamBondPockets === undefined) r.foamBondPockets = false;
                });
                
                // Sync UI level select dropdown
                const lvlSelect = document.getElementById('level-select');
                if (lvlSelect) lvlSelect.value = state.currentLevelId;
                
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

// Auto-focus layout viewport to fit canvas perfectly for printing
function fitLayoutToCanvas() {
    if (state.rooms.length === 0 && state.sumpPumps.length === 0 && state.dischargeLines.length === 0) {
        return { scale: state.scale, offsetX: state.offsetX, offsetY: state.offsetY };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    // Compute bounds across all rooms
    state.rooms.forEach(room => {
        if (room.type === 'custom' && room.vertices) {
            room.vertices.forEach(v => {
                const wx = room.x + v.x;
                const wy = room.y + v.y;
                if (wx < minX) minX = wx;
                if (wx > maxX) maxX = wx;
                if (wy < minY) minY = wy;
                if (wy > maxY) maxY = wy;
            });
        } else {
            if (room.x < minX) minX = room.x;
            if (room.x + room.w > maxX) maxX = room.x + room.w;
            if (room.y < minY) minY = room.y;
            if (room.y + room.l > maxY) maxY = room.y + room.l;
        }
    });
    
    // Compute bounds across all sump pumps
    state.sumpPumps.forEach(pump => {
        if (pump.x < minX) minX = pump.x;
        if (pump.x > maxX) maxX = pump.x;
        if (pump.y < minY) minY = pump.y;
        if (pump.y > maxY) maxY = pump.y;
    });
    
    // Compute bounds across all discharge lines
    state.dischargeLines.forEach(line => {
        if (line.x1 < minX) minX = line.x1;
        if (line.x1 > maxX) maxX = line.x1;
        if (line.x2 < minX) minX = line.x2;
        if (line.x2 > maxX) maxX = line.x2;
        
        if (line.y1 < minY) minY = line.y1;
        if (line.y1 > maxY) maxY = line.y1;
        if (line.y2 < minY) minY = line.y2;
        if (line.y2 > maxY) maxY = line.y2;
    });
    
    const layoutW = maxX - minX;
    const layoutH = maxY - minY;
    
    // Add a uniform margin of 3 grid units (3 feet) on each side
    const padding = 3;
    const boxX = minX - padding;
    const boxY = minY - padding;
    const boxW = layoutW + padding * 2;
    const boxH = layoutH + padding * 2;
    
    const originalScale = state.scale;
    const originalOffsetX = state.offsetX;
    const originalOffsetY = state.offsetY;
    
    // Compute scale factor
    const scaleX = canvas.width / boxW;
    const scaleY = canvas.height / boxH;
    const fitScale = Math.min(scaleX, scaleY);
    
    state.scale = Math.max(5, Math.min(45, fitScale));
    
    // Compute panning offset to center the layout box
    const boxCenterX = boxX + boxW / 2;
    const boxCenterY = boxY + boxH / 2;
    
    state.offsetX = -boxCenterX * state.scale;
    state.offsetY = -boxCenterY * state.scale;
    
    return { scale: originalScale, offsetX: originalOffsetX, offsetY: originalOffsetY };
}

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
    
    // Automatically focus layout scale and center view on the canvas
    const originalView = fitLayoutToCanvas();
    
    // Draw with solid print background, then grab image URL
    draw(true);
    const layoutImage = canvas.toDataURL('image/png');
    
    // Grab 3D screenshot
    const screenshot3D = (typeof window.get3DScreenshot === 'function') ? window.get3DScreenshot() : null;
    
    // Restore original viewport settings
    state.scale = originalView.scale;
    state.offsetX = originalView.offsetX;
    state.offsetY = originalView.offsetY;
    
    // Restore selections
    state.selectedRoomId = oldSelRoom;
    state.selectedSumpPumpId = oldSelSump;
    state.selectedDischargeLineId = oldSelDischarge;
    
    // Redraw normal view
    draw(false);

    const cName = document.getElementById('customer-name').value || 'Not Specified';
    const cAddress = document.getElementById('customer-address').value || 'Not Specified';

    // XPS Foam Board Sheets estimation
    let totalXpsSheets = 0;
    state.rooms.forEach(room => {
        if (room.foamBoard) {
            const extPerim = getRoomExteriorPerimeter(room);
            let sheets = 0;
            if (room.h <= 4) {
                // Lay sheets horizontally (8' wide, 4' high)
                sheets = extPerim / 8;
            } else {
                // Stand sheets vertically (4' wide, 8' high)
                const columns = extPerim / 4;
                const sheetsPerColumn = Math.ceil(room.h / 8);
                sheets = columns * sheetsPerColumn;
            }
            let deductions = 0;
            room.openings.forEach(op => { deductions += (op.w * op.h) / 32; });
            totalXpsSheets += Math.max(0, sheets - deductions);
        }
    });

    // Plumbing BOM (pvc sticks & fittings)
    const plumbingEst = estimatePlumbingMaterials();

    // Vapor Barrier Liner calculation
    let totalLinerArea = 0;
    state.rooms.forEach(room => {
        let floorArea, perimeter;
        if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
            floorArea = getPolygonArea(room.vertices);
            perimeter = getPolygonPerimeter(room.vertices);
        } else {
            floorArea = room.w * room.l;
            perimeter = 2 * (room.w + room.l);
        }
        
        let grossWallArea;
        if (room.type === 'staircase') {
            grossWallArea = (room.l * room.h) + (room.w * room.h);
        } else {
            grossWallArea = perimeter * room.h;
        }
        let deductions = 0;
        room.openings.forEach(op => { deductions += op.w * op.h; });
        const netWallArea = Math.max(0, grossWallArea - deductions);
        
        totalLinerArea += floorArea + netWallArea;
    });

    state.stanchions.forEach(st => {
        const stLevelId = st.levelId || 'basement';
        const level = state.levels.find(l => l.id === stLevelId) || { height: 8 };
        const room = getRoomAt(st.x, st.y, stLevelId);
        const roomH = room ? room.h : (level.height || 8);
        
        let isUnderBeam = false;
        const bHeight = 0.9;
        for (let i = 0; i < state.mainBeams.length; i++) {
            const bm = state.mainBeams[i];
            if (bm.levelId !== stLevelId) continue;
            const dist = getDistanceToSegment(st.x, st.y, bm.x1, bm.y1, bm.x2, bm.y2);
            if (dist < 0.5) {
                isUnderBeam = true;
                break;
            }
        }
        const postH = isUnderBeam ? Math.max(0.5, roomH - bHeight) : roomH;
        
        let perim = 0;
        if (st.type === 'round') {
            perim = 2 * Math.PI * 0.4;
        } else if (st.type === 'square') {
            perim = 4 * 0.8;
        } else if (st.type === 'brick') {
            perim = 4 * 1.0;
        }
        totalLinerArea += perim * postH;
    });

    // Carbon Fiber and NB1 calculations for export
    let totalCarbonFiberLen = 0;
    let totalNb1Area = 0;
    
    state.rooms.forEach(room => {
        let perimeter;
        if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
            perimeter = getPolygonPerimeter(room.vertices);
        } else {
            perimeter = 2 * (room.w + room.l);
        }
        
        // Vertical straps
        if (room.carbonStraps > 0) {
            totalCarbonFiberLen += room.carbonStraps * room.h;
        }
        
        // Floor perimeter strap
        if (room.floorPerimeterStrap) {
            totalCarbonFiberLen += perimeter;
        }
        
        // NB1 Coating Area
        if (room.nb1Height === '2ft') {
            totalNb1Area += perimeter * 2;
        } else if (room.nb1Height === '4ft') {
            totalNb1Area += perimeter * 4;
        } else if (room.nb1Height === 'full') {
            let grossWallArea;
            if (room.type === 'staircase') {
                grossWallArea = (room.l * room.h) + (room.w * room.h);
            } else {
                grossWallArea = perimeter * room.h;
            }
            let deductions = 0;
            room.openings.forEach(op => { deductions += op.w * op.h; });
            totalNb1Area += Math.max(0, grossWallArea - deductions);
        }
    });
    
    const nb1BagsCount = Math.ceil(totalNb1Area / 8);

    // Spray Foam Cans calculation
    let totalSprayFoamCans = 0;
    state.rooms.forEach(room => {
        if (room.foamBondPockets && room.joists && room.joists !== 'none') {
            const segments = getRoomSegments(room);
            let wallLen = 0;
            segments.forEach(seg => {
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                if (room.joists === 'ns') {
                    wallLen += Math.abs(dx);
                } else if (room.joists === 'ew') {
                    wallLen += Math.abs(dy);
                }
            });
            const roomBF = wallLen * 1.5;
            totalSprayFoamCans += Math.ceil(roomBF / 20);
        }
    });

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
                table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 25px; page-break-inside: avoid; }
                tr { page-break-inside: avoid; }
                th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
                th { background-color: #f3f4f6; color: #1e3a8a; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
                tr.totals { font-weight: 700; background-color: #eff6ff; }
                .layout-preview { text-align: center; margin-bottom: 20px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px; background-color: #ffffff; }
                .layout-preview img { max-width: 100%; max-height: 260px; object-fit: contain; }
                .footer { margin-top: 30px; text-align: center; font-size: 0.8rem; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; }
                @media print {
                    button { display: none; }
                    body { padding: 15px; margin: 0; }
                    .page-break { page-break-before: always; break-before: page; }
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

            <div style="display: grid; grid-template-columns: ${screenshot3D ? '1fr 1fr' : '1fr'}; gap: 20px; margin-bottom: 10px;">
                <div>
                    <h2 style="margin-top: 10px;">1. 2D Floor Plan Blueprint</h2>
                    <div class="layout-preview" style="margin-bottom: 0;">
                        <img src="${layoutImage}" alt="2D Layout Blueprint">
                    </div>
                </div>
                ${screenshot3D ? `
                <div>
                    <h2 style="margin-top: 10px;">2. 3D Model Render Preview</h2>
                    <div class="layout-preview" style="margin-bottom: 0;">
                        <img src="${screenshot3D}" alt="3D Model Render Preview">
                    </div>
                </div>
                ` : ''}
            </div>

            <h2>Blueprint Symbol & Material Legend</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-top: 15px; margin-bottom: 30px; font-size: 0.85rem; line-height: 1.4; color: #334155;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="display: inline-block; width: 30px; height: 6px; background-color: #0f172a; border-radius: 2px; flex-shrink: 0;"></span>
                    <div><strong>Vertical Carbon Fiber Straps:</strong> Black tick marks along wall edges indicating vertical reinforcement strap points.</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="display: inline-block; width: 30px; height: 6px; background-color: #38bdf8; border-radius: 2px; flex-shrink: 0;"></span>
                    <div><strong>Floor Perimeter Strap:</strong> Sky blue lines indicating horizontal stabilization carbon strap.</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="display: inline-block; width: 30px; height: 6px; background-color: #f472b6; border-radius: 2px; flex-shrink: 0;"></span>
                    <div><strong>XPS Foam Board (Insulation):</strong> Pink line highlights indicating wall insulation sheets on exterior walls.</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="display: inline-block; width: 30px; height: 6px; background-color: #a855f7; border-radius: 2px; flex-shrink: 0;"></span>
                    <div><strong>NB1 Wall Coating:</strong> Purple highlighting in 3D representing waterproofing and structural cementitious wall coating.</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="display: inline-block; width: 14px; height: 14px; background-color: #10b981; border-radius: 50%; flex-shrink: 0;"></span>
                    <div><strong>Sump Pump Basin:</strong> Green circular icons indicating plotted sump pump water extraction locations.</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="display: inline-block; width: 30px; height: 3px; background-color: #94a3b8; border: 1px dashed #64748b; border-radius: 1px; flex-shrink: 0;"></span>
                    <div><strong>Utility Discharge Lines:</strong> Dashed grey lines showing drain tile pipe routing.</div>
                </div>
            </div>

            <h2 class="page-break">3. Rooms & Structural Elements</h2>
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

            <h2>4. Utility Sump Pumps</h2>
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

            <h2>5. Utility Discharge Lines (Drain Tile)</h2>
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

            <h2>6. Project Bill of Materials (BOM) & Estimates</h2>
            <table>
                <thead>
                    <tr>
                        <th>Material Item</th>
                        <th>Estimated Quantity</th>
                        <th>Coverage / Spec Info</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>2" XPS Foam Board Sheets (4' x 8')</strong></td>
                        <td>${Math.ceil(totalXpsSheets)} sheets</td>
                        <td>Exposed exterior wall surfaces (minus openings)</td>
                    </tr>
                    <tr>
                        <td><strong>10ft PVC Pipe Sticks</strong></td>
                        <td>${plumbingEst.sticks} sticks</td>
                        <td>Overhead run + Sump riser runs (excludes discharge drain tile)</td>
                    </tr>
                    <tr>
                        <td><strong>90° PVC Elbow fittings</strong></td>
                        <td>${plumbingEst.elbow90} pcs</td>
                        <td>Orthogonal turns and Sump riser transitions</td>
                    </tr>
                    <tr>
                        <td><strong>45° PVC Elbow fittings</strong></td>
                        <td>${plumbingEst.elbow45} pcs</td>
                        <td>Snapping offset angle connections</td>
                    </tr>
                    <tr>
                        <td><strong>Drain Tile (Discharge)</strong></td>
                        <td>${plumbingEst.drainTile.toFixed(1)} ft</td>
                        <td>Flexible drain tile used for horizontal discharge lines</td>
                    </tr>
                    <tr>
                        <td><strong>Carbon Fiber Straps</strong></td>
                        <td>${totalCarbonFiberLen.toFixed(1)} ft</td>
                        <td>Vertical reinforcement and/or floor perimeter reinforcement</td>
                    </tr>
                    <tr>
                        <td><strong>NB1 Wall Coating</strong></td>
                        <td>${nb1BagsCount} bags (${totalNb1Area.toFixed(0)} sq ft)</td>
                        <td>Cementitious waterproofing/reinforcement wall coating (1 bag covers 8 sq ft)</td>
                    </tr>
                    ${totalSprayFoamCans > 0 ? `
                    <tr>
                        <td><strong>Spray Foam Cans</strong></td>
                        <td>${totalSprayFoamCans} cans</td>
                        <td>Rim joist / bond pockets insulation (1 can covers 20 board feet)</td>
                    </tr>
                    ` : ''}
                    ${plumbingEst.bushing3to2 > 0 ? `
                    <tr>
                        <td><strong>3" to 2" Bushing</strong></td>
                        <td>${plumbingEst.bushing3to2} pcs</td>
                        <td>Sump pump discharge connection</td>
                    </tr>
                    ` : ''}
                    ${plumbingEst.tee3x3x2 > 0 ? `
                    <tr>
                        <td><strong>3" x 3" x 2" T-Fitting</strong></td>
                        <td>${plumbingEst.tee3x3x2} pcs</td>
                        <td>Sump pump discharge connection</td>
                    </tr>
                    ` : ''}
                    ${plumbingEst.elbow3in90 > 0 ? `
                    <tr>
                        <td><strong>3" 90° PVC Elbow</strong></td>
                        <td>${plumbingEst.elbow3in90} pcs</td>
                        <td>Sump pump discharge connection</td>
                    </tr>
                    ` : ''}
                    ${plumbingEst.screwAdapter1_5 > 0 ? `
                    <tr>
                        <td><strong>1-1/2" Screw Adapter</strong></td>
                        <td>${plumbingEst.screwAdapter1_5} pcs</td>
                        <td>Sump pump connection adapter</td>
                    </tr>
                    ` : ''}
                    ${plumbingEst.checkValve2 > 0 ? `
                    <tr>
                        <td><strong>2" PVC Check Valve</strong></td>
                        <td>${plumbingEst.checkValve2} pcs</td>
                        <td>Prevents backflow into the sump pump basin</td>
                    </tr>
                    ` : ''}
                    ${plumbingEst.yFitting2 > 0 ? `
                    <tr>
                        <td><strong>2" PVC Y-Fitting</strong></td>
                        <td>${plumbingEst.yFitting2} pcs</td>
                        <td>Sump pump discharge assembly</td>
                    </tr>
                    ` : ''}
                    <tr class="totals">
                        <td>Vapor Barrier Liner Area</td>
                        <td>${totalLinerArea.toFixed(0)} sq ft</td>
                        <td>Total floor, wall, and stanchion column surface coverage</td>
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

    // Save history BEFORE clearing sketch state, so undo restores sketch mode!
    if (typeof saveHistoryState === 'function') saveHistoryState();

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
        levelId: state.currentLevelId,
        name: 'Custom Angled Area',
        type: 'custom',
        x: minX,
        y: minY,
        w: roomW,
        l: roomL,
        h: 8, // Standard 8 ft height
        color: '#a855f7', // Custom purple
        openings: [],
        vertices: relativeVertices,
        foamBoard: false,
        foamBondPockets: false,
        carbonStraps: 0,
        carbonFiberScope: 'full',
        carbonFiberWalls: [],
        customCarbonStraps: [],
        floorPerimeterStrap: false,
        nb1Height: 'none'
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
        dischargeLines: JSON.parse(JSON.stringify(state.dischargeLines)),
        interiorPipes: JSON.parse(JSON.stringify(state.interiorPipes)),
        stanchions: JSON.parse(JSON.stringify(state.stanchions)),
        mainBeams: JSON.parse(JSON.stringify(state.mainBeams)),
        currentLevelId: state.currentLevelId,
        // Save drawing mode variables
        drawMode: state.drawMode,
        sketchVertices: JSON.parse(JSON.stringify(state.sketchVertices)),
        sketchRedoVertices: JSON.parse(JSON.stringify(state.sketchRedoVertices))
    };
}

function updateDrawingPanelVisibility() {
    const drawWallsPanel = document.getElementById('custom-wall-drawer-panel');
    const btnDrawWalls = document.getElementById('btn-draw-walls-mode');
    
    if (state.drawMode === 'custom') {
        if (drawWallsPanel) drawWallsPanel.classList.remove('hidden');
        if (btnDrawWalls) {
            btnDrawWalls.classList.add('active');
            btnDrawWalls.style.backgroundColor = 'rgba(168, 85, 247, 0.2)'; // purple
        }
    } else {
        if (drawWallsPanel) drawWallsPanel.classList.add('hidden');
        if (btnDrawWalls) {
            btnDrawWalls.classList.remove('active');
            btnDrawWalls.style.backgroundColor = 'rgba(59, 130, 246, 0.12)';
        }
    }
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
    state.floorHatches = previous.floorHatches || [];
    state.interiorPipes = previous.interiorPipes || [];
    state.stanchions = previous.stanchions || [];
    state.mainBeams = previous.mainBeams || [];
    state.currentLevelId = previous.currentLevelId || 'basement';
    
    // Sync level select UI dropdown
    const lvlSelect = document.getElementById('level-select');
    if (lvlSelect) lvlSelect.value = state.currentLevelId;
    
    // Restore drawing mode variables
    state.drawMode = previous.drawMode || null;
    state.sketchVertices = previous.sketchVertices || [];
    state.sketchRedoVertices = previous.sketchRedoVertices || [];
    
    // Toggle drawing panel UI state
    updateDrawingPanelVisibility();
    
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
    state.floorHatches = nextState.floorHatches || [];
    state.interiorPipes = nextState.interiorPipes || [];
    state.stanchions = nextState.stanchions || [];
    state.mainBeams = nextState.mainBeams || [];
    state.currentLevelId = nextState.currentLevelId || 'basement';
    
    // Sync level select UI dropdown
    const lvlSelect = document.getElementById('level-select');
    if (lvlSelect) lvlSelect.value = state.currentLevelId;
    
    // Restore drawing mode variables
    state.drawMode = nextState.drawMode || null;
    state.sketchVertices = nextState.sketchVertices || [];
    state.sketchRedoVertices = nextState.sketchRedoVertices || [];
    
    // Toggle drawing panel UI state
    updateDrawingPanelVisibility();
    
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

// --- JOB DATABASE ENGINE ---
// Open/close jobs database
document.getElementById('btn-jobs').addEventListener('click', () => {
    document.getElementById('jobs-modal').classList.remove('hidden');
    renderJobsList();
});

document.getElementById('btn-close-jobs').addEventListener('click', () => {
    document.getElementById('jobs-modal').classList.add('hidden');
});

// Diagnostics Modal Controls
document.getElementById('btn-diagnostics').addEventListener('click', () => {
    document.getElementById('diagnostics-modal').classList.remove('hidden');
    if (window.RoomFlowSpatial) {
        window.RoomFlowSpatial.performCapabilityDetection();
    }
});

document.getElementById('btn-close-diagnostics').addEventListener('click', () => {
    document.getElementById('diagnostics-modal').classList.add('hidden');
});

document.getElementById('btn-diagnostics-ok').addEventListener('click', () => {
    document.getElementById('diagnostics-modal').classList.add('hidden');
});

// Save job helper
document.getElementById('btn-save-job-submit').addEventListener('click', () => {
    const input = document.getElementById('job-name-input');
    const name = input.value.trim();
    if (!name) {
        alert("Please enter a job name!");
        return;
    }
    
    const projectData = {
        rooms: state.rooms,
        sumpPumps: state.sumpPumps,
        dischargeLines: state.dischargeLines,
        floorHatches: state.floorHatches,
        interiorPipes: state.interiorPipes,
        stanchions: state.stanchions,
        mainBeams: state.mainBeams,
        currentLevelId: state.currentLevelId,
        capturedMeasurements: state.capturedMeasurements || []
    };
    
    let jobs = {};
    try {
        const stored = localStorage.getItem('roomflow_jobs');
        if (stored) jobs = JSON.parse(stored);
    } catch(e) {
        console.error(e);
    }
    
    jobs[name] = projectData;
    localStorage.setItem('roomflow_jobs', JSON.stringify(jobs));
    
    input.value = '';
    renderJobsList();
});

// Load job from project data structure
function loadJobData(data) {
    if (!data) return;
    state.rooms = data.rooms || [];
    state.sumpPumps = data.sumpPumps || [];
    state.dischargeLines = data.dischargeLines || [];
    state.floorHatches = data.floorHatches || [];
    state.interiorPipes = data.interiorPipes || [];
    state.stanchions = data.stanchions || [];
    state.mainBeams = data.mainBeams || [];
    state.currentLevelId = data.currentLevelId || 'basement';
    state.capturedMeasurements = data.capturedMeasurements || [];
    
    state.rooms.forEach(r => {
        if (!r.levelId) r.levelId = 'basement';
        if (r.carbonStraps === undefined) r.carbonStraps = 0;
        if (r.floorPerimeterStrap === undefined) r.floorPerimeterStrap = false;
        if (r.nb1Height === undefined) r.nb1Height = 'none';
        if (r.foamBondPockets === undefined) r.foamBondPockets = false;
    });
    state.sumpPumps.forEach(sp => { if (!sp.levelId) sp.levelId = 'basement'; });
    state.dischargeLines.forEach(dl => { if (!dl.levelId) dl.levelId = 'basement'; });
    state.floorHatches.forEach(h => { if (!h.levelId) h.levelId = 'basement'; });
    state.interiorPipes.forEach(ip => { if (!ip.levelId) ip.levelId = 'basement'; });
    state.stanchions.forEach(st => { if (!st.levelId) st.levelId = 'basement'; });
    state.mainBeams.forEach(bm => { if (!bm.levelId) bm.levelId = 'basement'; });
    
    const levelSelect = document.getElementById('level-select');
    if (levelSelect) levelSelect.value = state.currentLevelId;
    
    selectItem(null);
    draw();
    updateGlobalStats();
    if (window.sync3D) window.sync3D();
    
    if (typeof saveHistoryState === 'function') saveHistoryState();
}

// Render jobs list helper
function renderJobsList() {
    const container = document.getElementById('jobs-list-container');
    if (!container) return;
    
    let jobs = {};
    try {
        const stored = localStorage.getItem('roomflow_jobs');
        if (stored) jobs = JSON.parse(stored);
    } catch(e) {
        console.error(e);
    }
    
    const keys = Object.keys(jobs);
    if (keys.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: #64748b; font-size: 0.85rem;">No jobs saved yet</div>`;
        return;
    }
    
    container.innerHTML = '';
    keys.forEach(name => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '0.6rem 0.75rem';
        row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
        row.style.fontSize = '0.85rem';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        nameSpan.style.fontWeight = '500';
        nameSpan.style.color = '#f1f5f9';
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        nameSpan.style.whiteSpace = 'nowrap';
        nameSpan.style.maxWidth = '180px';
        row.appendChild(nameSpan);
        
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '0.4rem';
        
        const btnLoad = document.createElement('button');
        btnLoad.innerHTML = `<i data-lucide="folder-open" style="width:14px; height:14px;"></i>`;
        btnLoad.title = "Load Job";
        btnLoad.style.padding = '0.3rem';
        btnLoad.style.background = '#0ea5e9';
        btnLoad.style.border = 'none';
        btnLoad.style.borderRadius = '4px';
        btnLoad.style.color = '#ffffff';
        btnLoad.style.cursor = 'pointer';
        btnLoad.addEventListener('click', () => {
            loadJobData(jobs[name]);
            document.getElementById('jobs-modal').classList.add('hidden');
        });
        actionsDiv.appendChild(btnLoad);
        
        const btnShare = document.createElement('button');
        btnShare.innerHTML = `<i data-lucide="share-2" style="width:14px; height:14px;"></i>`;
        btnShare.title = "Copy Shareable Link";
        btnShare.style.padding = '0.3rem';
        btnShare.style.background = '#10b981';
        btnShare.style.border = 'none';
        btnShare.style.borderRadius = '4px';
        btnShare.style.color = '#ffffff';
        btnShare.style.cursor = 'pointer';
        btnShare.addEventListener('click', () => {
            const jsonStr = JSON.stringify(jobs[name]);
            const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
            const shareUrl = `${window.location.origin}${window.location.pathname}?job=${encodeURIComponent(base64)}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert("Shareable job URL copied to clipboard!");
            }).catch(err => {
                console.error("Clipboard copy failed:", err);
                alert("Share link: " + shareUrl);
            });
        });
        actionsDiv.appendChild(btnShare);
        
        const btnDelete = document.createElement('button');
        btnDelete.innerHTML = `<i data-lucide="trash-2" style="width:14px; height:14px;"></i>`;
        btnDelete.title = "Delete Job";
        btnDelete.style.padding = '0.3rem';
        btnDelete.style.background = '#ef4444';
        btnDelete.style.border = 'none';
        btnDelete.style.borderRadius = '4px';
        btnDelete.style.color = '#ffffff';
        btnDelete.style.cursor = 'pointer';
        btnDelete.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete job "${name}"?`)) {
                delete jobs[name];
                localStorage.setItem('roomflow_jobs', JSON.stringify(jobs));
                renderJobsList();
            }
        });
        actionsDiv.appendChild(btnDelete);
        
        row.appendChild(actionsDiv);
        container.appendChild(row);
    });
    
    lucide.createIcons();
}

// Auto Load job from URL parameter
function checkUrlJobLoad() {
    const base64 = new URLSearchParams(window.location.search).get('job');
    if (base64) {
        try {
            const jsonStr = decodeURIComponent(escape(atob(base64)));
            const data = JSON.parse(jsonStr);
            loadJobData(data);
            console.log("Successfully loaded job from URL query parameter!");
        } catch(e) {
            console.error("Error parsing job query string:", e);
        }
    }
}

// Initialization
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
lucide.createIcons();
checkUrlJobLoad();

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

// Bind 2D zoom buttons
document.getElementById('btn-2d-zoom-in').addEventListener('click', () => {
    state.scale = Math.min(60, state.scale + 2.5);
    draw();
});
document.getElementById('btn-2d-zoom-out').addEventListener('click', () => {
    state.scale = Math.max(5, state.scale - 2.5);
    draw();
});

