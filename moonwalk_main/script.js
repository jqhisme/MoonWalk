// ES6 Module Imports
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';



// Global variables
let allData;
let scene, camera, renderer, composer;
let sceneContainer;
let pointsGroup;
let queryEmbeddings = [];  // Array to store reduced embeddings
let querySpheresGroup;     // Group to hold query result spheres
let queryCurveGroup;       // Group to hold query spline curve
let orbitControls;         // Orbit controls for camera interaction

const BASE_URL = 'http://localhost:5000';
const EMB_SCALE = 50;

// setup 3d scene
init3dScene();


// Handle window/container resize
window.addEventListener('resize', () => {
    const width = sceneContainer.clientWidth;
    const height = sceneContainer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    if (orbitControls) orbitControls.handleResize();
});

// Text history handling
const userInput = document.getElementById('user-input');
const inputButton = document.getElementById('input-button');
const textHistory = document.getElementById('text-history');
const mainVideo = document.getElementById('main-video');
let usingStartVideo = true;
const START_VIDEO_SRC = '../footage/start.mp4';
const FOOTAGE_VIDEO_SRC = '../footage/footages.mp4';

// On page load, set video to start.mp4 and loop
window.addEventListener('DOMContentLoaded', () => {
    if (mainVideo) {
        mainVideo.src = START_VIDEO_SRC;
        mainVideo.loop = true;
        mainVideo.load();
        mainVideo.play();
        usingStartVideo = true;
    }
});

// Helper function to convert HH:MM:SS to seconds
function timeToSeconds(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

// Helper function to setup video looping for an interval
function setVideoInterval(startTime, endTime) {
    if (!startTime || !endTime) return;
    
    // Set initial position to start time
    mainVideo.currentTime = startTime;
    
    // Remove any existing timeupdate listener
    mainVideo.ontimeupdate = null;
    
    // Add listener to loop the interval
    mainVideo.ontimeupdate = function() {
        if (mainVideo.currentTime >= endTime) {
            mainVideo.currentTime = startTime;
        }
    };
    
    // Start playing
    mainVideo.play();
}

inputButton.addEventListener('click', addTextEntry);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addTextEntry();
    }
});


