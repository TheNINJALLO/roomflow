// --- THREE.JS 3D RENDERER ---
let scene, camera, renderer, controls;
let roomMeshes = [];
let showCeilings = false;
const wallThickness = 0.4; // 5 inches in feet

const container3d = document.getElementById('three-container');

function init3D() {
    // 1. Create Scene & Camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d111a');
    
    // Add Fog for professional depth
    scene.fog = new THREE.FogExp2('#0d111a', 0.015);

    camera = new THREE.PerspectiveCamera(45, container3d.clientWidth / container3d.clientHeight, 0.1, 1000);
    camera.position.set(30, 40, 50);

    // 2. WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container3d.clientWidth, container3d.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container3d.appendChild(renderer.domElement);

    // 3. Orbit Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below floor level

    // 4. Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(20, 40, 20);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.bias = -0.0001;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 0.3); // Accent blue fill
    dirLight2.position.set(-20, 20, -20);
    scene.add(dirLight2);

    // 5. Floor Grid Helper
    const gridHelper = new THREE.GridHelper(100, 100, '#1e293b', '#111827');
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Start render loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (state.activeView === '3d') {
        controls.update();
        renderer.render(scene, camera);
    }
}

// Resize Three.js container
window.resizeRenderer = function() {
    if (!renderer) return;
    camera.aspect = container3d.clientWidth / container3d.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container3d.clientWidth, container3d.clientHeight);
};

