import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { fbm2, fbmTile, lerp, smoothstep } from "./noise";

/** World-space size of the terrain square. */
export const TERRAIN_SIZE = 300;

/**
 * Height of the terrain at world (x, z). Matches the reference photo:
 * a near-flat arid plain with gentle swells, and low rounded hills only
 * far away towards the edges of the map.
 */
export const terrainHeight = (x: number, z: number): number => {
    const r = Math.hypot(x, z);

    // The play area (cube, sphere, camera orbit) stays perfectly level at 0.
    const flat = 1 - smoothstep(18, 45, r);

    // Subtle mid-ground undulations, roughly ±0.6 units.
    const swells = (fbm2(x * 0.02, z * 0.02, 4, 11) - 0.5) * 1.2;

    // Low, rounded hills rising towards the map edge, noise-modulated so
    // the ridge is not a perfect ring.
    const hillsRamp = smoothstep(70, 145, r);
    const hills = hillsRamp * (7 + 9 * fbm2(x * 0.012, z * 0.012, 4, 77)
                                  + 2.5 * fbm2(x * 0.05, z * 0.05, 3, 123));

    return (swells + hills) * (1 - flat);
};

/** Displaced ground mesh with mottled dirt-and-straw material. */
export const createTerrain = (scene: Scene): Mesh => {
    const ground = CreateGround("terrain", {
        width: TERRAIN_SIZE,
        height: TERRAIN_SIZE,
        subdivisions: 160,
        updatable: true,
    }, scene);

    // Push every vertex up/down to its terrain height.
    const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] = terrainHeight(positions[i], positions[i + 2]);
    }
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);

    // Lighting needs normals recomputed for the displaced surface.
    const indices = ground.getIndices()!;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    ground.setVerticesData(VertexBuffer.NormalKind, normals);

    ground.material = createDirtMaterial(scene);
    return ground;
};

/**
 * Mottled dirt material from the reference palette — no image files, the
 * texture is painted once into a DynamicTexture with the same tileable
 * fractal noise used everywhere else.
 */
const createDirtMaterial = (scene: Scene): StandardMaterial => {
    const size = 512;
    const texture = new DynamicTexture("dirtTexture", { width: size, height: size }, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;

    const image = ctx.createImageData(size, size);
    const data = image.data;

    for (let py = 0; py < size; py++) {
        const v = py / size;
        for (let px = 0; px < size; px++) {
            const u = px / size;

            // Large tonal mottling of the bare dirt itself.
            const mottle = fbmTile(u, v, 3, 4, 101);
            // Where the dry-grass patches grow (straw tones).
            const patches = fbmTile(u, v, 5, 4, 202);
            // Fine grain and slow moisture variation.
            const grain = fbmTile(u, v, 32, 2, 303);
            const moisture = fbmTile(u, v, 2, 3, 404);

            // Bare dirt: warm light brown in sun, deeper brown in the mottling.
            let r = lerp(185, 165, mottle); // #B98D62 → #A5764F
            let g = lerp(141, 118, mottle);
            let b = lerp(98, 79, mottle);

            // Blend straw-coloured patches where the patch noise is high.
            const patchAmount = smoothstep(0.52, 0.72, patches) * 0.85;
            const straw = fbmTile(u, v, 9, 3, 505); // mix of two straw tones
            r = lerp(r, lerp(201, 217, straw), patchAmount); // #C9A05C → #D9B878
            g = lerp(g, lerp(160, 184, straw), patchAmount);
            b = lerp(b, lerp(92, 120, straw), patchAmount);

            // Grain + moisture brightness variation.
            const shade = (0.92 + 0.12 * moisture) * (1 + (grain - 0.5) * 0.14);

            const i = (py * size + px) * 4;
            data[i] = Math.min(255, r * shade);
            data[i + 1] = Math.min(255, g * shade);
            data[i + 2] = Math.min(255, b * shade);
            data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
    texture.update();

    // Tile the 512px patch across the terrain (~12.5 world units per tile).
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.uScale = 24;
    texture.vScale = 24;

    const material = new StandardMaterial("dirtMaterial", scene);
    material.diffuseTexture = texture;
    material.specularColor = Color3.Black(); // dry earth is completely matte
    return material;
};
