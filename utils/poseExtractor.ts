import * as THREE from 'three';
import { Matrix, SingularValueDecomposition } from 'ml-matrix';

function getDet(mat: Matrix) {
    return mat.get(0,0) * (mat.get(1,1)*mat.get(2,2) - mat.get(1,2)*mat.get(2,1)) -
           mat.get(0,1) * (mat.get(1,0)*mat.get(2,2) - mat.get(1,2)*mat.get(2,0)) +
           mat.get(0,2) * (mat.get(1,0)*mat.get(2,1) - mat.get(1,1)*mat.get(2,0));
}

function solveProcrustesRobust(ptsRest: THREE.Vector3[], ptsPosed: THREE.Vector3[], weights?: number[]): { position: THREE.Vector3, quaternion: THREE.Quaternion, centroidPosed: THREE.Vector3, centroidRest: THREE.Vector3 } {
    let sumW = 0;
    const centroidRest = new THREE.Vector3();
    const centroidPosed = new THREE.Vector3();
    
    for (let i = 0; i < ptsRest.length; i++) {
        const w = weights && weights[i] > 0 ? weights[i] : 1;
        sumW += w;
        centroidRest.addScaledVector(ptsRest[i], w);
        centroidPosed.addScaledVector(ptsPosed[i], w);
    }
    
    if (sumW > 0) {
        centroidRest.divideScalar(sumW);
        centroidPosed.divideScalar(sumW);
    }
    
    const H = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    
    for (let i = 0; i < ptsRest.length; i++) {
        const w = weights && weights[i] > 0 ? weights[i] : 1;
        const pR = ptsRest[i].clone().sub(centroidRest);
        const pP = ptsPosed[i].clone().sub(centroidPosed);
        
        H[0][0] += w * pR.x * pP.x; H[0][1] += w * pR.x * pP.y; H[0][2] += w * pR.x * pP.z;
        H[1][0] += w * pR.y * pP.x; H[1][1] += w * pR.y * pP.y; H[1][2] += w * pR.y * pP.z;
        H[2][0] += w * pR.z * pP.x; H[2][1] += w * pR.z * pP.y; H[2][2] += w * pR.z * pP.z;
    }
    
    const H_mat = new Matrix(H);
    const svd = new SingularValueDecomposition(H_mat);
    const U = svd.leftSingularVectors;
    const V = svd.rightSingularVectors;
    
    let R = V.mmul(U.transpose());
    if (getDet(R) < 0) {
        V.set(0, 2, V.get(0, 2) * -1);
        V.set(1, 2, V.get(1, 2) * -1);
        V.set(2, 2, V.get(2, 2) * -1);
        R = V.mmul(U.transpose());
    }
    
    const mat4 = new THREE.Matrix4().set(
        R.get(0,0), R.get(0,1), R.get(0,2), 0,
        R.get(1,0), R.get(1,1), R.get(1,2), 0,
        R.get(2,0), R.get(2,1), R.get(2,2), 0,
        0, 0, 0, 1
    );
    
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(mat4);
    quaternion.normalize();
    
    const rotatedCentroidRest = centroidRest.clone().applyMatrix4(mat4);
    const position = centroidPosed.clone().sub(rotatedCentroidRest);
    
    return { position, quaternion, centroidPosed, centroidRest };
}