// Rebuild the 3D meshes based on state
window.sync3D = function() {
    if (!scene) {
        init3D();
    }

    // Clear old meshes
    roomMeshes.forEach(mesh => scene.remove(mesh));
    roomMeshes = [];

    // Build 3D objects for each room
    state.rooms.forEach(room => {
        const roomGroup = new THREE.Group();
        const level = state.levels.find(l => l.id === room.levelId) || { elevation: 0 };
        const elevation = level.elevation || 0;
        roomGroup.position.set(room.x, elevation, room.y); // Canvas Y maps to 3D Z

        if (room.type === 'staircase') {
            const stepCount = room.steps || 12;
            const riser = room.h / stepCount;
            const tread = room.l / stepCount;
            const stepMat = new THREE.MeshStandardMaterial({
                color: room.color,
                roughness: 0.75,
                metalness: 0.1
            });
            for (let i = 0; i < stepCount; i++) {
                const stepHeight = (i + 1) * riser;
                const stepGeo = new THREE.BoxGeometry(room.w, stepHeight, tread);
                const stepMesh = new THREE.Mesh(stepGeo, stepMat);
                stepMesh.position.set(
                    room.w / 2,
                    stepHeight / 2,
                    (i * tread) + (tread / 2)
                );
                stepMesh.castShadow = true;
                stepMesh.receiveShadow = true;
                roomGroup.add(stepMesh);
            }
        } else if (room.type === 'custom' && room.vertices && room.vertices.length >= 3) {
            // --- Custom Polygon Room (with custom-angled walls) ---
            const wallMat = new THREE.MeshStandardMaterial({
                color: '#e2e8f0',
                roughness: 0.9,
                metalness: 0.05
            });

            // 1. Draw floor plane using Shape Geometry
            const shape = new THREE.Shape();
            shape.moveTo(room.vertices[0].x, room.vertices[0].y);
            for (let i = 1; i < room.vertices.length; i++) {
                shape.lineTo(room.vertices[i].x, room.vertices[i].y);
            }
            shape.closePath();
            
            const floorGeo = new THREE.ShapeGeometry(shape);
            const floorMat = new THREE.MeshStandardMaterial({
                color: room.color,
                roughness: 0.8,
                metalness: 0.1,
                side: THREE.DoubleSide
            });
            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.receiveShadow = true;
            roomGroup.add(floorMesh);

            // 2. Ceiling Plane (if visible)
            if (showCeilings) {
                const ceilMesh = floorMesh.clone();
                ceilMesh.position.y = room.h;
                roomGroup.add(ceilMesh);
            }

            // 3. Walls Construction connecting vertices
            for (let i = 0; i < room.vertices.length; i++) {
                const v1 = room.vertices[i];
                const v2 = room.vertices[(i + 1) % room.vertices.length];
                
                // Openings on custom walls filter by index number string
                const segOpenings = room.openings.filter(op => op.wall === i.toString() || op.wall === i);
                build3DWall(v1.x, v1.y, v2.x, v2.y, room.h, segOpenings, roomGroup, wallMat);
            }
        } else {
            // 1. Floor Plane
            const floorGeo = new THREE.PlaneGeometry(room.w, room.l);
            const floorMat = new THREE.MeshStandardMaterial({
                color: room.color,
                roughness: 0.8,
                metalness: 0.1,
                side: THREE.DoubleSide
            });
            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.position.set(room.w / 2, 0, room.l / 2);
            floorMesh.receiveShadow = true;
            roomGroup.add(floorMesh);

            // 2. Ceiling Plane (if visible)
            if (showCeilings) {
                const ceilMesh = floorMesh.clone();
                ceilMesh.position.y = room.h;
                roomGroup.add(ceilMesh);
            }

            // 3. Walls construction (North, East, South, West)
            const wallMat = new THREE.MeshStandardMaterial({
                color: '#e2e8f0',
                roughness: 0.9,
                metalness: 0.05
            });

            // Filter openings by wall
            const nOpenings = room.openings.filter(op => op.wall === 'n');
            const sOpenings = room.openings.filter(op => op.wall === 's');
            const eOpenings = room.openings.filter(op => op.wall === 'e');
            const wOpenings = room.openings.filter(op => op.wall === 'w');

            // North Wall: (0, 0) -> (W, 0)
            build3DWall(0, 0, room.w, 0, room.h, nOpenings, roomGroup, wallMat);
            // South Wall: (0, L) -> (W, L)
            build3DWall(0, room.l, room.w, room.l, room.h, sOpenings, roomGroup, wallMat);
            // West Wall: (0, 0) -> (0, L)
            build3DWall(0, 0, 0, room.l, room.h, wOpenings, roomGroup, wallMat);
            // East Wall: (W, 0) -> (W, L)
            build3DWall(room.w, 0, room.w, room.l, room.h, eOpenings, roomGroup, wallMat);
        }

        // --- Render Floor Joists if set ---
        if (room.joists && room.joists !== 'none') {
            const joistMat = new THREE.MeshStandardMaterial({
                color: '#854d0e', // Wood brown
                roughness: 0.8,
                metalness: 0.1
            });
            const spacing = 1.333; // 16 inches spacing
            const jThick = 0.15;   // 2 inches wide
            const jHeight = 0.65;  // 8 inches deep
            
            if (room.type === 'custom' && room.vertices) {
                // Find bounding box
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                room.vertices.forEach(v => {
                    if (v.x < minX) minX = v.x;
                    if (v.x > maxX) maxX = v.x;
                    if (v.y < minY) minY = v.y;
                    if (v.y > maxY) maxY = v.y;
                });
                
                if (room.joists === 'ns') {
                    for (let x = Math.ceil(minX / spacing) * spacing; x < maxX; x += spacing) {
                        const len = maxY - minY;
                        const joistGeo = new THREE.BoxGeometry(jThick, jHeight, len);
                        const joistMesh = new THREE.Mesh(joistGeo, joistMat);
                        joistMesh.position.set(x, room.h - jHeight/2, minY + len/2);
                        joistMesh.castShadow = true;
                        joistMesh.receiveShadow = true;
                        roomGroup.add(joistMesh);
                    }
                } else {
                    for (let y = Math.ceil(minY / spacing) * spacing; y < maxY; y += spacing) {
                        const len = maxX - minX;
                        const joistGeo = new THREE.BoxGeometry(len, jHeight, jThick);
                        const joistMesh = new THREE.Mesh(joistGeo, joistMat);
                        joistMesh.position.set(minX + len/2, room.h - jHeight/2, y);
                        joistMesh.castShadow = true;
                        joistMesh.receiveShadow = true;
                        roomGroup.add(joistMesh);
                    }
                }
            } else {
                // Rectangular / staircase rooms
                if (room.joists === 'ns') {
                    for (let x = spacing; x < room.w; x += spacing) {
                        const joistGeo = new THREE.BoxGeometry(jThick, jHeight, room.l);
                        const joistMesh = new THREE.Mesh(joistGeo, joistMat);
                        joistMesh.position.set(x, room.h - jHeight/2, room.l / 2);
                        joistMesh.castShadow = true;
                        joistMesh.receiveShadow = true;
                        roomGroup.add(joistMesh);
                    }
                } else {
                    for (let y = spacing; y < room.l; y += spacing) {
                        const joistGeo = new THREE.BoxGeometry(room.w, jHeight, jThick);
                        const joistMesh = new THREE.Mesh(joistGeo, joistMat);
                        joistMesh.position.set(room.w / 2, room.h - jHeight/2, y);
                        joistMesh.castShadow = true;
                        joistMesh.receiveShadow = true;
                        roomGroup.add(joistMesh);
                    }
                }
            }
        }

        scene.add(roomGroup);
        roomMeshes.push(roomGroup);
    });

    // --- UTILITIES & PIPING 3D RENDERING ---
    // 1. Render Sump Pumps
    state.sumpPumps.forEach(sp => {
        const level = state.levels.find(l => l.id === sp.levelId) || { elevation: 0, height: 8 };
        const elevation = level.elevation || 0;
        const roomH = level.height || 8;
        
        const sumpGroup = new THREE.Group();
        sumpGroup.position.set(sp.x, elevation, sp.y);
        
        // Sump lid
        const lidGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.05, 16);
        const lidMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6 });
        const lidMesh = new THREE.Mesh(lidGeo, lidMat);
        lidMesh.position.y = 0.025;
        lidMesh.receiveShadow = true;
        sumpGroup.add(lidMesh);
        
        // Pump motor block representation
        const motorGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
        const motorMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.6, roughness: 0.3 });
        const motorMesh = new THREE.Mesh(motorGeo, motorMat);
        motorMesh.position.set(0.1, 0.2, 0.1);
        motorMesh.castShadow = true;
        sumpGroup.add(motorMesh);
        
        // Vertical PVC riser
        const pipeH = roomH - 0.2;
        const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, pipeH, 8);
        const pipeMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });
        const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
        pipeMesh.position.set(-0.2, pipeH / 2, -0.2);
        pipeMesh.castShadow = true;
        pipeMesh.receiveShadow = true;
        sumpGroup.add(pipeMesh);
        
        scene.add(sumpGroup);
        roomMeshes.push(sumpGroup);
    });

    // 2. Render Discharge Lines (thick green on the floor)
    state.dischargeLines.forEach(dl => {
        const level = state.levels.find(l => l.id === dl.levelId) || { elevation: 0 };
        const elevation = level.elevation || 0;
        build3DPipe(dl.x1, elevation + 0.1, dl.y1, dl.x2, elevation + 0.1, dl.y2, 0.12, '#10b981', scene);
    });

    // 3. Render Interior Plumbing (white PVC run overhead)
    state.interiorPipes.forEach(ip => {
        const level = state.levels.find(l => l.id === ip.levelId) || { elevation: 0, height: 8 };
        const elevation = level.elevation || 0;
        
        // Find room containing start point
        const containingRoom = getRoomAt(ip.x1, ip.y1, ip.levelId);
        const roomH = containingRoom ? containingRoom.h : (level.height || 8);
        
        // Route horizontal run at overhead ceiling height (room height - 0.5ft)
        const pipeY = elevation + (roomH - 0.5);
        build3DPipe(ip.x1, pipeY, ip.y1, ip.x2, pipeY, ip.y2, 0.08, '#f8fafc', scene);
    });

    // 4. Render Stanchions (support posts)
    state.stanchions.forEach(st => {
        const level = state.levels.find(l => l.id === st.levelId) || { elevation: 0, height: 8 };
        const elevation = level.elevation || 0;
        const room = getRoomAt(st.x, st.y, st.levelId);
        const postH = room ? room.h : (level.height || 8);
        
        const geometry = st.type === 'square' 
            ? new THREE.BoxGeometry(0.8, postH, 0.8) 
            : new THREE.CylinderGeometry(0.4, 0.4, postH, 16);
            
        // Steel Lally column look (dark red-oxide paint)
        const material = new THREE.MeshStandardMaterial({ 
            color: '#b91c1c', 
            metalness: 0.6, 
            roughness: 0.3 
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(st.x, elevation + postH / 2, st.y);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        scene.add(mesh);
        roomMeshes.push(mesh);
    });

    // 5. Render Support Beams (timber wood or steel girders)
    state.mainBeams.forEach(bm => {
        const level = state.levels.find(l => l.id === bm.levelId) || { elevation: 0, height: 8 };
        const elevation = level.elevation || 0;
        const room = getRoomAt(bm.x1, bm.y1, bm.levelId);
        const roomH = room ? room.h : (level.height || 8);
        
        const len = Math.sqrt((bm.x2 - bm.x1)**2 + (bm.y2 - bm.y1)**2);
        if (len < 0.01) return;
        
        const bWidth = 0.6; // 7 inches wide
        const bHeight = 0.9; // 11 inches deep
        const geometry = new THREE.BoxGeometry(bWidth, bHeight, len);
        
        const material = bm.type === 'steel'
            ? new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.2 })
            : new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.9, metalness: 0.1 });
            
        const mesh = new THREE.Mesh(geometry, material);
        
        // Position midpoint
        const mx = (bm.x1 + bm.x2) / 2;
        const my = (bm.y1 + bm.y2) / 2;
        const pipeY = elevation + roomH - bHeight / 2;
        mesh.position.set(mx, pipeY, my);
        
        // Rotate Y to align along endpoints
        const angle = Math.atan2(bm.y2 - bm.y1, bm.x2 - bm.x1);
        mesh.rotation.y = -angle;
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        scene.add(mesh);
        roomMeshes.push(mesh);
    });

    // Auto-adjust camera focus point
    if (state.rooms.length > 0) {
        // Calculate bounding box of all rooms
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        state.rooms.forEach(r => {
            minX = Math.min(minX, r.x);
            maxX = Math.max(maxX, r.x + r.w);
            minZ = Math.min(minZ, r.y);
            maxZ = Math.max(maxZ, r.y + r.l);
        });
        const center = new THREE.Vector3((minX + maxX) / 2, 2, (minZ + maxZ) / 2);
        controls.target.copy(center);
    }
};

