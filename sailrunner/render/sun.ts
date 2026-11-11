import { Color, type Material, Vector3 } from "three";
import type { Palette } from "./palette";

/**
 * The low afternoon sun and the sky it lights. One set of uniforms is shared
 * by the sky dome, the water (reflection and horizon fog) and every hazed
 * material, so a palette change is a handful of copies.
 */

/** Compass bearing of the sun in world xz (towards it), fixed for the whole race. */
const SUN_AZIMUTH = Math.atan2(-0.46, -0.79);

function fromAngles(elevationDeg: number): Vector3 {
	const e = (elevationDeg * Math.PI) / 180;
	return new Vector3(Math.sin(SUN_AZIMUTH) * Math.cos(e), Math.sin(e), Math.cos(SUN_AZIMUTH) * Math.cos(e));
}

/** Direction the key light comes from: about 22 degrees up. */
export const SUN_LIGHT = fromAngles(22);
/**
 * Where the sun disc is drawn and what the water reflects. It sits lower than
 * the light so the disc and its glitter path fit under the chase camera's
 * view; the eye reads both as the same late sun.
 */
export const SUN_VIEW = fromAngles(12);
/** At blue hour the sun has just set: its glow stays on the horizon. */
export const SUN_SET = fromAngles(-4);

/** Horizontal unit vector towards the sun: shadows fall the other way. */
export const SUN_FLAT = new Vector3(SUN_LIGHT.x, 0, SUN_LIGHT.z).normalize();

export const skyUniforms = {
	uSkyTop: { value: new Color() },
	uSkyHaze: { value: new Color() },
	uSkyGlow: { value: new Color() },
	uSun: { value: new Color() },
	uSunGlow: { value: new Color() },
	uSunDir: { value: SUN_VIEW.clone() },
	/** 1 while the sun disc is up; 0 once it has set. */
	uSunDisc: { value: 1 },
	/** How high (sine of elevation) the warm horizon band reaches: lower once the sun has set. */
	uWarmHeight: { value: 0.3 },
};

export function setSkyPalette(palette: Palette): void {
	skyUniforms.uSkyTop.value.copy(palette.skyTop);
	skyUniforms.uSkyHaze.value.copy(palette.sky);
	skyUniforms.uSkyGlow.value.copy(palette.skyGlow);
	skyUniforms.uSun.value.copy(palette.sun);
	skyUniforms.uSunGlow.value.copy(palette.sunGlow);
	skyUniforms.uSunDir.value.copy(palette.night > 0.5 ? SUN_SET : SUN_VIEW);
	skyUniforms.uSunDisc.value = palette.night > 0.5 ? 0 : 1;
	skyUniforms.uWarmHeight.value = palette.night > 0.5 ? 0.14 : 0.3;
}

/** Distance (m) over which far things fade into the horizon colour. */
export const HAZE_DISTANCE = 1300;

/**
 * GLSL: `horizonColor(dir)` is the sky right at the horizon in that compass
 * direction (warm under the sun, cool away from it); `skyColor(dir)` the full
 * gradient with the sun's glow, used for the dome and reflections.
 */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHaze;
uniform vec3 uSkyGlow;
uniform vec3 uSun;
uniform vec3 uSunGlow;
uniform vec3 uSunDir;
uniform float uSunDisc;
uniform float uWarmHeight;
vec3 horizonColor(vec3 dir) {
	vec2 flatDir = normalize(dir.xz + vec2(1e-5, 0.0));
	float toward = dot(flatDir, normalize(uSunDir.xz)) * 0.5 + 0.5;
	return mix(uSkyHaze, uSkyGlow, toward * toward * toward);
}
vec3 skyColor(vec3 dir) {
	float up = max(dir.y, 0.0);
	// Cool gradient everywhere; the warm band hugs the horizon under the sun.
	vec3 color = mix(uSkyHaze, uSkyTop, pow(smoothstep(0.0, 0.7, up), 0.6));
	vec2 flatDir = normalize(dir.xz + vec2(1e-5, 0.0));
	float toward = dot(flatDir, normalize(uSunDir.xz)) * 0.5 + 0.5;
	float warm = toward * toward * toward * (1.0 - smoothstep(0.0, uWarmHeight, up));
	color = mix(color, uSkyGlow, warm);
	// The halo is a pale gold, not orange: orange over blue reads as lavender.
	float sun = max(dot(dir, uSunDir), 0.0);
	float sun4 = sun * sun * sun * sun;
	float sun16 = sun4 * sun4 * sun4 * sun4;
	color += mix(uSunGlow, uSun, 0.6) * (sun16 * sun16 * 0.55 + pow(sun, 260.0) * 0.6);
	return color;
}`;

/**
 * Aerial perspective for lit materials far from the camera: they fade into
 * the horizon colour behind them, so nearer islands stand out from farther
 * ones. Give the material \`fog: false\`: this replaces three's own fog.
 */
export function hazeMaterial<M extends Material>(material: M, strength = 1): M {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, skyUniforms);
		shader.vertexShader = `varying vec3 vHazeWorld;\n${shader.vertexShader}`.replace(
			"#include <worldpos_vertex>",
			/* glsl */ `#include <worldpos_vertex>
			vec4 hazeLocal = vec4(transformed, 1.0);
			#ifdef USE_INSTANCING
				hazeLocal = instanceMatrix * hazeLocal;
			#endif
			vHazeWorld = (modelMatrix * hazeLocal).xyz;`,
		);
		shader.fragmentShader = `varying vec3 vHazeWorld;\n${SKY_GLSL}\n${shader.fragmentShader}`.replace(
			"#include <colorspace_fragment>",
			/* glsl */ `{
				vec3 hazeRay = vHazeWorld - cameraPosition;
				float hazeDist = length(hazeRay);
				float haze = (1.0 - exp(-hazeDist / ${HAZE_DISTANCE.toFixed(1)})) * ${strength.toFixed(3)};
				// Thinner air higher up: summits and cloud tops keep more of their colour.
				haze *= 1.0 - 0.45 * smoothstep(0.0, 260.0, vHazeWorld.y);
				gl_FragColor.rgb = mix(gl_FragColor.rgb, horizonColor(hazeRay / hazeDist), clamp(haze, 0.0, 1.0));
			}
			#include <colorspace_fragment>`,
		);
	};
	material.customProgramCacheKey = () => `haze-${strength}`;
	return material;
}

/** Warm edge light from the low sun; its strength rises when the camera looks into the sun. */
export const rimUniforms = {
	uRim: { value: new Color() },
	uRimStrength: { value: 0.3 },
};

/** Add a fresnel rim of sunlight to a Lambert material: crisp warm edges on the hull and sails. */
export function rimMaterial<M extends Material>(material: M, key: string): M {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, rimUniforms);
		shader.fragmentShader = `uniform vec3 uRim;\nuniform float uRimStrength;\n${shader.fragmentShader}`.replace(
			"#include <opaque_fragment>",
			/* glsl */ `{
				float rimEdge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
				outgoingLight += uRim * (rimEdge * rimEdge * rimEdge) * uRimStrength;
			}
			#include <opaque_fragment>`,
		);
	};
	material.customProgramCacheKey = () => `rim-${key}`;
	return material;
}
