#version 430 core

struct PointLight {    
    vec3 position;
    vec3 color;
};

struct DirectionalLight {    
    vec3 dir;
    vec3 color;
};

vec3 objectColors[] = {
	{0.2, 0.8, 0.3},
	{0.8, 0.7, 0.8},
	{0.7, 0.7, 0.6},
	{0.8, 0.7, 0.8}
	};

#define FLT_MAX 3.402823466e+38
#define PI 3.1415926535897932384626433832795

#define MAX_LIGHTS 3

uniform layout(location = 0) vec2 imageResolution;

uniform layout(location = 1) float time;

uniform layout(location = 2) vec3 cameraPosition;

uniform layout(location = 3) mat4 rotMatrix;

uniform layout(location = 4) int numLights;

uniform PointLight pointLights[MAX_LIGHTS];

const float ambientStrength = 0.35;
const float specularStrength = 0.25;

const float constant = 1.0;
const float linear = 0.020;
const float quadratic = 0.0015;

const float FOV = 2.0;

out vec4 color;
/*======================================================================================*/
// Noise functions

float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }	// from gloom
float dither(vec2 uv) { return (rand(uv)*2.0-1.0) / 256.0; }

// Smoothstep interpolation generates a smooth output from an input between 0 and 1
float interpolateNoise(in vec2 point)
{
	vec2 i = floor(point);
    vec2 f = fract(point);
	vec2 u = f*f*(3.0-2.0*f);

	return -1.0+2.0*mix( 
                mix( rand( i + vec2(0.0,0.0) ), 
                     rand( i + vec2(1.0,0.0) ), 
                     u.x),
                mix( rand( i + vec2(0.0,1.0) ), 
                     rand( i + vec2(1.0,1.0) ), 
                     u.x), 
                u.y);
}

/*======================================================================================*/
// SDF operations

vec2 opIntersect(vec2 distA, vec2 distB) {
    return (distA.x > distB.x) ? distA : distB;
}

vec2 opUnion(vec2 distA, vec2 distB) {
    return (distA.x < distB.x) ? distA : distB;
}

vec2 opDifference(vec2 distA, vec2 distB) {
    return (distA.x > -distB.x) ? distA : vec2(-distB.x, distB.y);
}

float opOnion(in float sdf, in float thickness)
{
    return abs(sdf) - thickness;
}

float opRound(in float SDFdist, in float rad )
{
    return SDFdist - rad;
}

vec3 opRepeatInf(in vec3 point, in vec3 period)
{
	return mod(point + 0.5 * period, period) - 0.5 * period;
}

vec3 opRepeatLim(in vec3 point, in float period, in vec3 length)
{
    return (point - period *clamp(round(point / period), -length, length));
}

//Soft Min function (continuous) Inspired by : https://www.iquilezles.org/www/articles/smin/smin.htm
vec2 sMin(vec2 distA, vec2 distB, float k)
{
    float h = max(k - abs(distA.x - distB.x), 0.0) / k;
    return (distA.x < distB.x) ? vec2(distA.x - h*h*h * k * (1.0/6.0), distA.y) : vec2(distB.x - h*h*h * k * (1.0/6.0), distB.y) ;
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

float cylinderSDF(vec3 p, float radius, float len)
{
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(len, radius);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float torusSDF(vec3 point, vec2 thickness)
{
  vec2 q = vec2(length(point.xz) - thickness.x, point.y);
  return length(q) - thickness.y;
}
/*======================================================================================*/

vec2 mapWorld(in vec3 point)
{
	
	// Ground
	vec3 groundLevel = vec3(0.0, -3.0, 0.0);
    vec2 res = vec2(boxSDF(point - groundLevel,  vec3(50.0, 1.0, 50.0)), 0.0);  // vec2 = [distance, ObjectID]

	/*---------- Roman Column -----------*/
	vec3 columnPoint = opRepeatLim(point, 4.35, vec3(2.0, 0.0, 1.0));
	columnPoint = vec3(columnPoint.x, abs(columnPoint.y) + 0.2, columnPoint.z);
	float angle = 2 * PI / 24.0;
	float sector = round(atan(columnPoint.z, columnPoint.x)/angle);
	vec3 rotatedPoint = columnPoint;
	rotatedPoint.xz = mat2(cos(sector * angle), -sin(sector * angle),
							sin(sector*angle), cos(sector*angle)) * (rotatedPoint.xz);

		// Big column carved out by smaller ones
	vec2 column = opDifference(vec2(cylinderSDF(columnPoint - vec3(0.0, 0.0, 0.0), 2.0, 0.3), 1.0), vec2(cylinderSDF(rotatedPoint - vec3(0.3, 0.0, 0.0), 2.0, 0.02), 1.0));

		// Cylinder top
	column = sMin(column, opDifference(vec2(cylinderSDF(columnPoint - vec3(0.0, 2.0, 0.0), 0.05, 0.45) - 0.02, 1.0), vec2(torusSDF(columnPoint - vec3(0.0, 1.80, 0.0), vec2(0.63, 0.29)), 1.0)), 0.5);

		// Box top
	column = opUnion(column, vec2(boxSDF(columnPoint - vec3(0.0, 2.14, 0.0),  vec3(0.5, 0.08, 0.5)) - 0.02, 1.0));

	column = opDifference(column, vec2(boxSDF(point - vec3(0.0, 0.0, 5.0),  vec3(10.0, 2.5, 2.0)), 1.0));		// Remove one row of columns
	
	res = opUnion(res, column);
	
	/*---------- First level floor -----------*/
	vec3 floorPoint = opRepeatLim(point - vec3(0.0, -2.0, -2.90), 1.45, vec3(7.0, 0.0, 3.0));
	vec2 floor = vec2(boxSDF(floorPoint,  vec3(0.7, 0.05, 0.7)) - 0.03, 2.0);
	floor = opDifference(floor, vec2(boxSDF(point - vec3(0.0, -2.0, -7.27),  vec3(11.0, 0.5, 0.75)), 2.0));		// Remove one row of tiles

	res = opUnion(res, floor);

	/*---------- First level roof -----------*/
	vec3 roofOrigin = vec3(0.0, 2.1, -2.2);
	vec2 roof = vec2(boxSDF(point - roofOrigin,  vec3(9.6, 0.1, 3.0)) - 0.03, 3.0);

	res = opUnion(res, roof);

	return res;
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

vec3 phongShading(in vec3 currentPos, int candidateObj, in vec3 ray)
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

	vec3 combined = (ambient + diffuse) * objectColors[candidateObj] + specular;

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
	int candidateObj = 0;

	while (toClosestDist.x > MIN_HIT_DIST && step < N_STEPS)
	{
		
		// Current position along ray from the origin
        currentPos = origin + distTraveled * dir;

        // Find distance from current position to closest point on a sphere with radius = 1 from the origin
        toClosestDist = mapWorld(currentPos);

		distTraveled += toClosestDist.x;

		candidateError = min(candidateError, toClosestDist.x);
		candidatePos = (candidateError < toClosestDist.x) ? candidatePos : origin + distTraveled * dir;
		candidateObj = (candidateError < toClosestDist.x) ? int(candidateObj) : int(toClosestDist.y);

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