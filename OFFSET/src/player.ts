import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import "@babylonjs/core/Helpers/environmentHelper"; // scene.createDefaultEnvironment
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { terrainHeight, TERRAIN_SIZE } from "./terrain";
import { createShadowTexture } from "./agentTextures";

/**
 * The player: the imported GLB model ("public/models/Agent Jones.glb") with
 * its original materials and proportions, wired to WASD/arrow-key movement
 * relative to the camera, smooth turning towards the direction of travel,
 * terrain-following ground detection and slope/bounds collision. The camera
 * follows the player.
 *
 * The current model has no skeleton and no animation clips (verified by
 * inspecting the GLB). Locomotion therefore uses a subtle procedural bob and
 * lean applied to the whole model — the mesh itself is untouched. If a
 * rigged version with animation groups is dropped in later, idle/walk/run
 * clips are detected and played automatically (see pickAnimations).
 */

const MODEL_URL = "models/Agent%20Jones.glb";
const MODEL_SCALE = 1.8;      // uniform: matches the world's ~1.8-unit character height, proportions preserved
const WALK_SPEED = 3.4;       // units per second
const SPRINT_SPEED = 6.0;
const TURN_RATE = 10;         // heading smoothing (higher = snappier)
const MAX_SLOPE = 0.9;        // max climbable slope (rise per unit travel)
const BOUND = TERRAIN_SIZE / 2 - 8;