export function extractRigPose(skinnedMesh: THREE.SkinnedMesh, posedPositions: Float32Array | ArrayLike<number>) {
    const skeleton = skinnedMesh.skeleton;
    const geometry = skinnedMesh.geometry;
    
    const skinIndices = geometry.attributes.skinIndex;
    const skinWeights = geometry.attributes.skinWeight;
    const restPositions = geometry.attributes.position;
    
    // Force bone hierarchies to update their world matrices in Rest Pose
    skeleton.pose();
    skinnedMesh.updateMatrixWorld(true);
    
    // We want to collect points for each bone in WORLD space!
    const bonePointsRest: THREE.Vector3[][] = Array.from({length: skeleton.bones.length}, () => []);
    const bonePointsPosed: THREE.Vector3[][] = Array.from({length: skeleton.bones.length}, () => []);
    const boneWeights: number[][] = Array.from({length: skeleton.bones.length}, () => []);
    
    for (let i = 0; i < restPositions.count; i++) {
        // Find the bone with the highest weight for this vertex
        let maxWeight = 0;
        let bestBone = -1;
        for (let j = 0; j < 4; j++) {
            const w = skinWeights.getComponent(i, j);
            if (w > maxWeight) {
                maxWeight = w;
                bestBone = skinIndices.getComponent(i, j);
            }
        }
        
        if (i * 3 + 2 >= posedPositions.length) break;

        // Threshold weight to ensure we only use vertices strongly bound to the bone
        if (bestBone !== -1 && maxWeight > 0.3) {
            const rV = new THREE.Vector3(restPositions.getX(i), restPositions.getY(i), restPositions.getZ(i));
            // Convert REST position from local to world space to match SVD logic perfectly
            rV.applyMatrix4(skinnedMesh.matrixWorld);
            
            // Assume the passed posedPositions are also essentially in world space 
            // (or the desired target space)
            const pV = new THREE.Vector3(posedPositions[i*3], posedPositions[i*3+1], posedPositions[i*3+2]);
            
            bonePointsRest[bestBone].push(rV);
            bonePointsPosed[bestBone].push(pV);
            boneWeights[bestBone].push(maxWeight);
        }
    }
    
    // Store original rest world matrices and quaternions for all bones
    const restWorldQuats: Record<string, THREE.Quaternion> = {};
    
    function storeRestPosed(bone: THREE.Bone) {
        restWorldQuats[bone.uuid] = new THREE.Quaternion().setFromRotationMatrix(bone.matrixWorld);
        for (const child of bone.children) {
            if ((child as any).isBone) storeRestPosed(child as THREE.Bone);
        }
    }
    
    const rootBones = skeleton.bones.filter(b => !b.parent || !(b.parent as any).isBone);
    for (const root of rootBones) {
        storeRestPosed(root);
    }
    
    function processBone(bone: THREE.Bone) {
        const bIdx = skeleton.bones.indexOf(bone);
        if (bIdx !== -1) {
            const ptsR = bonePointsRest[bIdx];
            const ptsP = bonePointsPosed[bIdx];
            const wts = boneWeights[bIdx];
            
            // Only attempt Procrustes if we have a reasonable number of points
            if (ptsR.length > 5) {
                // deltaQuat maps world rest points to world posed points
                const { quaternion: deltaQuat } = solveProcrustesRobust(ptsR, ptsP, wts);
                
                // The new world rotation of this bone is Delta * RestWorldRot
                const restWorldQuat = restWorldQuats[bone.uuid];
                const newWorldQuat = deltaQuat.clone().multiply(restWorldQuat);
                
                if (bone.parent && (bone.parent as any).isBone) {
                    // Convert new world rotation to local space
                    // localQuat = parentWorldQuat^-1 * newWorldQuat
                    const parentWorldQuat = new THREE.Quaternion().setFromRotationMatrix(bone.parent.matrixWorld);
                    const localQuat = newWorldQuat.clone().premultiply(parentWorldQuat.invert());
                    bone.quaternion.copy(localQuat);
                } else {
                    // It's a root bone -> Apply global rotation. 
                    // No translation is applied to keep the mesh centered at origin!
                    bone.quaternion.copy(newWorldQuat);
                }
            }
        }
        
        bone.updateMatrixWorld();
        
        for (const child of bone.children) {
            if ((child as any).isBone) {
                processBone(child as THREE.Bone);
            }
        }
    }
    
    for (const root of rootBones) {
        processBone(root);
    }
}