function addTextEntry() {
    // If using start.mp4, switch to footages.mp4 and remove loop
    if (usingStartVideo && mainVideo) {
        mainVideo.src = FOOTAGE_VIDEO_SRC;
        mainVideo.loop = false;
        mainVideo.load();
        usingStartVideo = false;
    }
    const text = userInput.value.trim();
    if (text === '') return;

    // Split input by semicolons for multi-query
    const queries = text.split(';').map(q => q.trim()).filter(q => q.length > 0);
    if (queries.length === 0) return;

    // Clear input
    userInput.value = '';

    // Remove previous multi-query entries if desired (optional)
    // textHistory.innerHTML = '';

    // Create entry elements for each query
    const entryElements = queries.map(q => {
        const entry = document.createElement('div');
        entry.className = 'text-entry';
        entry.textContent = `${q} |`;
        textHistory.insertBefore(entry, textHistory.firstChild);
        return entry;
    });

    // Send all queries as a single string to /api/query_multiple
    const BASE_URL = 'http://localhost:5000';
    const payload = { query: queries.join(';') };

    // Store intervals for video looping
    let intervals = [];

    // Fetch highlight intervals for all queries
    fetch(`${BASE_URL}/api/query_multiple`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(dataArr => {
        // dataArr is an array of results, one per query
        dataArr.forEach((data, idx) => {
            let topHighlight = data.highlight || '';
            let intervalStr = data.interval || '';
            let coordinates = '';
            // Update entry text with highlight (interval will be added after embedding)
            entryElements[idx].textContent = `${queries[idx]} | ${topHighlight || 'N/A'} | ...`;

            // 50% chance to use highlight +- random(2,8) seconds as interval for looping
            let useInterval = Math.random() < 0.5;
            if(useInterval && intervalStr) {
                const [startTime, endTime] = intervalStr.split(' - ').map(timeToSeconds);
                if (!isNaN(startTime) && !isNaN(endTime)) {
                    intervals.push({ start: startTime, end: endTime });
                }
            }else{ // use highlight
                const highlightSeconds = timeToSeconds(topHighlight);
                if (!isNaN(highlightSeconds)) {
                    let startTime = highlightSeconds - Math.floor(Math.random() * 7) - 2; // random between 2 and 8 seconds before
                    let endTime = highlightSeconds + Math.floor(Math.random() * 7) + 2; // random between 2 and 8 seconds after
                    startTime = Math.max(0, startTime); // Ensure start is not negative
                    intervals.push({ start: startTime, end: endTime });
                }
            }

            // Fetch embedding for each query
            fetch(`${BASE_URL}/api/text_embed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: queries[idx] })
            })
            .then(response => response.json())
            .then(embedData => {
                if (embedData.reduced_embedding) {
                    const embedding = embedData.reduced_embedding[0] || embedData.reduced_embedding;
                    queryEmbeddings.push(embedding);
                    coordinates = `(${embedding[0].toFixed(3)}, ${embedding[1].toFixed(3)}, ${embedding[2].toFixed(3)})`;
                    // Create a sphere at the embedding position
                    const geometry = new THREE.SphereGeometry(1, 8, 8);
                    const material = new THREE.MeshBasicMaterial({ color: 0xa35f27 });
                    const sphere = new THREE.Mesh(geometry, material);
                    sphere.position.set((embedding[0]-0.5)*EMB_SCALE, (embedding[1]-0.5)*EMB_SCALE, (embedding[2]-0.5)*EMB_SCALE);
                    querySpheresGroup.add(sphere);
                    // Rebuild the curve
                    updateQueryCurve();
                }
                // Update entry text with coordinates
                entryElements[idx].textContent = `${queries[idx]} | ${topHighlight || 'N/A'} | ${coordinates || 'N/A'}`;
            })
            .catch(error => {
                console.error('Error sending text_embed:', error);
                entryElements[idx].textContent = `${queries[idx]} | ${topHighlight || 'N/A'} | Error`;
            });
        });

        // After all intervals are collected, start looping video
        if (intervals.length > 0) {
            loopVideoIntervals(intervals);
        }
    })
    .catch(error => {
        console.error('Error sending query_multiple:', error);
        entryElements.forEach((entry, idx) => {
            entry.textContent = `${queries[idx]} | Error`;
        });
    });
}

// Loop video through a sequence of intervals, repeating indefinitely
function loopVideoIntervals(intervals) {
    if (!intervals || intervals.length === 0) return;
    let currentIdx = 0;

    function playCurrentInterval() {
        const { start, end } = intervals[currentIdx];
        mainVideo.currentTime = start;
        mainVideo.ontimeupdate = null;
        mainVideo.ontimeupdate = function() {
            if (mainVideo.currentTime >= end) {
                // Move to next interval
                currentIdx = (currentIdx + 1) % intervals.length;
                playCurrentInterval();
            }
        };
        mainVideo.play();
    }
    playCurrentInterval();
}

function updateQueryCurve() {
    // Clear previous curve geometry
    while (queryCurveGroup.children.length > 0) {
        queryCurveGroup.remove(queryCurveGroup.children[0]);
    }
    
    // Need at least 2 points to create a curve
    if (queryEmbeddings.length < 2) return;
    
    // Convert embeddings to Vector3 objects, scaled appropriately
    const points = queryEmbeddings.map(emb =>
        new THREE.Vector3(
            (emb[0] - 0.5) * EMB_SCALE,
            (emb[1] - 0.5) * EMB_SCALE,
            (emb[2] - 0.5) * EMB_SCALE
        )
    );
    
    // Create Catmull-Rom curve through all points
    const curve = new THREE.CatmullRomCurve3(points, false); // false = open curve (start and end are fixed)
    
    // Get many points along the curve for smooth appearance
    const curvePoints = curve.getPoints(points.length * 20); // 20 points per segment for smoothness
    
    // Create tube segments with increasing opacity from oldest to newest
    for (let i = 0; i < curvePoints.length - 1; i++) {
        const startPoint = curvePoints[i];
        const endPoint = curvePoints[i + 1];
        
        // Calculate opacity: progresses from 0.1 (transparent) to 1.0 (opaque)
        const progress = i / (curvePoints.length - 2);
        const opacity = progress * 0.9 + 0.1; // Range from 0.1 to 1.0
        
        // Create small tube segment between consecutive curve points
        const segmentCurve = new THREE.LineCurve3(startPoint, endPoint);
        const segmentGeometry = new THREE.TubeGeometry(segmentCurve, 4, 0.4, 6);
        
        const segmentMaterial = new THREE.MeshBasicMaterial({
            color: 0xa35f27, // Match sphere color
            transparent: true,
            opacity: opacity,
            depthWrite: false // Important for proper transparency blending
        });
        
        const segmentMesh = new THREE.Mesh(segmentGeometry, segmentMaterial);
        queryCurveGroup.add(segmentMesh);
    }
}

async function init3dScene(){
    // Get the scene container
    sceneContainer = document.getElementById('scene-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x01161a);

    camera = new THREE.PerspectiveCamera(
        75,
        sceneContainer.clientWidth / sceneContainer.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 30, 40);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    sceneContainer.appendChild(renderer.domElement);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Initialize Orbit Controls with auto-rotation around the scene
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.autoRotate = true;  // Enable camera auto-rotation
    orbitControls.autoRotateSpeed = 1;  // Rotation speed
    orbitControls.target.set(0, 0, 0);
    orbitControls.update();

    // Setup post-processing with bloom effect
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomScreenEffect = new UnrealBloomPass(
        new THREE.Vector2(sceneContainer.clientWidth, sceneContainer.clientHeight),
        0.7,    // strength
        0.1,    // radius
        0.3   // threshold
    );
    // Add HalftonePass as final effect
    const params = {
            shape: 1,
            radius: 1,
            rotateR: Math.PI / 12,
            rotateB: Math.PI / 12 * 2,
            rotateG: Math.PI / 12 * 3,
            scatter: 3,
            blending: 1,
            blendingMode: 2,
            greyscale: false,
            disable: false
    };
    const halftonePass = new HalftonePass( params );
    composer.addPass( halftonePass );
    

    bloomScreenEffect.renderToScreen = false;
    composer.addPass(bloomScreenEffect);

    

    // Lighting
    const light1 = new THREE.PointLight(0xffffff, 1, 500);
    light1.position.set(100, 100, 100);
    scene.add(light1);

    // const light2 = new THREE.AmbientLight(0x808080);
    // scene.add(light2);

    // Add grid
    const gridHelper = new THREE.GridHelper(200, 10, 0xffffff, 0xffffff);
    scene.add(gridHelper);

    await loadData();

    // Create group for points
    pointsGroup = new THREE.Group();
    scene.add(pointsGroup);

    // Create group for query result spheres (add to pointsGroup so it rotates together)
    querySpheresGroup = new THREE.Group();
    pointsGroup.add(querySpheresGroup);

    // Create group for query curve/spline
    queryCurveGroup = new THREE.Group();
    querySpheresGroup.add(queryCurveGroup);

    // draw each point as a sphere
    allData.forEach(point => {
        const geometry = new THREE.SphereGeometry(1, 8, 8);

        // determine the color based on the points time_seconds(point.time_seconds)
        // the max time second is 200
        const timeRatio = Math.min(1, point.time_seconds / 200);
        // interpolate from 112, 157, 255 to 8, 207, 187
        const r = Math.round(112 + timeRatio * (8 - 112));
        const g = Math.round(157 + timeRatio * (207 - 157));
        const b = Math.round(255 + timeRatio * (187 - 255));
        const color = new THREE.Color().setRGB(r / 255, g / 255, b / 255);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set((point.x-0.5)*EMB_SCALE, (point.y-0.5)*EMB_SCALE, (point.z-0.5)*EMB_SCALE);
        pointsGroup.add(sphere);

    });

        // add custom axes
    const axisLength =EMB_SCALE;
    const tubeRadius = 0.5;
    
    // X axis (white) - centered at origin
    const xGeometry = new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0)),
        20, tubeRadius, 8, false
    );
    const xMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const xAxis = new THREE.Mesh(xGeometry, xMaterial);
    pointsGroup.add(xAxis);
    
    // Y axis (white) - centered at origin
    const yGeometry = new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0)),
        20, tubeRadius, 8, false
    );
    const yMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yAxis = new THREE.Mesh(yGeometry, yMaterial);
    pointsGroup.add(yAxis);
    
    // Z axis (white) - centered at origin
    const zGeometry = new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(0, 0, -axisLength), new THREE.Vector3(0, 0, axisLength)),
        20, tubeRadius, 8, false
    );
    const zMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const zAxis = new THREE.Mesh(zGeometry, zMaterial);
    pointsGroup.add(zAxis);

    animate3dScene();

}
function animate3dScene() {
    requestAnimationFrame(animate3dScene);

    orbitControls.update();
    composer.render();
}
// Load data from JSON
async function loadData() {
    try {
        console.log('Attempting to fetch features_3d.json...');
        const response = await fetch('features_3d.json');
        console.log('Response status:', response.status);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const jsonData = await response.json();
        
        // Handle different JSON structures
        if (jsonData.data && Array.isArray(jsonData.data)) {
            allData = jsonData.data;
        } else if (Array.isArray(jsonData)) {
            // Direct array format (your new file)
            allData = jsonData;
        } else if (jsonData.features && Array.isArray(jsonData.features)) {
            allData = jsonData.features;
        } else {
            throw new Error('Unable to find data array in JSON');
        }
        
        console.log(`Loaded ${allData.length} data points`);
    } catch (error) {
        console.error('Error loading data:', error);
        alert(`Error loading data: ${error.message}`);
    }
}