const lerpAngle = (a: number, b: number, t: number): number => {
    const d = (((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
};

export const createPlayer = (scene: Scene, camera: ArcRotateCamera): void => {
    // Arrow keys belong to the player now, not to camera panning.
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

    const keys = new Set<string>();
    window.addEventListener("keydown", (event) => keys.add(event.key.toLowerCase()));
    window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

    SceneLoader.ImportMeshAsync("", MODEL_URL, "", scene).then((result) => {
        // ---- assemble the player hierarchy ---------------------------------
        const root = new TransformNode("playerRoot", scene);     // position + facing
        const modelRoot = new TransformNode("playerModel", scene); // scale + bob/lean
        modelRoot.parent = root;
        modelRoot.scaling.setAll(MODEL_SCALE);

        for (const node of result.meshes) {
            if (!node.parent) node.parent = modelRoot;
        }

        // The model's feet sit at local y = 0, so the root rides the terrain.
        const groundOffset = 0;

        // PBR materials want image-based lighting to look right; give the
        // scene the default environment (falls back to direct lights only).
        const pbrMaterials = result.meshes
            .map((mesh) => (mesh as Mesh).material)
            .filter((material): material is PBRMaterial => material instanceof PBRMaterial);
        if (pbrMaterials.length > 0) {
            try {
                scene.createDefaultEnvironment({ createSkybox: false, createGround: false });
                scene.environmentIntensity = 0.75;
            } catch (error) {
                console.warn("[player] no environment texture (offline?); using direct lights only", error);
            }
        }

        // ---- animation groups (none in the current model) -------------------
        const groups = scene.animationGroups;
        const pick = (pattern: RegExp): AnimationGroup | null =>
            groups.find((group) => pattern.test(group.name.toLowerCase())) ?? null;
        const idleClip = pick(/idle|breath|stand/i) ?? groups[0] ?? null;
        const walkClip = pick(/walk/i) ?? (groups.length > 1 ? groups[1] : null);
        const runClip = pick(/run|jog|sprint/i) ?? walkClip;
        let currentClip: AnimationGroup | null = null;
        const play = (clip: AnimationGroup | null): void => {
            if (clip && clip !== currentClip) {
                currentClip?.stop();
                clip.start(true);
                currentClip = clip;
            }
        };
        play(idleClip);

        console.log(
            `[player] model loaded: ${result.meshes.length} nodes, ` +
            `${scene.skeletons.length} skeletons, ${groups.length} animation groups ` +
            `(${groups.map((g) => g.name).join(", ") || "none"})` +
            `${groups.length === 0 ? " — using procedural bob/lean locomotion" : ""}`,
        );

        // ---- soft blob shadow -------------------------------------------------
        const shadow = CreateDisc("playerShadow", { radius: 0.5, tessellation: 32 }, scene);
        shadow.rotation.x = Math.PI / 2;
        const shadowMat = new StandardMaterial("playerShadowMat", scene);
        shadowMat.diffuseTexture = createShadowTexture(scene);
        shadowMat.diffuseTexture.hasAlpha = true;
        shadowMat.useAlphaFromDiffuseTexture = true;
        shadowMat.disableLighting = true;
        shadowMat.specularColor = Color3.Black();
        shadow.material = shadowMat;

        // ---- movement state -----------------------------------------------------
        const position = new Vector3(0, terrainHeight(0, 0), 0);
        let heading = Math.PI; // face the default camera (model forward is +Z)
        let bobTime = 0;

        const passable = (x: number, z: number, step: number): boolean => {
            if (Math.abs(x) > BOUND || Math.abs(z) > BOUND) return false;
            const rise = Math.abs(terrainHeight(x, z) - position.y);
            return step <= 0 || rise / step <= MAX_SLOPE;
        };

        scene.onBeforeRenderObservable.add(() => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);

            // Input → world-space direction relative to the camera.
            let ix = 0;
            let iz = 0;
            if (keys.has("w") || keys.has("arrowup")) iz += 1;
            if (keys.has("s") || keys.has("arrowdown")) iz -= 1;
            if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
            if (keys.has("d") || keys.has("arrowright")) ix += 1;
            const moving = ix !== 0 || iz !== 0;
            const sprinting = keys.has("shift");

            let speedFactor = 0;
            if (moving) {
                const forward = camera.getTarget().subtract(camera.position);
                forward.y = 0;
                forward.normalize();
                const right = Vector3.Cross(Vector3.Up(), forward);
                const dir = forward.scale(iz).add(right.scale(ix)).normalize();

                const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
                const step = speed * dt;
                speedFactor = sprinting ? 1 : 0.6;

                // Collision: bounds + slope, with axis sliding when blocked.
                if (passable(position.x + dir.x * step, position.z + dir.z * step, step)) {
                    position.x += dir.x * step;
                    position.z += dir.z * step;
                } else if (passable(position.x + dir.x * step, position.z, step)) {
                    position.x += dir.x * step;
                } else if (passable(position.x, position.z + dir.z * step, step)) {
                    position.z += dir.z * step;
                } else {
                    speedFactor = 0;
                }

                // Face the direction of travel.
                heading = lerpAngle(heading, Math.atan2(dir.x, dir.z), 1 - Math.exp(-TURN_RATE * dt));
                bobTime += dt * (sprinting ? 13 : 9);
            } else {
                bobTime += dt * 1.2; // idle breathing pace
            }

            // Ground detection: the terrain is displaced procedurally, so the
            // authoritative ground height is terrainHeight(x, z).
            position.y = terrainHeight(position.x, position.z);

            root.position.set(position.x, position.y + groundOffset, position.z);
            root.rotation.y = heading;

            // Subtle procedural locomotion (no skeleton in this model):
            // a small bob + forward lean while moving, a gentle sway at rest.
            const bob = Math.sin(bobTime) * 0.025 * speedFactor;
            const lean = 0.06 * speedFactor;
            const sway = moving ? 0 : Math.sin(bobTime * 0.6) * 0.015;
            modelRoot.position.y = bob;
            modelRoot.rotation.x = lean;
            modelRoot.rotation.z = sway;

            // Clip selection (only if the model ships animation groups).
            play(moving ? (sprinting ? runClip : walkClip) ?? idleClip : idleClip);
            if (currentClip) currentClip.speedRatio = sprinting ? 1.35 : 1;

            // Camera and shadow follow the player.
            camera.target.set(position.x, position.y + 1.1, position.z);
            shadow.position.set(position.x, position.y + 0.015, position.z);
        });
    }).catch((error) => {
        console.error("[player] failed to load model:", error);
    });
};
