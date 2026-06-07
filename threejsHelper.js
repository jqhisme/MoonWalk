import * as THREE from 'three';

export function addCustomAxes(scene) {
    const axisLength = 30;
    const tubeRadius = 0.5;
    
    // X axis (white) - centered at origin
    const xGeometry = new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0)),
        20, tubeRadius, 8, false
    );
    const xMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const xAxis = new THREE.Mesh(xGeometry, xMaterial);
    scene.add(xAxis);
    
    // Y axis (white) - centered at origin
    const yGeometry = new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0)),
        20, tubeRadius, 8, false
    );
    const yMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yAxis = new THREE.Mesh(yGeometry, yMaterial);
    scene.add(yAxis);
    
    // Z axis (white) - centered at origin
    const zGeometry = new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(0, 0, -axisLength), new THREE.Vector3(0, 0, axisLength)),
        20, tubeRadius, 8, false
    );
    const zMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const zAxis = new THREE.Mesh(zGeometry, zMaterial);
    scene.add(zAxis);
}