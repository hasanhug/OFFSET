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

/** Smooth rounded dome profile: 1 at the centre, 0 at `radius` distance. */
const smoothDome = (distance: number, radius: number): number => {
    const t = Math.min(distance / radius, 1);
    return (Math.cos(t * Math.PI) + 1) / 2;
};

/**
 * Height of the terrain at world (x, z). Matches the reference photo
 * (Terrain.jpg) seen from the default camera: a rolling grassland plain
 * with a large dome hill closing the horizon at +Z, a small knoll and a
 * shallow valley on the near side, and soft swells everywhere — no
 * shrubs, no trees, just clean turf.
 */
export const terrainHeight = (x: number, z: number): number => {
    const r = Math.hypot(x, z);

    // The play area (cube, sphere, camera orbit) stays perfectly level at 0.
    const flat = 1 - smoothstep(18, 45, r);

    // Soft wave-like swells across the whole plain (roughly ±0.8 units).
    const swells = (fbm2(x * 0.02, z * 0.02, 4, 11) - 0.5) * 1.6;

    // The big background dome hill: rounded profile with a noise-modulated
    // crest so the ridge is organic rather than a perfect cap.
    const dome = smoothDome(Math.hypot(x - 10, z - 118), 82) * 27
               * (0.8 + 0.4 * fbm2(x * 0.015, z * 0.015, 4, 77));

    // Small rounded knoll on the near side of the plain.
    const knoll = smoothDome(Math.hypot(x - 32, z + 44), 16) * 4;

    // Broad, shallow valley dip.
    const valley = smoothDome(Math.hypot(x - 48, z - 38), 42) * 3;

    return (swells + dome + knoll - valley) * (1 - flat);
};

/** Displaced ground mesh with the velvet grass-turf material. */
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

    ground.material = createTurfMaterial(scene);
    return ground;
};

/**
 * Velvet grass turf from the reference palette — no image files: the
 * texture is painted once into a DynamicTexture with the same tileable
 * fractal noise used everywhere else. A single material; light and shadow
 * do the modelling, exactly like the photo.
 */
const createTurfMaterial = (scene: Scene): StandardMaterial => {
    const size = 512;
    const texture = new DynamicTexture("grassTurfTexture", { width: size, height: size }, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;

    const image = ctx.createImageData(size, size);
    const data = image.data;

    for (let py = 0; py < size; py++) {
        const v = py / size;
        for (let px = 0; px < size; px++) {
            const u = px / size;

            // Large tonal mottling: vivid green with darker "depressions".
            const mottle = fbmTile(u, v, 3, 4, 101);
            // Where the turf catches a slightly yellower, sunlit tint.
            const patches = fbmTile(u, v, 5, 4, 202);
            // Fine grain and slow moisture variation.
            const grain = fbmTile(u, v, 32, 2, 303);
            const moisture = fbmTile(u, v, 2, 3, 404);

            // Base turf: #7FB83A ↔ #5B9630.
            let r = lerp(127, 91, mottle);
            let g = lerp(184, 150, mottle);
            let b = lerp(58, 48, mottle);

            // Subtle sunlit yellow-green patches: #A8C93A.
            const patchAmount = smoothstep(0.52, 0.72, patches) * 0.45;
            r = lerp(r, 168, patchAmount);
            g = lerp(g, 201, patchAmount);
            b = lerp(b, 58, patchAmount);

            // Grain + moisture brightness variation.
            const shade = (0.92 + 0.12 * moisture) * (1 + (grain - 0.5) * 0.10);

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

    const material = new StandardMaterial("turfMaterial", scene);
    material.diffuseTexture = texture;
    material.specularColor = Color3.Black(); // short grass is matte
    return material;
};
