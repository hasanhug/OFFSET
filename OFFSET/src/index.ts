import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createTerrain } from "./terrain";
import { createCloudSkyMaterial } from "./cloudSky";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const createScene = () => {
    const scene = new Scene(engine);

    // Deep azure background, fully opaque (#2B6CD4) — matches the sky shader
    scene.clearColor = Color4.FromHexString("#2B6CD4FF");

    // Camera: orbits a fixed point, controlled with the mouse
    // (drag = rotate, wheel = zoom)
    const camera = new ArcRotateCamera(
        "camera",
        -Math.PI / 2, // alpha: horizontal angle
        Math.PI / 3,  // beta: vertical angle
        10,           // radius: distance from the target
        new Vector3(0, 1, 0), // a point just above the centre of the plain
        scene,
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 25;
    camera.upperBetaLimit = Math.PI / 2 - 0.05; // never go below the ground
    camera.panningSensibility = 0; // keep the view centred

    // Lighting: soft ambient light + a directional light for definition
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.8;

    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.5), scene);
    sun.intensity = 1.0;

    // Sky: custom shader on a skybox surrounding the whole scene — a deep
    // azure gradient with slowly drifting, softly shaded fractal clouds.
    const cloudSky = createCloudSkyMaterial(scene);
    scene.onBeforeRenderObservable.add(() => {
        cloudSky.setFloat("time", performance.now() * 0.001); // wind drift
    });

    const skybox = CreateBox("skybox", { size: 1000 }, scene);
    skybox.material = cloudSky;

    // Terrain: rolling grassland from the reference photo — a plain with a
    // big dome hill on the horizon, smooth velvet turf, no vegetation
    // (heights and material live in terrain.ts / noise.ts).
    createTerrain(scene);

    // Atmospheric haze: distant ground fades into the sky's horizon colour.
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = 60;
    scene.fogEnd = 200;
    scene.fogColor = Color3.FromHexString("#7FB2E8");

    return scene;
};

const scene = createScene();

engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});