/**
 * Builds a wall segmenting it around openings (doors/windows)
 */
function build3DWall(x1, z1, x2, z2, height, openings, group, material) {
    const wallLength = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const angle = Math.atan2(z2 - z1, x2 - x1);

    // Create a local sub-group for the wall
    const wallGroup = new THREE.Group();
    wallGroup.position.set(x1, 0, z1);
    wallGroup.rotation.y = -angle; // Rotate wall alignment

    // Sort openings by offset along the wall
    openings.sort((a, b) => a.offset - b.offset);

    let currentOffset = 0;

    openings.forEach(op => {
        const startOp = op.offset - op.w / 2;
        const endOp = op.offset + op.w / 2;

        // 1. Solid wall segment before opening
        if (startOp > currentOffset) {
            const segW = startOp - currentOffset;
            const segGeo = new THREE.BoxGeometry(segW, height, wallThickness);
            const segMesh = new THREE.Mesh(segGeo, material);
            segMesh.position.set(currentOffset + segW / 2, height / 2, 0);
            segMesh.castShadow = true;
            segMesh.receiveShadow = true;
            wallGroup.add(segMesh);
        }

        // 2. Vertical slices above/below the opening
        if (op.type === 'door') {
            // Door opening: Only wall segment above the lintel (header)
            const headerH = height - op.h;
            if (headerH > 0) {
                const headerGeo = new THREE.BoxGeometry(op.w, headerH, wallThickness);
                const headerMesh = new THREE.Mesh(headerGeo, material);
                headerMesh.position.set(op.offset, op.h + headerH / 2, 0);
                headerMesh.castShadow = true;
                headerMesh.receiveShadow = true;
                wallGroup.add(headerMesh);
            }
        } else if (op.type === 'window') {
            // Window opening: Wall segment below sill, and wall segment above lintel
            const sillH = 3.0; // standard sill height: 3ft
            const headerH = height - (sillH + op.h);

            // Sill (bottom part)
            if (sillH > 0) {
                const sillGeo = new THREE.BoxGeometry(op.w, sillH, wallThickness);
                const sillMesh = new THREE.Mesh(sillGeo, material);
                sillMesh.position.set(op.offset, sillH / 2, 0);
                sillMesh.castShadow = true;
                sillMesh.receiveShadow = true;
                wallGroup.add(sillMesh);
            }

            // Lintel (top part)
            if (headerH > 0) {
                const headerGeo = new THREE.BoxGeometry(op.w, headerH, wallThickness);
                const headerMesh = new THREE.Mesh(headerGeo, material);
                headerMesh.position.set(op.offset, sillH + op.h + headerH / 2, 0);
                headerMesh.castShadow = true;
                headerMesh.receiveShadow = true;
                wallGroup.add(headerMesh);
            }
        }

        currentOffset = endOp;
    });

    // 3. Final solid segment after the last opening
    if (wallLength > currentOffset) {
        const segW = wallLength - currentOffset;
        const segGeo = new THREE.BoxGeometry(segW, height, wallThickness);
        const segMesh = new THREE.Mesh(segGeo, material);
        segMesh.position.set(currentOffset + segW / 2, height / 2, 0);
        segMesh.castShadow = true;
        segMesh.receiveShadow = true;
        wallGroup.add(segMesh);
    }

    group.add(wallGroup);
}

// Helper: Builds cylindrical pipe in 3D between two coordinate points
function build3DPipe(x1, y1, z1, x2, y2, z2, radius, color, sceneGroup) {
    const point1 = new THREE.Vector3(x1, y1, z1);
    const point2 = new THREE.Vector3(x2, y2, z2);
    const direction = new THREE.Vector3().subVectors(point2, point1);
    const length = direction.length();
    if (length < 0.01) return;
    
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: color, 
        roughness: 0.4,
        metalness: 0.1 
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.copy(point1).add(direction.clone().multiplyScalar(0.5));
    
    const up = new THREE.Vector3(0, 1, 0);
    direction.normalize();
    mesh.quaternion.setFromUnitVectors(up, direction);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    sceneGroup.add(mesh);
    roomMeshes.push(mesh);
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

// 3D Specific UI Controls
document.getElementById('btn-3d-roof').addEventListener('click', (e) => {
    showCeilings = !showCeilings;
    e.currentTarget.classList.toggle('active', showCeilings);
    window.sync3D();
});
