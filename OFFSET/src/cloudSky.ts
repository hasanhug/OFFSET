import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Sky shader for the skybox: a deep-azure gradient with scattered,
 * softly-lit cumulus clouds that drift slowly across the sky.
 *
 * The clouds are drawn by the fragment shader from layered fractal noise
 * (fBm) with domain warping — irregular, wispy shapes with soft edges
 * instead of uniform blobs. Sun shading is faked by sampling the noise
 * field again a little way towards the sun: spots with more cloud between
 * them and the sun fall into shadow, while thin edges catch a silver lining.
 */

// The skybox is a box centred on the origin, so its local position,
// normalized per pixel, is the direction of sky being looked at.
Effect.ShadersStore["cloudSkyVertexShader"] = `
precision highp float;

attribute vec3 position;

uniform mat4 worldViewProjection;

varying vec3 vDirection;

void main() {
    gl_Position = worldViewProjection * vec4(position, 1.0);
    vDirection = position;
}
`;

Effect.ShadersStore["cloudSkyFragmentShader"] = `
precision highp float;

varying vec3 vDirection;

uniform float time;
uniform vec3 sunDirection;
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 cloudBrightColor;
uniform vec3 cloudShadeColor;
uniform float coverage;    // 0 = clear sky, 1 = overcast
uniform float cloudScale;  // noise frequency: lower = bigger clouds
uniform float windSpeed;   // drift speed across the sky

// ---- cheap 2D value noise ---------------------------------------------

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f); // smoothstep-style interpolation
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal noise: five octaves, each rotated and doubled in frequency.
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = rotate * p * 2.03;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec3 dir = normalize(vDirection);

    // ---- sky gradient ---------------------------------------------------
    // Deep azure overhead, lifting a little towards the horizon.
    float horizonMix = pow(1.0 - clamp(dir.y, 0.0, 1.0), 3.0);
    vec3 sky = mix(zenithColor, horizonColor, horizonMix);

    // A soft warm glow around the sun sells the time of day.
    float sunDot = max(dot(dir, sunDirection), 0.0);
    sky += vec3(1.0, 0.95, 0.82) * pow(sunDot, 90.0) * 0.5;
    sky += vec3(1.0, 0.95, 0.85) * pow(sunDot, 8.0) * 0.05;

    // ---- cloud layer ------------------------------------------------------
    // Project the view direction onto an imaginary plane above the camera,
    // so clouds bunch up towards the horizon with correct perspective.
    float plane = max(dir.y, 0.03);
    vec2 uv = dir.xz / plane * cloudScale;
    uv += time * windSpeed * vec2(1.0, 0.35); // slow wind drift

    // Domain warp: distort the noise coordinates so cloud edges come out
    // wispy and irregular instead of round and blobby.
    vec2 warp = vec2(
        noise(uv * 0.35),
        noise(uv * 0.35 + vec2(7.7, 3.3))
    ) - 0.5;
    vec2 cloudUv = uv + warp * 2.2;

    float shape = fbm(cloudUv);

    // Regional variation: some stretches of sky stay clear while clouds
    // gather elsewhere — that is what makes the sky read "scattered".
    float regions = noise(uv * 0.06 + vec2(31.7, 11.3));
    float localCoverage = clamp(coverage + (regions - 0.5) * 0.5, 0.0, 1.0);

    // Density: a soft-edged threshold turns noise into distinct clouds.
    float threshold = mix(0.78, 0.40, localCoverage);
    float density = smoothstep(threshold, threshold + 0.24, shape);

    // ---- cloud lighting -----------------------------------------------------
    // Sample the field again a little way towards the sun: where there is
    // more cloud in that direction, this spot lies in the cloud's shadow.
    vec2 toSun = sunDirection.xz / max(sunDirection.y, 0.25);
    float towardSun = fbm(cloudUv + toSun * 0.18);
    float light = clamp(0.62 + (shape - towardSun) * 2.4, 0.08, 1.0);

    // Silver linings: the thin edge of a cloud glows when it faces the sun.
    float rim = smoothstep(threshold - 0.02, threshold + 0.08, shape)
              * (1.0 - smoothstep(threshold + 0.08, threshold + 0.26, shape));
    float silver = rim * pow(sunDot, 6.0);

    vec3 cloud = mix(cloudShadeColor, cloudBrightColor, light);
    cloud += vec3(1.0, 0.97, 0.88) * silver * 0.9;

    // ---- composite ------------------------------------------------------------
    // Fade the layer out at the horizon and haze distant clouds into the sky.
    float horizonFade = smoothstep(0.0, 0.14, dir.y);
    float haze = mix(0.3, 1.0, smoothstep(0.03, 0.30, dir.y));
    float alpha = density * horizonFade;

    vec3 color = mix(sky, mix(sky, cloud, haze), alpha);

    // Dither to stop the smooth gradient banding on screen.
    color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

    gl_FragColor = vec4(color, 1.0);
}
`;

export const createCloudSkyMaterial = (scene: Scene): ShaderMaterial => {
    const material = new ShaderMaterial("cloudSkyMaterial", scene, "cloudSky", {
        attributes: ["position"],
        uniforms: [
            "worldViewProjection",
            "time",
            "sunDirection",
            "zenithColor",
            "horizonColor",
            "cloudBrightColor",
            "cloudShadeColor",
            "coverage",
            "cloudScale",
            "windSpeed",
        ],
    });

    material.backFaceCulling = false; // the skybox is viewed from inside

    // Matches the directional light in index.ts (light travels along
    // (-0.5, -1, -0.5), so the sun itself sits in the opposite direction).
    material.setVector3("sunDirection", new Vector3(0.5, 1.0, 0.5).normalize());

    material.setColor3("zenithColor", Color3.FromHexString("#2B6CD4"));   // deep azure
    material.setColor3("horizonColor", Color3.FromHexString("#7FB2E8"));  // pale hazy blue
    material.setColor3("cloudBrightColor", new Color3(1.0, 0.995, 0.99)); // sunlit white
    material.setColor3("cloudShadeColor", new Color3(0.58, 0.65, 0.76));  // blue-grey shadow

    material.setFloat("coverage", 0.42);   // scattered cumulus
    material.setFloat("cloudScale", 1.2);  // big, distinct clouds
    material.setFloat("windSpeed", 0.012); // slow, calm drift
    material.setFloat("time", 0);

    return material;
};
