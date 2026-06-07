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
const detailedHistory = document.getElementById('detailed-history');

// Listen for Firebase changes
window.addEventListener('DOMContentLoaded', () => {
    // Set up Firebase listener for real-time updates
    const queriesRef = window.firebaseCollection(window.firebaseDB, 'queries');
    const q = window.firebaseQuery(queriesRef, 
        window.firebaseOrderBy('timestamp', 'desc'), 
        window.firebaseLimit(15)
    );

    window.firebaseOnSnapshot(q, (querySnapshot) => {
        console.log('Firebase snapshot received, docs count:', querySnapshot.size);
        
        // Clear existing history
        detailedHistory.innerHTML = '';
        
        // Clear existing 3D objects
        while (querySpheresGroup.children.length > 0) {
            const child = querySpheresGroup.children[0];
            querySpheresGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        queryEmbeddings = [];

        const entries = [];
        querySnapshot.forEach((doc) => {
            const data = {id: doc.id, ...doc.data()};
            console.log('Firebase doc:', data);
            entries.push(data);
        });

        // Keep original order for 3D curve generation but display latest first
        const entriesForCurve = [...entries].reverse(); // oldest first for curve
        const entriesForDisplay = entries; // newest first for display

        // Process entries for 3D visualization (oldest first)
        entriesForCurve.forEach((data, index) => {
            // Add to 3D visualization if coordinate exists
            if (data.coordinate && Array.isArray(data.coordinate) && data.coordinate.length >= 3) {
                const embedding = data.coordinate;
                queryEmbeddings.push(embedding);
                
                console.log(`Added embedding ${queryEmbeddings.length}:`, embedding);
                
                // Create a sphere at the embedding position
                const geometry = new THREE.SphereGeometry(1.5, 8, 8);
                const material = new THREE.MeshBasicMaterial({ 
                    color: 0xff6b35
                });
                const sphere = new THREE.Mesh(geometry, material);
                sphere.position.set(
                    (embedding[0]-0.5)*EMB_SCALE, 
                    (embedding[1]-0.5)*EMB_SCALE, 
                    (embedding[2]-0.5)*EMB_SCALE
                );
                querySpheresGroup.add(sphere);
            } else {
                console.log('Invalid coordinate data:', data.coordinate);
            }
        });

        // Process entries for display (newest first)
        entriesForDisplay.forEach((data, index) => {
            // Add to detailed history (right panel) with simplified format
            const detailEntry = document.createElement('div');
            detailEntry.className = 'query-detail';
            
            // Format: query | highlight time | (coordinates)
            const coords = data.coordinate || [0, 0, 0];
            const highlightTime = data.highlight || 'N/A';
            const displayText = `${data.query_text} | ${highlightTime} | (${coords[0]?.toFixed(3) || '0.000'}, ${coords[1]?.toFixed(3) || '0.000'}, ${coords[2]?.toFixed(3) || '0.000'})`;
            
            detailEntry.textContent = displayText;
            detailedHistory.appendChild(detailEntry);

        });

        // Rebuild the curve after all points are added
        updateQueryCurve();
    });
});

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
            shape: 0,
            radius: 20,
            rotateR: Math.PI / 12,
            rotateB: Math.PI / 12 * 2,
            rotateG: Math.PI / 12 * 3,
            scatter: 10,
            blending: 1,
            blendingMode: 2,
            greyscale: false,
            disable: false
    };
    const halftonePass = new HalftonePass( params );
    halftonePass.renderToScreen = false; // Ensure this is the final pass
    composer.addPass( halftonePass );
    

    bloomScreenEffect.renderToScreen = true;
    composer.addPass(bloomScreenEffect);

    

    // Lighting
    const light1 = new THREE.PointLight(0xffffff, 1, 500);
    light1.position.set(100, 100, 100);
    scene.add(light1);

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

    console.log('Scene hierarchy initialized:');
    console.log('pointsGroup:', pointsGroup);
    console.log('querySpheresGroup:', querySpheresGroup);
    console.log('queryCurveGroup:', queryCurveGroup);
    console.log('queryCurveGroup parent:', queryCurveGroup.parent);

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

// Debug: Add keyboard shortcut to toggle curve visibility
window.addEventListener('keydown', (event) => {
    if (event.key === 'c' || event.key === 'C') {
        if (queryCurveGroup) {
            queryCurveGroup.visible = !queryCurveGroup.visible;
            console.log('Curve visibility toggled:', queryCurveGroup.visible);
            console.log('Curve children count:', queryCurveGroup.children.length);
        }
    }
});

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
