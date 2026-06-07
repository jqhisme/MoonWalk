import * as THREE from 'three';
import { addCustomAxes } from '../threejsHelper.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js';

// Video data files
const videoFiles = [
    'All About Lily Chou-Chou_features.json',
    'Bitconned_features.json',
    'Dry Leaf_features.json',
    'Severance Season2_features.json',
    'Synecdoche New York_features.json',
    'Werckmeister Harmonies_features.json'
];

// Store scenes and cameras for each 3D scene
const scenes = [];
const cameras = [];
const renderers = [];
const composers = [];
const animationFrameIds = [];
let allData = [];

// Initialize all scenes
async function init() {
    try {
        // Load all JSON data
        for (let i = 0; i < videoFiles.length; i++) {
            const response = await fetch(`./embeddings/${videoFiles[i]}`);
            const data = await response.json();
            allData.push(data);
        }

        // Create 3D scenes
        for (let i = 0; i < 6; i++) {
            const container = document.querySelector(`[data-index="${i}"]`);
            const data = allData[i];
            
            // Create scene
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x01161a);
            scenes.push(scene);

            // Create camera
            const width = container.clientWidth;
            const height = container.clientHeight;
            const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            camera.position.set(0, 20, 80);
            camera.lookAt(0, 0, 0);
            cameras.push(camera);

            // Create renderer
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);
            renderers.push(renderer);

            // Create EffectComposer with all passes
            const composer = new EffectComposer(renderer);
            composer.addPass(new RenderPass(scene, camera));

            const bloomScreenEffect = new UnrealBloomPass(
                new THREE.Vector2(width, height),
                0.7,    // strength
                0.1,    // radius
                0.3   // threshold
            );

            // Add HalftonePass as final effect
  

            bloomScreenEffect.renderToScreen = true;
            composer.addPass(bloomScreenEffect);

            composers.push(composer);

            // Create 3D visualization from embedding data
            createVisualization(scene, data.data);

            // Set up auto-rotation
            setupAutoRotate(scene);

            // Add event listeners for preview images
            container.addEventListener('mouseenter', () => {
                showPreview(i);
            });
            container.addEventListener('mouseleave', () => {
                hidePreview();
            });

            // Start animation loop
            animateScene(i);

            // Update video name and variance
            const sceneItem = container.parentElement;
            const videoNameElement = sceneItem.querySelector('.video-name');
            const varianceElement = sceneItem.querySelector('.variance');
            
            if (videoNameElement && varianceElement) {
                videoNameElement.textContent = data.metadata.video_name;
                varianceElement.textContent = `Variance: ${data.metadata.variance.toFixed(4)}`;
            } else {
                console.warn(`Could not find video-name or variance elements for scene ${i}`);
            }
        }

        // Handle window resize
        window.addEventListener('resize', handleResize);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function createVisualization(scene, data) {
    // Create points from 3D data
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(data.length * 3);

    for (let i = 0; i < data.length; i++) {
        const point = data[i];
        positions[i * 3] = point[0] * 80 - 40;  // Scale to visible range
        positions[i * 3 + 1] = point[1] * 80 - 40;
        positions[i * 3 + 2] = point[2] * 80 - 40;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Create a circular texture for spherical points
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Draw a white circle with soft edges
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
        color: 0x709DFF,  // RGB(112, 157, 255)
        size: 2,
        sizeAttenuation: true,
        map: texture,
        transparent: true
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Add some lighting
    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(50, 50, 50);
    scene.add(light);

    // Add custom axes
    addCustomAxes(scene);
}

function setupAutoRotate(scene) {
    // Auto-rotate the entire scene
    scene.userData.autoRotateSpeed = 0.001;
}

function animateScene(sceneIndex) {
    const scene = scenes[sceneIndex];
    const camera = cameras[sceneIndex];
    const composer = composers[sceneIndex];

    function animate() {
        // Auto-rotate
        if (scene.userData.autoRotateSpeed) {
            scene.rotation.y += scene.userData.autoRotateSpeed;
        }

        composer.render();
        animationFrameIds[sceneIndex] = requestAnimationFrame(animate);
    }

    animate();
}

function showPreview(index) {
    const previewImage = document.getElementById('preview-image');
    const videoName = allData[index].metadata.video_name;
    const imagePath = `./previewImages/${videoName}_preview.jpg`;
    
    previewImage.src = imagePath;
    previewImage.classList.add('active');
}

function hidePreview() {
    const previewImage = document.getElementById('preview-image');
    previewImage.classList.remove('active');
}

function handleResize() {
    for (let i = 0; i < 6; i++) {
        const container = document.querySelector(`[data-index="${i}"]`);
        const width = container.clientWidth;
        const height = container.clientHeight;

        cameras[i].aspect = width / height;
        cameras[i].updateProjectionMatrix();
        renderers[i].setSize(width, height);
        composers[i].setSize(width, height);
    }
}

// Start the application
init();
