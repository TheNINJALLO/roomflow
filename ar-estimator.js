// --- WEBAR CAMERA TAPE MEASURE ESTIMATOR ---
let videoStream = null;
let devicePitch = 45; // Degrees tilt down from horizontal
let pinnedPoints = []; // Array of { x, y } in world coordinates (feet) relative to initial point
let activeDistance = 0; // Estimated distance to aim point (feet)

const videoEl = document.getElementById('ar-video');
const distanceDisplay = document.getElementById('ar-distance');
const segmentDisplay = document.getElementById('ar-segment');
const pinBtn = document.getElementById('btn-ar-pin');
const finishBtn = document.getElementById('btn-ar-finish');
const resetBtn = document.getElementById('btn-ar-reset');
const cameraHeightInput = document.getElementById('ar-camera-height');

// Request Camera access
window.startCamera = function() {
    pinnedPoints = [];
    updateARDisplay();

    // Standard constraints
    const constraints = {
        video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            videoStream = stream;
            videoEl.srcObject = stream;
            videoEl.play();
            requestOrientationPermission();
        })
        .catch(err => {
            console.error('Camera access failed:', err);
            alert('Unable to access camera. Showing simulation overlay.');
            // Simulate video stream for desktops/dev testing
            videoEl.style.backgroundColor = '#1e293b';
        });
};

// Stop Camera
window.stopCamera = function() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    videoEl.srcObject = null;
};

// Request Device Orientation Permissions (iOS specific requirement)
function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                }
            })
            .catch(console.error);
    } else {
        // Android and desktop non-iOS browsers
        window.addEventListener('deviceorientation', handleOrientation);
    }
}

function handleOrientation(e) {
    // beta: front-back tilt (-180 to 180). 
    // Typically holding the phone upright (vertical) beta is ~80-90.
    // Tilted forward (looking at floor) beta goes down towards 30-40.
    let beta = e.beta || 90;
    
    // Clamp values
    beta = Math.max(15, Math.min(85, beta));
    
    // Pitch is the angle down from horizontal
    devicePitch = 90 - beta;
    calculateDistance();
}

// Distance Calculation via Trigonometry
function calculateDistance() {
    // Camera height in feet
    const camHeightFeet = parseFloat(cameraHeightInput.value) / 12;
    
    // Horizontal Distance = Camera Height * tan(90 - pitch) 
    // When looking straight down (pitch near 90), tan approaches infinity, so we clamp pitch
    const pitchRad = (devicePitch * Math.PI) / 180;
    activeDistance = camHeightFeet * Math.tan(pitchRad);

    updateARDisplay();
}

// Convert active distance to visual feet-inches
function formatFeetInches(feetVal) {
    const totalInches = Math.round(feetVal * 12);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}' ${inches}"`;
}

function updateARDisplay() {
    distanceDisplay.innerText = formatFeetInches(activeDistance);
    
    if (pinnedPoints.length > 0) {
        // Calculate segment from last pinned point
        const currentPos = getTargetCoordinates();
        const lastPoint = pinnedPoints[pinnedPoints.length - 1];
        const dx = currentPos.x - lastPoint.x;
        const dy = currentPos.y - lastPoint.y;
        const segmentDist = Math.sqrt(dx*dx + dy*dy);
        segmentDisplay.innerText = formatFeetInches(segmentDist);
        finishBtn.disabled = pinnedPoints.length < 3;
    } else {
        segmentDisplay.innerText = "0' 0\"";
        finishBtn.disabled = true;
    }
}

// Calculate the 2D world coordinate of the current target point
function getTargetCoordinates() {
    // Get direction vector based on device compass (alpha/yaw) or assume straight ahead for simple shapes
    // For simplicity, we assume user rotates in place. We map points using distance & trigonometry.
    // If orientation compass isn't highly reliable, we simulate angles based on point progression.
    const angleRad = (deviceYaw * Math.PI) / 180;
    return {
        x: activeDistance * Math.cos(angleRad),
        y: activeDistance * Math.sin(angleRad)
    };
}

// Tracking orientation yaw
let deviceYaw = 0;
window.addEventListener('deviceorientation', (e) => {
    // alpha: rotation around z axis (0-360 compass direction)
    if (e.alpha !== null) {
        deviceYaw = e.alpha;
    }
});

// Mock simulation of rotation for desktop testing (holding shift + moving mouse rotates view)
let mockAngle = 0;
document.addEventListener('mousemove', (e) => {
    if (!videoStream && state.activeView === 'ar') {
        // Simulate pitch/yaw on desktop via mouse coordinates
        const percentX = e.clientX / window.innerWidth;
        const percentY = e.clientY / window.innerHeight;
        
        devicePitch = 15 + (1 - percentY) * 60; // 15 to 75 deg pitch
        deviceYaw = percentX * 360; // 0 to 360 yaw
        
        calculateDistance();
    }
});

// Button Controls
pinBtn.addEventListener('click', () => {
    const coords = getTargetCoordinates();
    pinnedPoints.push(coords);
    
    // Feedback effect (temporary green indicator or logging)
    const originalBg = pinBtn.style.backgroundColor;
    pinBtn.style.backgroundColor = '#10b981';
    setTimeout(() => {
        pinBtn.style.backgroundColor = originalBg;
    }, 150);

    updateARDisplay();
});

resetBtn.addEventListener('click', () => {
    pinnedPoints = [];
    updateARDisplay();
});

finishBtn.addEventListener('click', () => {
    if (pinnedPoints.length < 3) return;

    // Calculate Bounding Box of the pinned points to create a rectangular room
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pinnedPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    });

    const w = snap(maxX - minX);
    const l = snap(maxY - minY);

    if (w >= 2 && l >= 2) {
        // Place room at the center of the active canvas viewport
        const centerX = snap(toWorldX(canvas.width / 2) - w / 2);
        const centerY = snap(toWorldY(canvas.height / 2) - l / 2);

        // Add Room to main state
        const newRoom = {
            id: 'r_' + Math.random().toString(36).substr(2, 9),
            name: 'AR Scanned Room',
            type: 'custom',
            w: w,
            l: l,
            h: 8, // Default ceiling height
            x: centerX,
            y: centerY,
            color: '#ec4899',
            openings: []
        };

        state.rooms.push(newRoom);
        selectRoom(newRoom.id);
        
        // Go back to 2D view to let user place/snaps
        switchView('2d');
        updateGlobalStats();
        if (window.sync3D) window.sync3D();
    } else {
        alert('Pinned area is too small. Place corners further apart.');
    }
});
