#version 430 core

struct PointLight {    
    vec3 position;
    vec3 color;
};

struct DirectionalLight {    
    vec3 dir;
    vec3 color;
};

#define FLT_MAX 3.402823466e+38
#define MAX_LIGHTS 3

uniform layout(location = 0) vec2 imageResolution;

uniform layout(location = 1) float time;

uniform layout(location = 2) vec3 cameraPosition;

uniform layout(location = 3) mat4 rotMatrix;

uniform layout(location = 4) int numLights;

uniform PointLight pointLights[MAX_LIGHTS];

const float ambientStrength = 0.35;
const float specularStrength = 0.5;

const float constant = 1.0;
const float linear = 0.020;
const float quadratic = 0.0015;

const float FOV = 2.0;

out vec4 color;
/*======================================================================================*/
// Noise functions

float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }
float dither(vec2 uv) { return (rand(uv)*2.0-1.0) / 256.0; }

/*======================================================================================*/
// SDF operations

float opIntersect(float distA, float distB) {
    return max(distA, distB);
}

vec2 opUnion(vec2 distA, vec2 distB) {
    return (distA.x < distB.x) ? distA : distB;
}

float opDifference(float distA, float distB) {
    return max(distA, -distB);
}

float opOnion(in float sdf, in float thickness)
{
    return abs(sdf) - thickness;
}

float opRound(in float SDFdist, in float rad )
{
    return SDFdist - rad;
}

//Soft max function (continuous)
float sMax(float a, float b, float k)
{
    float h = max(k - abs(a - b), 0.0);
    return max(a, b) + h*h * 0.25 / k;
}
/*======================================================================================*/
// Signed distance functions (SDF)

float sphereSDF(vec3 p, float radius)
{
    return length(p) - radius;
}

float boxSDF(vec3 p, vec3 size ) {
     vec3 d = abs(p) - size;
     return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

float cylinderSDF(vec3 p, float len, float radius )
{
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(len, radius);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
/*======================================================================================*/

vec2 mapWorld(in vec3 point)
{
    vec2 ground = vec2(boxSDF(point,  vec3(2.0)), 0.0);			// 0 = Object ID

	return ground;
}

/* Function that computes the normal by calculating the gradient of the distance field at given point */
vec3 calculateNormal(in vec3 point)
{
    const vec3 perturbation = vec3(0.001, 0.0, 0.0);

    float gradX = mapWorld(point + perturbation.xyy).x - mapWorld(point - perturbation.xyy).x;
    float gradY = mapWorld(point + perturbation.yxy).x - mapWorld(point - perturbation.yxy).x;
    float gradZ = mapWorld(point + perturbation.yyx).x - mapWorld(point - perturbation.yyx).x;

    vec3 normal = vec3(gradX, gradY, gradZ);

    return normalize(normal);
}

/*======================================================================================*/

vec3 phongShading(in vec3 currentPos, float candidateObj, in vec3 ray)
{
	vec3 ambient;
	vec3 diffuse;
	vec3 specular;

	vec3 normal = calculateNormal(currentPos);

	for (int i = 0; i < numLights; i++)
	{
		vec3 lightDir = normalize(pointLights[i].position - currentPos);
		vec3 reflectDir = normalize(reflect(-lightDir, normal));

		float lightDistance = length(pointLights[i].position - currentPos);
		float lightAttenuation = 1.0 / (constant + linear * lightDistance + quadratic * (lightDistance * lightDistance));

		float diff = clamp(max(dot(lightDir, normal), 0.0) * lightAttenuation, 0.0, 1.0);
		float spec = clamp(pow(max(dot(normalize(ray), reflectDir), 0.0), 32) * lightAttenuation, 0.0, 1.0); 

		ambient += ambientStrength * pointLights[i].color * lightAttenuation;
		diffuse += diff * pointLights[i].color;
		specular += specularStrength * spec * pointLights[i].color;
	}

	vec3 combined = (ambient + diffuse) * vec3(1.0, 1.0, 1.0) + specular;

	return combined;
}

vec3 getSkyColor(in vec3 cameraPos, in vec3 rayDir)
{
	// Create gradient for sky color. Brighter blue at horizon.
	vec3 col = vec3(0.4, 0.5, 0.9)- rayDir.y * vec3(0.3, 0.3, 0.5);

	return col;
}

vec3 rayMarch(in vec3 origin, in vec3 dir)
{
	const int N_STEPS = 150;
	const float MIN_HIT_DIST = 0.0001;
	const float MAX_RAY_DIST = 10000.0;

	float lh = 0.0f;
    float ly = 0.0f;

	int step = 0;

	vec3 currentPos = origin;
	vec2 toClosestDist = mapWorld(currentPos);
	float distTraveled = 0.0;

	vec3 candidatePos = origin;
	float candidateError = FLT_MAX;
	float candidateObj = 0.0;

	while (toClosestDist.x > MIN_HIT_DIST && step < N_STEPS)
	{
		
		// Current position along ray from the origin
        currentPos = origin + distTraveled * dir;

        // Find distance from current position to closest point on a sphere with radius = 1 from the origin
        toClosestDist = mapWorld(currentPos);

		distTraveled += toClosestDist.x;

		candidateError = min(candidateError, toClosestDist.x);
		candidatePos = (candidateError < toClosestDist.x) ? candidatePos : origin + distTraveled * dir;
		candidateObj = (candidateError < toClosestDist.x) ? candidateObj : toClosestDist.y;

		step++;
	}
	
	return (toClosestDist.x > MAX_RAY_DIST) ? getSkyColor(origin, dir) : phongShading(candidatePos, candidateObj, normalize(origin - candidatePos));
}

/*======================================================================================*/
void main()
{
	// Generating a ray from the camera (origin) through every pixel

	// Move center to (0,0)
	vec2 fragPos = (gl_FragCoord.xy/ imageResolution.xy) * 2.0 - 1.0;
	// Correct for image aspect ratio
	fragPos.x *= imageResolution.x / imageResolution.y;

	vec3 rayDir = vec3(inverse(rotMatrix) * vec4(vec3(fragPos, FOV), 1.0));

	float dither = dither(fragPos);

	color = vec4(rayMarch(cameraPosition, normalize(rayDir)) + dither, 1.0);
}